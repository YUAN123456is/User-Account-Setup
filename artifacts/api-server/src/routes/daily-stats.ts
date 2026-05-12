import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray, desc, SQL } from "drizzle-orm";
import { db, dailyStatsTable, accountsTable, usersTable, teamsTable } from "@workspace/db";
import {
  CreateDailyStatBody,
  UpdateDailyStatBody,
  ListDailyStatsQueryParams,
  UpdateDailyStatParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

async function formatStat(stat: typeof dailyStatsTable.$inferSelect) {
  const account = stat.accountId
    ? (await db.select({ accountName: accountsTable.accountName, platformAccountId: accountsTable.platformAccountId, currentBalance: accountsTable.currentBalance }).from(accountsTable).where(eq(accountsTable.id, stat.accountId)))[0]
    : null;
  const pitcher = stat.pitcherId
    ? (await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, stat.pitcherId)))[0]
    : null;
  const team = stat.teamId
    ? (await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, stat.teamId)))[0]
    : null;

  const spend = parseFloat(stat.spendAmount);
  const fanCount = stat.fanCount ?? null;
  const gmv = stat.gmv != null ? parseFloat(stat.gmv) : null;
  const orderCount = stat.orderCount ?? null;

  const fanCost = fanCount && fanCount > 0 ? (spend / fanCount).toFixed(4) : null;
  const roas = gmv != null && spend > 0 ? (gmv / spend).toFixed(4) : null;
  const avgOrderValue = gmv != null && orderCount && orderCount > 0 ? (gmv / orderCount).toFixed(2) : null;

  return {
    id: stat.id,
    accountId: stat.accountId,
    accountName: account?.accountName ?? null,
    platformAccountId: account?.platformAccountId ?? null,
    accountCurrentBalance: account?.currentBalance ?? null,
    date: stat.date,
    spendAmount: stat.spendAmount,
    realBalance: stat.realBalance,
    pitcherId: stat.pitcherId,
    pitcherName: pitcher?.displayName ?? null,
    hasAlert: stat.hasAlert,
    businessType: stat.businessType ?? null,
    teamId: stat.teamId ?? null,
    teamName: team?.name ?? null,
    fanCount: stat.fanCount ?? null,
    fanCost,
    gmv: stat.gmv ?? null,
    orderCount: stat.orderCount ?? null,
    roas,
    avgOrderValue,
    fbSynced: stat.fbSynced,
    status: stat.status,
    reviewNote: stat.reviewNote ?? null,
    createdAt: stat.createdAt.toISOString(),
  };
}

router.get("/daily-stats", requireAuth, async (req, res): Promise<void> => {
  const params = ListDailyStatsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions: SQL[] = [];
  const { role, userId } = req.session as { role?: string; userId?: number };

  if (role === "pitcher") {
    conditions.push(eq(dailyStatsTable.pitcherId, userId!));
  } else if (role === "provider") {
    const providerAccounts = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.providerId, userId!));
    const ids = providerAccounts.map((a) => a.id);
    if (ids.length === 0) { res.json([]); return; }
    conditions.push(inArray(dailyStatsTable.accountId, ids));
  }

  if (params.data.accountId != null) conditions.push(eq(dailyStatsTable.accountId, params.data.accountId));
  if (params.data.pitcherId != null && role === "admin") conditions.push(eq(dailyStatsTable.pitcherId, params.data.pitcherId));
  if (params.data.dateFrom) conditions.push(gte(dailyStatsTable.date, params.data.dateFrom));
  if (params.data.dateTo) conditions.push(lte(dailyStatsTable.date, params.data.dateTo));

  const stats = conditions.length > 0
    ? await db.select().from(dailyStatsTable).where(and(...conditions)).orderBy(desc(dailyStatsTable.date), desc(dailyStatsTable.createdAt))
    : await db.select().from(dailyStatsTable).orderBy(desc(dailyStatsTable.date), desc(dailyStatsTable.createdAt));

  const formatted = await Promise.all(stats.map(formatStat));
  res.json(formatted);
});

// GET /api/daily-stats/pending — admin views pending manual submissions
router.get("/daily-stats/pending", requireRole("admin"), async (req, res): Promise<void> => {
  const stats = await db
    .select()
    .from(dailyStatsTable)
    .where(eq(dailyStatsTable.status, "pending"))
    .orderBy(dailyStatsTable.createdAt);
  const formatted = await Promise.all(stats.map(formatStat));
  res.json(formatted);
});

// POST /api/daily-stats/:id/approve — admin approves
router.post("/daily-stats/:id/approve", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as { note?: string };
  const [stat] = await db
    .update(dailyStatsTable)
    .set({ status: "approved", reviewNote: body.note ?? null })
    .where(eq(dailyStatsTable.id, id))
    .returning();
  if (!stat) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await formatStat(stat));
});

// POST /api/daily-stats/:id/reject — admin rejects
router.post("/daily-stats/:id/reject", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as { note?: string };
  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  // Balance is NOT restored on rejection — the pitcher will edit and resubmit,
  // at which point the spend delta will naturally correct the balance.
  // Restoring here then resubmitting would cause double-addition.
  const [stat] = await db
    .update(dailyStatsTable)
    .set({ status: "rejected", reviewNote: body.note ?? null })
    .where(eq(dailyStatsTable.id, id))
    .returning();

  res.json(await formatStat(stat));
});

// DELETE /api/daily-stats/:id — admin hard-deletes a record (requires admin password)
router.delete("/daily-stats/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as { password?: string };
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || body.password !== adminPassword) {
    res.status(403).json({ error: "密码错误" });
    return;
  }

  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  if (!existing) { res.status(404).json({ error: "记录不存在" }); return; }

  // Restore the account balance: add the spend back
  const spend = parseFloat(existing.spendAmount);
  if (spend > 0 && existing.accountId) {
    const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, existing.accountId));
    if (acct) {
      const restoredCurrent = (parseFloat(acct.currentBalance) + spend).toFixed(2);
      const restoredTheoretical = (parseFloat(acct.theoreticalBalance ?? acct.currentBalance) + spend).toFixed(2);
      await db.update(accountsTable).set({
        currentBalance: restoredCurrent,
        theoreticalBalance: restoredTheoretical,
      }).where(eq(accountsTable.id, existing.accountId));
    }
  }

  await db.delete(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  res.json({ ok: true });
});

router.post("/daily-stats", requireRole("pitcher"), async (req, res): Promise<void> => {
  const parsed = CreateDailyStatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [account] = await db.select().from(accountsTable).where(
    and(eq(accountsTable.id, parsed.data.accountId), eq(accountsTable.pitcherId, req.session.userId!))
  );
  if (!account) {
    res.status(403).json({ error: "Account not assigned to you" });
    return;
  }

  const existing = await db.select({ id: dailyStatsTable.id }).from(dailyStatsTable).where(
    and(eq(dailyStatsTable.accountId, parsed.data.accountId), eq(dailyStatsTable.date, parsed.data.date))
  );
  if (existing.length > 0) {
    res.status(409).json({ error: "该账户今日数据已上报，如需修改请使用编辑功能" });
    return;
  }

  const theoreticalBal = parseFloat(account.theoreticalBalance ?? account.currentBalance);
  const spend = parseFloat(parsed.data.spendAmount);
  const newBalance = (theoreticalBal - spend).toFixed(2);

  const [stat] = await db.insert(dailyStatsTable).values({
    accountId: parsed.data.accountId,
    date: parsed.data.date,
    spendAmount: parsed.data.spendAmount,
    realBalance: newBalance,
    pitcherId: req.session.userId!,
    hasAlert: parseFloat(newBalance) < 100,
    businessType: (parsed.data.businessType as "liveChat" | "ecommerce" | null | undefined) ?? null,
    teamId: parsed.data.teamId ?? null,
    fanCount: parsed.data.fanCount ?? null,
    gmv: parsed.data.gmv ?? null,
    orderCount: parsed.data.orderCount ?? null,
    status: "pending",
    fbSynced: false,
  }).returning();

  await db.update(accountsTable).set({
    currentBalance: newBalance,
    theoreticalBalance: newBalance,
    lastReportedAt: new Date(),
  }).where(eq(accountsTable.id, parsed.data.accountId));

  res.status(201).json(await formatStat(stat));
});

router.patch("/daily-stats/:id", requireRole("pitcher"), async (req, res): Promise<void> => {
  const params = UpdateDailyStatParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateDailyStatBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Stat not found" }); return; }
  if (existing.pitcherId !== req.session.userId!) { res.status(403).json({ error: "Forbidden" }); return; }

  const updates: Partial<typeof dailyStatsTable.$inferInsert> = {};

  if (parsed.data.businessType !== undefined) updates.businessType = (parsed.data.businessType as "liveChat" | "ecommerce" | null | undefined) ?? null;
  if (parsed.data.teamId !== undefined) updates.teamId = parsed.data.teamId ?? null;
  if (parsed.data.fanCount !== undefined) updates.fanCount = parsed.data.fanCount ?? null;
  if (parsed.data.gmv !== undefined) updates.gmv = parsed.data.gmv ?? null;
  if (parsed.data.orderCount !== undefined) updates.orderCount = parsed.data.orderCount ?? null;

  if (parsed.data.spendAmount == null && Object.keys(updates).length === 0) {
    res.json(await formatStat(existing)); return;
  }

  let newRealBalance = existing.realBalance;
  let spendDelta = 0;
  if (parsed.data.spendAmount != null) {
    const oldSpend = parseFloat(existing.spendAmount);
    const newSpend = parseFloat(parsed.data.spendAmount);
    spendDelta = newSpend - oldSpend;
    newRealBalance = (parseFloat(existing.realBalance) - spendDelta).toFixed(2);
    updates.spendAmount = parsed.data.spendAmount;
    updates.realBalance = newRealBalance;
    updates.hasAlert = parseFloat(newRealBalance) < 100;
  }

  // For already-approved records: only a spend change triggers re-review;
  // updating team / biz-type / fan-count / order-count stays approved.
  // For pending / rejected records: any edit resets to pending.
  const spendChanged = parsed.data.spendAmount != null;
  if (existing.status !== "approved" || spendChanged) {
    updates.status = "pending";
    updates.reviewNote = null;
  }

  const [stat] = await db.update(dailyStatsTable).set(updates).where(eq(dailyStatsTable.id, params.data.id)).returning();

  if (spendDelta !== 0) {
    const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, existing.accountId));
    if (acct) {
      const newCurrentBal = (parseFloat(acct.currentBalance) - spendDelta).toFixed(2);
      const newTheoreticalBal = (parseFloat(acct.theoreticalBalance ?? acct.currentBalance) - spendDelta).toFixed(2);
      await db.update(accountsTable).set({ currentBalance: newCurrentBal, theoreticalBalance: newTheoreticalBal }).where(eq(accountsTable.id, existing.accountId));
    }
  }

  res.json(await formatStat(stat));
});

export default router;

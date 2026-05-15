import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray, desc, SQL } from "drizzle-orm";
import { db, dailyStatsTable, accountsTable, usersTable } from "@workspace/db";
import type { TeamBreakdown } from "@workspace/db";
import {
  CreateDailyStatBody,
  UpdateDailyStatBody,
  ListDailyStatsQueryParams,
  UpdateDailyStatParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/require-auth";
import { recalculateBalance, syncAccountBalance } from "../lib/balance";

const router: IRouter = Router();

/**
 * Formats a raw daily_stats DB row into the API response shape.
 *
 * teamBreakdowns: embedded JSON (no extra JOIN needed — team names are stored
 * denormalised at write time).
 *
 * fanCount on the row is the total across all team breakdowns (or the single
 * FB-provided value). fanCost is derived from that total.
 */
async function formatStat(stat: typeof dailyStatsTable.$inferSelect) {
  const account = stat.accountId
    ? (await db.select({ accountName: accountsTable.accountName, platformAccountId: accountsTable.platformAccountId, currentBalance: accountsTable.currentBalance }).from(accountsTable).where(eq(accountsTable.id, stat.accountId)))[0]
    : null;
  const pitcher = stat.pitcherId
    ? (await db.select({ displayName: usersTable.displayName, username: usersTable.username }).from(usersTable).where(eq(usersTable.id, stat.pitcherId)))[0]
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
    pitcherName: pitcher?.displayName ?? pitcher?.username ?? null,
    hasAlert: stat.hasAlert,
    businessType: stat.businessType ?? null,
    teamBreakdowns: (stat.teamBreakdowns as TeamBreakdown[] | null) ?? null,
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
// pending → approved: no balance change (both statuses are counted in the formula).
// rejected → approved: balance DOES change, so sync inside a transaction.
router.post("/daily-stats/:id/approve", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as { note?: string };

  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  let stat: typeof dailyStatsTable.$inferSelect;

  if (existing.status === "rejected" && existing.accountId) {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(dailyStatsTable)
        .set({ status: "approved", reviewNote: body.note ?? null })
        .where(eq(dailyStatsTable.id, id))
        .returning();
      stat = updated;
      await syncAccountBalance(existing.accountId!, tx);
    });
  } else {
    const [updated] = await db
      .update(dailyStatsTable)
      .set({ status: "approved", reviewNote: body.note ?? null })
      .where(eq(dailyStatsTable.id, id))
      .returning();
    stat = updated;
  }

  res.json(await formatStat(stat!));
});

// POST /api/daily-stats/:id/reject — admin rejects
// Rejected records are excluded from balance sum; balance auto-restores via recalculate.
router.post("/daily-stats/:id/reject", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as { note?: string };
  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  let stat: typeof dailyStatsTable.$inferSelect;
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(dailyStatsTable)
      .set({ status: "rejected", reviewNote: body.note ?? null })
      .where(eq(dailyStatsTable.id, id))
      .returning();
    stat = updated;
    if (existing.accountId) {
      await syncAccountBalance(existing.accountId, tx);
    }
  });

  res.json(await formatStat(stat!));
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

  const accountId = existing.accountId;

  await db.transaction(async (tx) => {
    await tx.delete(dailyStatsTable).where(eq(dailyStatsTable.id, id));
    // Deleted records drop out of the balance formula automatically.
    if (accountId) {
      await syncAccountBalance(accountId, tx);
    }
  });

  res.json({ ok: true });
});

// DELETE /api/daily-stats/:id/self — pitcher deletes their own rejected record
router.delete("/daily-stats/:id/self", requireRole("pitcher"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  if (!existing) { res.status(404).json({ error: "记录不存在" }); return; }

  if (existing.pitcherId !== req.session.userId) {
    res.status(403).json({ error: "无权限删除此记录" }); return;
  }
  if (existing.status !== "rejected" || existing.fbSynced) {
    res.status(400).json({ error: "只能删除已驳回且未FB同步的记录" }); return;
  }

  const accountId = existing.accountId;

  await db.transaction(async (tx) => {
    await tx.delete(dailyStatsTable).where(eq(dailyStatsTable.id, id));
    // Record was already rejected (excluded from balance sum), sync for consistency.
    if (accountId) {
      await syncAccountBalance(accountId, tx);
    }
  });

  res.json({ ok: true });
});

/**
 * POST /api/daily-stats — pitcher submits daily spend report.
 *
 * One record per (account, date). teamBreakdowns is an optional JSON array
 * embedded directly in the row (no separate team attribution records).
 *
 * fanCount is derived from teamBreakdowns sum when breakdowns are provided;
 * otherwise taken from the explicit fanCount field.
 */
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
  if (account.status === "banned") {
    res.status(403).json({ error: "该广告账户已封禁，无法提交数据" });
    return;
  }

  // Check for duplicate: one record per (accountId, date)
  const [dup] = await db.select({ id: dailyStatsTable.id }).from(dailyStatsTable).where(
    and(eq(dailyStatsTable.accountId, parsed.data.accountId), eq(dailyStatsTable.date, parsed.data.date))
  );
  if (dup) {
    res.status(409).json({ error: "该账户当日数据已上报，如需修改请使用编辑功能" });
    return;
  }

  const teamBreakdowns = (parsed.data.teamBreakdowns as TeamBreakdown[] | null | undefined) ?? null;
  const spend = parseFloat(parsed.data.spendAmount);

  // fanCount: sum of team breakdown fan counts (liveChat multi-team), or explicit field
  const fanCount = teamBreakdowns && teamBreakdowns.length > 0
    ? (teamBreakdowns.reduce((sum, t) => sum + (t.fanCount ?? 0), 0) || null)
    : (parsed.data.fanCount ?? null);

  let stat!: typeof dailyStatsTable.$inferSelect;
  try {
    await db.transaction(async (tx) => {
      const preBalance = await recalculateBalance(parsed.data.accountId, tx);
      const realBalance = (parseFloat(preBalance) - spend).toFixed(2);

      const [inserted] = await tx.insert(dailyStatsTable).values({
        accountId: parsed.data.accountId,
        date: parsed.data.date,
        spendAmount: spend.toFixed(2),
        realBalance,
        pitcherId: req.session.userId!,
        hasAlert: parseFloat(realBalance) < 100,
        businessType: (parsed.data.businessType as "liveChat" | "ecommerce" | null | undefined) ?? null,
        teamBreakdowns: teamBreakdowns as TeamBreakdown[] | null,
        fanCount,
        gmv: parsed.data.gmv ?? null,
        orderCount: parsed.data.orderCount ?? null,
        status: "pending",
        fbSynced: false,
      }).returning();
      stat = inserted;

      await syncAccountBalance(parsed.data.accountId, tx);
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "该账户当日数据已上报，如需修改请使用编辑功能" });
      return;
    }
    throw err;
  }

  res.status(201).json(await formatStat(stat));
});

/**
 * PATCH /api/daily-stats/:id — pitcher updates a daily stat.
 *
 * Spend changes trigger a balance recalculation.
 * teamBreakdowns can be updated; fanCount is recalculated from breakdowns if provided.
 * Any change resets status to "pending" unless the record is already approved and
 * only metadata (biz type, team breakdowns, fan count, gmv, orderCount) changed.
 */
router.patch("/daily-stats/:id", requireRole("pitcher", "admin"), async (req, res): Promise<void> => {
  const params = UpdateDailyStatParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateDailyStatBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Stat not found" }); return; }
  if (req.session.role !== "admin" && existing.pitcherId !== req.session.userId!) { res.status(403).json({ error: "Forbidden" }); return; }

  const spendChanged = parsed.data.spendAmount != null;

  const updates: Partial<typeof dailyStatsTable.$inferInsert> = {};
  if (parsed.data.businessType !== undefined) updates.businessType = (parsed.data.businessType as "liveChat" | "ecommerce" | null | undefined) ?? null;
  if (parsed.data.gmv !== undefined) updates.gmv = parsed.data.gmv ?? null;
  if (parsed.data.orderCount !== undefined) updates.orderCount = parsed.data.orderCount ?? null;
  if (spendChanged) updates.spendAmount = parsed.data.spendAmount!;

  // Update teamBreakdowns and derive fanCount
  if (parsed.data.teamBreakdowns !== undefined) {
    const tbs = (parsed.data.teamBreakdowns as TeamBreakdown[] | null | undefined) ?? null;
    updates.teamBreakdowns = tbs as TeamBreakdown[] | null;
    if (tbs && tbs.length > 0) {
      const teamSum = tbs.reduce((sum, t) => sum + (t.fanCount ?? 0), 0);
      if (teamSum > 0) {
        // Use the sum of per-team fan counts when teams have them filled in
        updates.fanCount = teamSum;
      } else if (parsed.data.fanCount !== undefined) {
        // No per-team counts — use the explicitly-provided fanCount (e.g. FB-fetched total)
        updates.fanCount = parsed.data.fanCount ?? null;
      }
      // else: nothing provided — preserve existing fanCount in DB
    } else if (parsed.data.fanCount !== undefined) {
      updates.fanCount = parsed.data.fanCount ?? null;
    }
  } else if (parsed.data.fanCount !== undefined) {
    updates.fanCount = parsed.data.fanCount ?? null;
  }

  if (!spendChanged && Object.keys(updates).length === 0) {
    res.json(await formatStat(existing)); return;
  }

  // Reset status to pending if spend changed (always needs re-review), or if a non-admin
  // editor touches a rejected/pending record (pitcher resubmitting after fix).
  // Admin metadata-only edits (e.g. tagging a team) must NOT un-reject or un-approve records.
  const isAdminMetaOnlyEdit = req.session.role === "admin" && !spendChanged;
  if (!isAdminMetaOnlyEdit && (existing.status !== "approved" || spendChanged)) {
    updates.status = "pending";
    updates.reviewNote = null;
  }

  let stat: typeof dailyStatsTable.$inferSelect;

  if (spendChanged && existing.accountId) {
    await db.transaction(async (tx) => {
      const preBalance = await recalculateBalance(existing.accountId!, tx);
      const oldSpendInBalance = existing.status === "rejected" ? 0 : parseFloat(existing.spendAmount);
      const newSpend = parseFloat(parsed.data.spendAmount!);
      const newBalance = (parseFloat(preBalance) - newSpend + oldSpendInBalance).toFixed(2);

      updates.realBalance = newBalance;
      updates.hasAlert = parseFloat(newBalance) < 100;

      const [updated] = await tx
        .update(dailyStatsTable)
        .set(updates)
        .where(eq(dailyStatsTable.id, params.data.id))
        .returning();
      stat = updated;

      await syncAccountBalance(existing.accountId!, tx);
    });
  } else {
    const [updated] = await db.update(dailyStatsTable).set(updates).where(eq(dailyStatsTable.id, params.data.id)).returning();
    stat = updated;
  }

  res.json(await formatStat(stat!));
});

export default router;

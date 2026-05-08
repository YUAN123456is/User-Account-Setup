import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray, SQL } from "drizzle-orm";
import { db, dailyStatsTable, accountsTable, usersTable } from "@workspace/db";
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
    ? (await db.select({ accountName: accountsTable.accountName, platformAccountId: accountsTable.platformAccountId }).from(accountsTable).where(eq(accountsTable.id, stat.accountId)))[0]
    : null;
  const pitcher = stat.pitcherId
    ? (await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, stat.pitcherId)))[0]
    : null;

  return {
    id: stat.id,
    accountId: stat.accountId,
    accountName: account?.accountName ?? null,
    platformAccountId: account?.platformAccountId ?? null,
    date: stat.date,
    spendAmount: stat.spendAmount,
    realBalance: stat.realBalance,
    pitcherId: stat.pitcherId,
    pitcherName: pitcher?.displayName ?? null,
    hasAlert: stat.hasAlert,
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
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(dailyStatsTable.accountId, ids));
  }

  if (params.data.accountId != null) conditions.push(eq(dailyStatsTable.accountId, params.data.accountId));
  if (params.data.pitcherId != null && role === "admin") conditions.push(eq(dailyStatsTable.pitcherId, params.data.pitcherId));
  if (params.data.dateFrom) conditions.push(gte(dailyStatsTable.date, params.data.dateFrom));
  if (params.data.dateTo) conditions.push(lte(dailyStatsTable.date, params.data.dateTo));

  const stats = conditions.length > 0
    ? await db.select().from(dailyStatsTable).where(and(...conditions))
    : await db.select().from(dailyStatsTable);

  const formatted = await Promise.all(stats.map(formatStat));
  res.json(formatted);
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

  const theoreticalBal = parseFloat(account.theoreticalBalance ?? account.currentBalance);
  const spend = parseFloat(parsed.data.spendAmount);

  // System auto-calculates the new balance; pitcher only reports spend amount
  const newBalance = (theoreticalBal - spend).toFixed(2);

  const [stat] = await db.insert(dailyStatsTable).values({
    accountId: parsed.data.accountId,
    date: parsed.data.date,
    spendAmount: parsed.data.spendAmount,
    realBalance: newBalance,
    pitcherId: req.session.userId!,
    hasAlert: false,
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
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDailyStatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof dailyStatsTable.$inferInsert> = {};
  if (parsed.data.spendAmount != null) updates.spendAmount = parsed.data.spendAmount;
  if (parsed.data.realBalance != null) updates.realBalance = parsed.data.realBalance;

  const [stat] = await db.update(dailyStatsTable).set(updates).where(eq(dailyStatsTable.id, params.data.id)).returning();
  if (!stat) {
    res.status(404).json({ error: "Stat not found" });
    return;
  }
  res.json(await formatStat(stat));
});

export default router;

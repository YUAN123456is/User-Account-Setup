import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, accountsTable, usersTable, dailyStatsTable, rechargeOrdersTable } from "@workspace/db";
import { requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

const todayStr = () => new Date().toISOString().slice(0, 10);

router.get("/dashboard/summary", requireRole("admin"), async (_req, res): Promise<void> => {
  const [accountCounts] = await db.select({
    total: sql<number>`count(*)::int`,
    idle: sql<number>`count(*) filter (where ${accountsTable.status} = 'idle')::int`,
    active: sql<number>`count(*) filter (where ${accountsTable.status} = 'active')::int`,
    banned: sql<number>`count(*) filter (where ${accountsTable.status} = 'banned')::int`,
  }).from(accountsTable);

  const [providerCount] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "provider"));
  const [pitcherCount] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "pitcher"));

  const [todaySpend] = await db.select({
    total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text`,
  }).from(dailyStatsTable).where(eq(dailyStatsTable.date, todayStr()));

  const [pendingRecharge] = await db.select({ count: sql<number>`count(*)::int` }).from(rechargeOrdersTable).where(eq(rechargeOrdersTable.status, "pending"));

  const [alertCount] = await db.select({ count: sql<number>`count(*)::int` }).from(dailyStatsTable).where(eq(dailyStatsTable.hasAlert, true));

  res.json({
    totalAccounts: accountCounts?.total ?? 0,
    idleAccounts: accountCounts?.idle ?? 0,
    activeAccounts: accountCounts?.active ?? 0,
    bannedAccounts: accountCounts?.banned ?? 0,
    totalProviders: providerCount?.count ?? 0,
    totalPitchers: pitcherCount?.count ?? 0,
    todayTotalSpend: todaySpend?.total ?? "0",
    pendingRechargeOrders: pendingRecharge?.count ?? 0,
    alertCount: alertCount?.count ?? 0,
  });
});

router.get("/dashboard/spend-by-provider", requireRole("admin"), async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

  const rows = await db
    .select({
      providerId: accountsTable.providerId,
      providerName: usersTable.displayName,
      accountCount: sql<number>`count(distinct ${accountsTable.id})::int`,
    })
    .from(accountsTable)
    .leftJoin(usersTable, eq(accountsTable.providerId, usersTable.id))
    .groupBy(accountsTable.providerId, usersTable.displayName);

  const result = await Promise.all(rows.map(async (row) => {
    const todayQ = db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable)
      .leftJoin(accountsTable, eq(dailyStatsTable.accountId, accountsTable.id))
      .where(and(eq(accountsTable.providerId, row.providerId), eq(dailyStatsTable.date, todayStr())));

    const totalQ = db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable)
      .leftJoin(accountsTable, eq(dailyStatsTable.accountId, accountsTable.id))
      .where(eq(accountsTable.providerId, row.providerId));

    const [[today], [total]] = await Promise.all([todayQ, totalQ]);

    return {
      providerId: row.providerId,
      providerName: row.providerName ?? "Unknown",
      todaySpend: today?.total ?? "0",
      totalSpend: total?.total ?? "0",
      accountCount: row.accountCount,
    };
  }));

  res.json(result);
});

router.get("/dashboard/spend-by-pitcher", requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db
    .select({
      pitcherId: accountsTable.pitcherId,
      pitcherName: usersTable.displayName,
      accountCount: sql<number>`count(distinct ${accountsTable.id})::int`,
    })
    .from(accountsTable)
    .leftJoin(usersTable, eq(accountsTable.pitcherId, usersTable.id))
    .where(sql`${accountsTable.pitcherId} is not null`)
    .groupBy(accountsTable.pitcherId, usersTable.displayName);

  const result = await Promise.all(rows.map(async (row) => {
    if (!row.pitcherId) return null;

    const todayQ = db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable)
      .where(and(eq(dailyStatsTable.pitcherId, row.pitcherId), eq(dailyStatsTable.date, todayStr())));

    const totalQ = db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable)
      .where(eq(dailyStatsTable.pitcherId, row.pitcherId));

    const [[today], [total]] = await Promise.all([todayQ, totalQ]);

    return {
      pitcherId: row.pitcherId,
      pitcherName: row.pitcherName ?? "Unknown",
      todaySpend: today?.total ?? "0",
      totalSpend: total?.total ?? "0",
      accountCount: row.accountCount,
    };
  }));

  res.json(result.filter(Boolean));
});

router.get("/dashboard/cross-report", requireRole("admin"), async (req, res): Promise<void> => {
  const { pitcherId, providerId } = req.query as { pitcherId?: string; providerId?: string };

  const rows = await db
    .select({
      pitcherId: dailyStatsTable.pitcherId,
      pitcherName: usersTable.displayName,
      providerId: accountsTable.providerId,
      totalSpend: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text`,
      accountCount: sql<number>`count(distinct ${dailyStatsTable.accountId})::int`,
    })
    .from(dailyStatsTable)
    .leftJoin(accountsTable, eq(dailyStatsTable.accountId, accountsTable.id))
    .leftJoin(usersTable, eq(dailyStatsTable.pitcherId, usersTable.id))
    .groupBy(dailyStatsTable.pitcherId, usersTable.displayName, accountsTable.providerId);

  const providerIds = [...new Set(rows.map((r) => r.providerId).filter((id): id is number => id != null))];
  const providers = await db.select({ id: usersTable.id, displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.role, "provider"));
  const providerMap = Object.fromEntries(providers.map((p) => [p.id, p.displayName]));

  const result = rows.map((row) => ({
    pitcherId: row.pitcherId,
    pitcherName: row.pitcherName ?? "Unknown",
    providerId: row.providerId ?? 0,
    providerName: providerMap[row.providerId ?? 0] ?? "Unknown",
    totalSpend: row.totalSpend,
    accountCount: row.accountCount,
  })).filter((r) => {
    if (pitcherId && r.pitcherId !== parseInt(pitcherId)) return false;
    if (providerId && r.providerId !== parseInt(providerId)) return false;
    return true;
  });

  res.json(result);
});

router.get("/dashboard/balance-alerts", requireRole("admin"), async (_req, res): Promise<void> => {
  const alerts = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.hasAlert, true));
  const unique = new Map<number, typeof dailyStatsTable.$inferSelect>();
  for (const a of alerts) {
    const existing = unique.get(a.accountId);
    if (!existing || a.createdAt > existing.createdAt) {
      unique.set(a.accountId, a);
    }
  }

  const result = await Promise.all([...unique.values()].map(async (stat) => {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, stat.accountId));
    const pitcher = stat.pitcherId
      ? (await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, stat.pitcherId)))[0]
      : null;

    const theoretical = parseFloat(account?.theoreticalBalance ?? "0");
    const reported = parseFloat(stat.realBalance);
    const discrepancyPct = theoretical > 0 ? Math.abs(theoretical - reported) / theoretical * 100 : 0;

    return {
      accountId: stat.accountId,
      accountName: account?.accountName ?? "Unknown",
      platformAccountId: account?.platformAccountId ?? "",
      pitcherId: stat.pitcherId ?? null,
      pitcherName: pitcher?.displayName ?? null,
      theoreticalBalance: theoretical.toFixed(2),
      reportedBalance: reported.toFixed(2),
      discrepancyPct: Math.round(discrepancyPct * 100) / 100,
      lastReportedAt: stat.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

export default router;

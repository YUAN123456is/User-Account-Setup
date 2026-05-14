import { Router, type IRouter } from "express";
import { eq, sql, and, gte, lte, isNotNull, isNull, SQL } from "drizzle-orm";
import { db, accountsTable, usersTable, dailyStatsTable, rechargeOrdersTable } from "@workspace/db";
import { requireRole } from "../middlewares/require-auth";
import { yesterdayUTC8, nowUTC8 } from "../lib/tz";

const router: IRouter = Router();

const yesterdayStr = yesterdayUTC8;

// ─── Summary ──────────────────────────────────────────────────────────────────
router.get("/dashboard/summary", requireRole("admin"), async (_req, res): Promise<void> => {
  const [accountCounts] = await db.select({
    total: sql<number>`count(*)::int`,
    idle: sql<number>`count(*) filter (where ${accountsTable.status} = 'idle')::int`,
    active: sql<number>`count(*) filter (where ${accountsTable.status} = 'active')::int`,
    banned: sql<number>`count(*) filter (where ${accountsTable.status} = 'banned')::int`,
    totalBalance: sql<string>`coalesce(sum(${accountsTable.currentBalance}), 0)::text`,
  }).from(accountsTable);

  const [providerCount] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "provider"));
  const [pitcherCount] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "pitcher"));

  const [todaySpend] = await db.select({
    total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text`,
  }).from(dailyStatsTable).where(
    and(
      isNull(dailyStatsTable.teamId),
      eq(dailyStatsTable.date, yesterdayStr()),
      eq(dailyStatsTable.status, "approved")
    )
  );

  const [todayRecharge] = await db.select({
    total: sql<string>`coalesce(sum(${rechargeOrdersTable.amount}), 0)::text`,
  }).from(rechargeOrdersTable).where(
    and(
      eq(rechargeOrdersTable.status, "completed"),
      sql`date(${rechargeOrdersTable.updatedAt}) = ${yesterdayStr()}`
    )
  );

  const [pendingRecharge] = await db.select({ count: sql<number>`count(*)::int` }).from(rechargeOrdersTable).where(eq(rechargeOrdersTable.status, "pending"));

  const [lowBalCount] = await db.select({ count: sql<number>`count(*)::int` }).from(accountsTable).where(
    sql`${accountsTable.currentBalance}::numeric < 100`
  );

  res.json({
    totalAccounts: accountCounts?.total ?? 0,
    idleAccounts: accountCounts?.idle ?? 0,
    activeAccounts: accountCounts?.active ?? 0,
    bannedAccounts: accountCounts?.banned ?? 0,
    totalProviders: providerCount?.count ?? 0,
    totalPitchers: pitcherCount?.count ?? 0,
    todayTotalSpend: todaySpend?.total ?? "0",
    totalBalance: accountCounts?.totalBalance ?? "0",
    todayRecharge: todayRecharge?.total ?? "0",
    pendingRechargeOrders: pendingRecharge?.count ?? 0,
    alertCount: lowBalCount?.count ?? 0,
  });
});

// ─── Spend by Provider ────────────────────────────────────────────────────────
router.get("/dashboard/spend-by-provider", requireRole("admin"), async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

  const rows = await db
    .select({
      providerId: accountsTable.providerId,
      providerName: usersTable.displayName,
      accountCount: sql<number>`count(distinct ${accountsTable.id})::int`,
      totalBalance: sql<string>`coalesce(sum(${accountsTable.currentBalance}), 0)::text`,
    })
    .from(accountsTable)
    .leftJoin(usersTable, eq(accountsTable.providerId, usersTable.id))
    .groupBy(accountsTable.providerId, usersTable.displayName);

  const result = await Promise.all(rows.map(async (row) => {
    const dateConds: SQL[] = [eq(accountsTable.providerId, row.providerId)];
    if (dateFrom) dateConds.push(gte(dailyStatsTable.date, dateFrom));
    if (dateTo) dateConds.push(lte(dailyStatsTable.date, dateTo));

    const yesterdayConds: SQL[] = [eq(accountsTable.providerId, row.providerId), eq(dailyStatsTable.date, yesterdayStr())];

    const approvedCond = eq(dailyStatsTable.status, "approved");

    const rangeQ = db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable).leftJoin(accountsTable, eq(dailyStatsTable.accountId, accountsTable.id))
      .where(and(isNull(dailyStatsTable.teamId), ...dateConds, approvedCond));

    const yesterdayQ = db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable).leftJoin(accountsTable, eq(dailyStatsTable.accountId, accountsTable.id))
      .where(and(isNull(dailyStatsTable.teamId), ...yesterdayConds, approvedCond));

    const rechargeConds: SQL[] = [
      eq(accountsTable.providerId, row.providerId),
      eq(rechargeOrdersTable.status, "completed"),
    ];
    if (dateFrom) rechargeConds.push(gte(sql`date(${rechargeOrdersTable.updatedAt})`, dateFrom));
    if (dateTo) rechargeConds.push(lte(sql`date(${rechargeOrdersTable.updatedAt})`, dateTo));

    const yesterdayRechargeConds: SQL[] = [
      eq(accountsTable.providerId, row.providerId),
      eq(rechargeOrdersTable.status, "completed"),
      sql`date(${rechargeOrdersTable.updatedAt}) = ${yesterdayStr()}`,
    ];

    const rechargeQ = db.select({ total: sql<string>`coalesce(sum(${rechargeOrdersTable.amount}), 0)::text` })
      .from(rechargeOrdersTable).leftJoin(accountsTable, eq(rechargeOrdersTable.accountId, accountsTable.id))
      .where(and(...rechargeConds));

    const yesterdayRechargeQ = db.select({ total: sql<string>`coalesce(sum(${rechargeOrdersTable.amount}), 0)::text` })
      .from(rechargeOrdersTable).leftJoin(accountsTable, eq(rechargeOrdersTable.accountId, accountsTable.id))
      .where(and(...yesterdayRechargeConds));

    const [[range], [yesterday], [recharge], [yesterdayRecharge]] = await Promise.all([rangeQ, yesterdayQ, rechargeQ, yesterdayRechargeQ]);

    return {
      providerId: row.providerId,
      providerName: row.providerName ?? "Unknown",
      yesterdaySpend: yesterday?.total ?? "0",
      totalSpend: range?.total ?? "0",
      totalRecharge: recharge?.total ?? "0",
      yesterdayRecharge: yesterdayRecharge?.total ?? "0",
      totalBalance: row.totalBalance ?? "0",
      accountCount: row.accountCount,
    };
  }));

  res.json(result);
});

// ─── Spend by Pitcher ─────────────────────────────────────────────────────────
router.get("/dashboard/spend-by-pitcher", requireRole("admin"), async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

  const rows = await db
    .select({
      pitcherId: accountsTable.pitcherId,
      pitcherName: usersTable.displayName,
      accountCount: sql<number>`count(distinct ${accountsTable.id})::int`,
      totalBalance: sql<string>`coalesce(sum(${accountsTable.currentBalance}), 0)::text`,
    })
    .from(accountsTable)
    .leftJoin(usersTable, eq(accountsTable.pitcherId, usersTable.id))
    .where(isNotNull(accountsTable.pitcherId))
    .groupBy(accountsTable.pitcherId, usersTable.displayName);

  const result = await Promise.all(rows.map(async (row) => {
    if (!row.pitcherId) return null;

    const dateConds: SQL[] = [eq(dailyStatsTable.pitcherId, row.pitcherId)];
    if (dateFrom) dateConds.push(gte(dailyStatsTable.date, dateFrom));
    if (dateTo) dateConds.push(lte(dailyStatsTable.date, dateTo));

    const approvedCond2 = eq(dailyStatsTable.status, "approved");

    const yesterdayQ = db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable)
      .where(and(isNull(dailyStatsTable.teamId), eq(dailyStatsTable.pitcherId, row.pitcherId), eq(dailyStatsTable.date, yesterdayStr()), approvedCond2));

    const rangeQ = db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable).where(and(isNull(dailyStatsTable.teamId), ...dateConds, approvedCond2));

    // Use rechargeOrdersTable.pitcherId (the pitcher who submitted the order)
    // NOT accountsTable.pitcherId (which reflects current assignment and breaks after reassignment)
    const rechargeConds: SQL[] = [
      eq(rechargeOrdersTable.pitcherId, row.pitcherId),
      eq(rechargeOrdersTable.status, "completed"),
    ];
    if (dateFrom) rechargeConds.push(gte(sql`date(${rechargeOrdersTable.updatedAt})`, dateFrom));
    if (dateTo) rechargeConds.push(lte(sql`date(${rechargeOrdersTable.updatedAt})`, dateTo));

    const yesterdayRechargeConds: SQL[] = [
      eq(rechargeOrdersTable.pitcherId, row.pitcherId),
      eq(rechargeOrdersTable.status, "completed"),
      sql`date(${rechargeOrdersTable.updatedAt}) = ${yesterdayStr()}`,
    ];

    const rechargeQ = db.select({ total: sql<string>`coalesce(sum(${rechargeOrdersTable.amount}), 0)::text` })
      .from(rechargeOrdersTable)
      .where(and(...rechargeConds));

    const yesterdayRechargeQ = db.select({ total: sql<string>`coalesce(sum(${rechargeOrdersTable.amount}), 0)::text` })
      .from(rechargeOrdersTable)
      .where(and(...yesterdayRechargeConds));

    const [[yesterday], [range], [recharge], [yesterdayRecharge]] = await Promise.all([yesterdayQ, rangeQ, rechargeQ, yesterdayRechargeQ]);

    return {
      pitcherId: row.pitcherId,
      pitcherName: row.pitcherName ?? "Unknown",
      yesterdaySpend: yesterday?.total ?? "0",
      totalSpend: range?.total ?? "0",
      totalRecharge: recharge?.total ?? "0",
      yesterdayRecharge: yesterdayRecharge?.total ?? "0",
      totalBalance: row.totalBalance ?? "0",
      accountCount: row.accountCount,
    };
  }));

  res.json(result.filter(Boolean));
});

// ─── Pitcher Account Detail ───────────────────────────────────────────────────
router.get("/dashboard/pitcher-accounts", requireRole("admin"), async (req, res): Promise<void> => {
  const { pitcherId, dateFrom, dateTo } = req.query as { pitcherId?: string; dateFrom?: string; dateTo?: string };
  if (!pitcherId) { res.status(400).json({ error: "pitcherId required" }); return; }

  const accounts = await db.select().from(accountsTable).where(eq(accountsTable.pitcherId, Number(pitcherId)));

  const result = await Promise.all(accounts.map(async (acc) => {
    const dateConds: SQL[] = [eq(dailyStatsTable.accountId, acc.id)];
    if (dateFrom) dateConds.push(gte(dailyStatsTable.date, dateFrom));
    if (dateTo) dateConds.push(lte(dailyStatsTable.date, dateTo));

    const approvedCond3 = eq(dailyStatsTable.status, "approved");

    const [yesterday] = await db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable).where(and(isNull(dailyStatsTable.teamId), eq(dailyStatsTable.accountId, acc.id), eq(dailyStatsTable.date, yesterdayStr()), approvedCond3));

    const [range] = await db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable).where(and(isNull(dailyStatsTable.teamId), ...dateConds, approvedCond3));

    return {
      accountId: acc.id,
      accountName: acc.accountName,
      platformAccountId: acc.platformAccountId,
      platform: acc.platform,
      status: acc.status,
      currentBalance: acc.currentBalance,
      yesterdaySpend: yesterday?.total ?? "0",
      totalSpend: range?.total ?? "0",
    };
  }));

  res.json(result);
});

// ─── Provider Account Detail ──────────────────────────────────────────────────
router.get("/dashboard/provider-accounts", requireRole("admin"), async (req, res): Promise<void> => {
  const { providerId, dateFrom, dateTo } = req.query as { providerId?: string; dateFrom?: string; dateTo?: string };
  if (!providerId) { res.status(400).json({ error: "providerId required" }); return; }

  const accounts = await db.select({
    account: accountsTable,
    pitcherName: usersTable.displayName,
  }).from(accountsTable)
    .leftJoin(usersTable, eq(accountsTable.pitcherId, usersTable.id))
    .where(eq(accountsTable.providerId, Number(providerId)));

  const result = await Promise.all(accounts.map(async ({ account: acc, pitcherName }) => {
    const dateConds: SQL[] = [eq(dailyStatsTable.accountId, acc.id)];
    if (dateFrom) dateConds.push(gte(dailyStatsTable.date, dateFrom));
    if (dateTo) dateConds.push(lte(dailyStatsTable.date, dateTo));

    const approvedCond4 = eq(dailyStatsTable.status, "approved");

    const [yesterday] = await db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable).where(and(isNull(dailyStatsTable.teamId), eq(dailyStatsTable.accountId, acc.id), eq(dailyStatsTable.date, yesterdayStr()), approvedCond4));

    const [range] = await db.select({ total: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text` })
      .from(dailyStatsTable).where(and(isNull(dailyStatsTable.teamId), ...dateConds, approvedCond4));

    return {
      accountId: acc.id,
      accountName: acc.accountName,
      platformAccountId: acc.platformAccountId,
      platform: acc.platform,
      status: acc.status,
      currentBalance: acc.currentBalance,
      yesterdaySpend: yesterday?.total ?? "0",
      totalSpend: range?.total ?? "0",
      pitcherName: pitcherName ?? null,
    };
  }));

  res.json(result);
});

// ─── Low Balance Alerts ───────────────────────────────────────────────────────
router.get("/dashboard/low-balance-alerts", requireRole("admin"), async (req, res): Promise<void> => {
  const threshold = Number(req.query.threshold ?? 100);

  const rows = await db.select({
    account: accountsTable,
    pitcherName: sql<string | null>`pitcher.display_name`,
    providerName: sql<string | null>`provider.display_name`,
  })
    .from(accountsTable)
    .leftJoin(sql`users pitcher`, sql`pitcher.id = ${accountsTable.pitcherId}`)
    .leftJoin(sql`users provider`, sql`provider.id = ${accountsTable.providerId}`)
    .where(sql`${accountsTable.currentBalance}::numeric < ${threshold}`)
    .orderBy(sql`${accountsTable.currentBalance}::numeric asc`);

  res.json(rows.map(({ account: acc, pitcherName, providerName }) => ({
    accountId: acc.id,
    accountName: acc.accountName,
    platformAccountId: acc.platformAccountId,
    platform: acc.platform,
    pitcherName: pitcherName ?? null,
    providerName: providerName ?? null,
    currentBalance: acc.currentBalance,
    lastReportedAt: acc.lastReportedAt?.toISOString() ?? null,
  })));
});

// ─── Overdue Alerts ───────────────────────────────────────────────────────────
router.get("/dashboard/overdue-alerts", requireRole("admin"), async (req, res): Promise<void> => {
  const days = Number(req.query.days ?? 3);
  const cutoff = nowUTC8();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const rows = await db.select({
    account: accountsTable,
    pitcherName: sql<string | null>`pitcher.display_name`,
    providerName: sql<string | null>`provider.display_name`,
  })
    .from(accountsTable)
    .leftJoin(sql`users pitcher`, sql`pitcher.id = ${accountsTable.pitcherId}`)
    .leftJoin(sql`users provider`, sql`provider.id = ${accountsTable.providerId}`)
    .where(
      and(
        isNotNull(accountsTable.pitcherId),
        sql`(${accountsTable.lastReportedAt} is null or ${accountsTable.lastReportedAt} < ${cutoff.toISOString()})`
      )
    )
    .orderBy(accountsTable.lastReportedAt);

  const now = Date.now();
  res.json(rows.map(({ account: acc, pitcherName, providerName }) => {
    const lastMs = acc.lastReportedAt ? acc.lastReportedAt.getTime() : 0;
    const daysSince = acc.lastReportedAt ? Math.floor((now - lastMs) / 86400000) : 999;
    return {
      accountId: acc.id,
      accountName: acc.accountName,
      platformAccountId: acc.platformAccountId,
      platform: acc.platform,
      pitcherName: pitcherName ?? null,
      providerName: providerName ?? null,
      currentBalance: acc.currentBalance,
      lastReportedAt: acc.lastReportedAt?.toISOString() ?? null,
      daysSinceReport: daysSince,
    };
  }));
});

// ─── Daily Trend ──────────────────────────────────────────────────────────────
router.get("/dashboard/daily-trend", requireRole("admin"), async (req, res): Promise<void> => {
  const days = Number(req.query.days ?? 30);
  const cutoff = nowUTC8();
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await db.select({
    date: dailyStatsTable.date,
    totalSpend: sql<string>`coalesce(sum(${dailyStatsTable.spendAmount}), 0)::text`,
  })
    .from(dailyStatsTable)
    .where(and(
      isNull(dailyStatsTable.teamId),
      gte(dailyStatsTable.date, cutoffStr),
      eq(dailyStatsTable.status, "approved")
    ))
    .groupBy(dailyStatsTable.date)
    .orderBy(dailyStatsTable.date);

  // Fill gaps with zero
  const map = new Map(rows.map((r) => [r.date, r.totalSpend]));
  const result: { date: string; totalSpend: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff);
    d.setUTCDate(cutoff.getUTCDate() + i);
    const ds = d.toISOString().slice(0, 10);
    result.push({ date: ds, totalSpend: map.get(ds) ?? "0" });
  }

  res.json(result);
});

// ─── Cross Report ─────────────────────────────────────────────────────────────
router.get("/dashboard/cross-report", requireRole("admin"), async (req, res): Promise<void> => {
  const { pitcherId, providerId, dateFrom, dateTo } = req.query as { pitcherId?: string; providerId?: string; dateFrom?: string; dateTo?: string };

  const dateConds: SQL[] = [];
  if (dateFrom) dateConds.push(gte(dailyStatsTable.date, dateFrom));
  if (dateTo) dateConds.push(lte(dailyStatsTable.date, dateTo));

  const approvedCond = eq(dailyStatsTable.status, "approved");
  // Always filter to main records only (teamId IS NULL) — team attribution records carry spend=0
  // but excluding them explicitly makes the query correct regardless of data integrity.
  const crossWhere = and(isNull(dailyStatsTable.teamId), ...(dateConds.length > 0 ? dateConds : []), approvedCond);

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
    .where(crossWhere)
    .groupBy(dailyStatsTable.pitcherId, usersTable.displayName, accountsTable.providerId);

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

// ─── Balance Alerts (legacy discrepancy-based, kept for compat) ───────────────
router.get("/dashboard/balance-alerts", requireRole("admin"), async (_req, res): Promise<void> => {
  const alerts = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.hasAlert, true));
  const unique = new Map<number, typeof dailyStatsTable.$inferSelect>();
  for (const a of alerts) {
    const existing = unique.get(a.accountId);
    if (!existing || a.createdAt > existing.createdAt) unique.set(a.accountId, a);
  }

  const result = await Promise.all([...unique.values()].map(async (stat) => {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, stat.accountId));
    const pitcher = stat.pitcherId
      ? (await db.select({ displayName: usersTable.displayName, username: usersTable.username }).from(usersTable).where(eq(usersTable.id, stat.pitcherId)))[0]
      : null;
    const theoretical = parseFloat(account?.theoreticalBalance ?? "0");
    const reported = parseFloat(stat.realBalance);
    const discrepancyPct = theoretical > 0 ? Math.abs(theoretical - reported) / theoretical * 100 : 0;
    return {
      accountId: stat.accountId,
      accountName: account?.accountName ?? "Unknown",
      platformAccountId: account?.platformAccountId ?? "",
      pitcherId: stat.pitcherId ?? null,
      pitcherName: pitcher?.displayName ?? pitcher?.username ?? null,
      theoreticalBalance: theoretical.toFixed(2),
      reportedBalance: reported.toFixed(2),
      discrepancyPct: Math.round(discrepancyPct * 100) / 100,
      lastReportedAt: stat.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

export default router;

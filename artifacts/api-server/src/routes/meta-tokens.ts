import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, metaTokensTable, facebookDailySpendTable, accountsTable, usersTable, dailyStatsTable } from "@workspace/db";
import { requireRole } from "../middlewares/require-auth";
import { logger } from "../lib/logger";
import { yesterdayUTC8 } from "../lib/tz";

const router: IRouter = Router();

const META_GRAPH = "https://graph.facebook.com/v21.0";

export function yesterday() {
  return yesterdayUTC8();
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function normalizeAccountId(id: string) {
  return id.replace(/^act_/, "");
}

interface FbAction { action_type: string; value: string }

interface MetaAdAccount {
  account_id: string;
  name: string;
  currency?: string;
  insights?: { data: Array<{ spend: string; actions?: FbAction[] }> };
}

async function fetchAdAccountsWithSpendForDate(accessToken: string, date: string): Promise<MetaAdAccount[]> {
  const timeRange = encodeURIComponent(JSON.stringify({ since: date, until: date }));
  const fields = `account_id,name,currency,insights.time_range(${timeRange}){spend,actions}`;
  const firstUrl = `${META_GRAPH}/me/adaccounts?fields=${fields}&limit=500&access_token=${encodeURIComponent(accessToken)}`;

  const all: MetaAdAccount[] = [];
  let nextUrl: string | null = firstUrl;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const json = await res.json() as {
      data?: MetaAdAccount[];
      error?: { message: string };
      paging?: { next?: string };
    };
    if (json.error) throw new Error(json.error.message);
    if (json.data) all.push(...json.data);
    nextUrl = json.paging?.next ?? null;
  }

  return all;
}

/** 从 FB actions 数组中取特定 action_type 的整数值，不存在时返回 null */
function getActionValue(actions: FbAction[], type: string): number | null {
  const found = actions.find((a) => a.action_type === type);
  if (!found) return null;
  const v = parseInt(found.value, 10);
  return isNaN(v) ? null : v;
}

/**
 * 推断业务类型及成效数据：
 * - 有购买 (offsite_conversion.fb_pixel_purchase) → 独立站，orderCount
 * - 有发起消息 (onsite_conversion.messaging_conversation_started_7d) → 聊单，fanCount
 * - 两者都有时购买优先（像素更精确）
 */
function parseConversions(actions: FbAction[]): {
  businessType: "liveChat" | "ecommerce" | null;
  fanCount: number | null;
  orderCount: number | null;
} {
  const purchases = getActionValue(actions, "offsite_conversion.fb_pixel_purchase");
  const messages = getActionValue(actions, "onsite_conversion.messaging_conversation_started_7d");

  if (purchases !== null && purchases > 0) {
    return { businessType: "ecommerce", fanCount: null, orderCount: purchases };
  }
  if (messages !== null && messages > 0) {
    return { businessType: "liveChat", fanCount: messages, orderCount: null };
  }
  return { businessType: null, fanCount: null, orderCount: null };
}

export interface SyncDayResult {
  date: string;
  synced: number;
  matched: number;
  unmatched: number;
  errors: string[];
  accounts: Array<{ fbAccountId: string; fbAccountName: string; spend: string; matched: boolean; systemAccountName?: string; businessType?: string | null; fanCount?: number | null; orderCount?: number | null }>;
}

export async function runFbSync(dateFrom: string, dateTo: string, pitcherIdFilter?: number): Promise<SyncDayResult[]> {
  const tokens = await db.select().from(metaTokensTable).where(
    pitcherIdFilter != null
      ? and(eq(metaTokensTable.isActive, true), eq(metaTokensTable.pitcherId, pitcherIdFilter))
      : eq(metaTokensTable.isActive, true)
  );
  const fbAccounts = await db.select().from(accountsTable).where(eq(accountsTable.platform, "FB"));
  const dates = dateRange(dateFrom, dateTo);
  const results: SyncDayResult[] = [];

  for (const syncDate of dates) {
    let totalSynced = 0;
    let totalMatched = 0;
    let totalUnmatched = 0;
    const errors: string[] = [];
    const accountSummary: SyncDayResult["accounts"] = [];

    for (const token of tokens) {
      try {
        const adAccounts = await fetchAdAccountsWithSpendForDate(token.accessToken, syncDate);

        for (const adAcc of adAccounts) {
          const insightRow = adAcc.insights?.data?.[0];
          const spend = insightRow?.spend ?? "0";
          const currency = adAcc.currency ?? "USD";
          const fbId = normalizeAccountId(adAcc.account_id);
          const { businessType: fbBizType, fanCount: fbFanCount, orderCount: fbOrderCount } =
            parseConversions(insightRow?.actions ?? []);

          // Zero-spend records carry no useful data — skip everything
          const spendNum = parseFloat(spend || "0");
          if (spendNum === 0) {
            totalSynced++;
            accountSummary.push({ fbAccountId: fbId, fbAccountName: adAcc.name, spend, matched: false, businessType: null, fanCount: null, orderCount: null });
            continue;
          }

          let matchedAccount = fbAccounts.find(
            (a) => a.platformAccountId && normalizeAccountId(a.platformAccountId) === fbId
          );
          if (!matchedAccount) {
            const nameLower = adAcc.name.trim().toLowerCase();
            matchedAccount = fbAccounts.find(
              (a) => a.accountName.trim().toLowerCase() === nameLower
            );
          }

          // Upsert facebook_daily_spend staging table
          await db
            .insert(facebookDailySpendTable)
            .values({
              date: syncDate,
              fbAccountId: fbId,
              fbAccountName: adAcc.name,
              spend,
              currency,
              tokenId: token.id,
              matchedAccountId: matchedAccount?.id ?? null,
            })
            .onConflictDoUpdate({
              target: [facebookDailySpendTable.date, facebookDailySpendTable.fbAccountId],
              set: {
                fbAccountName: adAcc.name,
                spend,
                currency,
                tokenId: token.id,
                matchedAccountId: matchedAccount?.id ?? null,
                syncedAt: new Date(),
              },
            });

          // Write to daily_stats — FB data is always authoritative
          if (matchedAccount) {
            const [existing] = await db
              .select()
              .from(dailyStatsTable)
              .where(
                and(
                  eq(dailyStatsTable.accountId, matchedAccount.id),
                  eq(dailyStatsTable.date, syncDate)
                )
              );

            if (!existing) {
              // No record — create auto-approved
              const pitcherIdForStat = matchedAccount.pitcherId ?? token.pitcherId;
              if (pitcherIdForStat == null) {
                errors.push(`账户「${matchedAccount.accountName}」无归属投手且 Token 无绑定投手，跳过写入`);
                totalUnmatched++;
                continue;
              }
              // Re-fetch balance from DB — fbAccounts is loaded once before the loop
              // so matchedAccount.currentBalance is stale after the first date is processed.
              const [freshAcct] = await db.select({ currentBalance: accountsTable.currentBalance })
                .from(accountsTable).where(eq(accountsTable.id, matchedAccount.id));
              const currentBal = parseFloat(freshAcct?.currentBalance ?? matchedAccount.currentBalance ?? "0");
              const newBalance = (currentBal - spendNum).toFixed(2);
              await db.insert(dailyStatsTable).values({
                accountId: matchedAccount.id,
                date: syncDate,
                spendAmount: spendNum.toFixed(2),
                realBalance: newBalance,
                pitcherId: pitcherIdForStat,
                hasAlert: parseFloat(newBalance) < 100,
                fbSynced: true,
                status: "approved" as const,
                ...(fbBizType != null ? { businessType: fbBizType } : {}),
                ...(fbFanCount != null ? { fanCount: fbFanCount } : {}),
                ...(fbOrderCount != null ? { orderCount: fbOrderCount } : {}),
              });
              await db.update(accountsTable).set({
                currentBalance: newBalance,
                theoreticalBalance: newBalance,
                lastReportedAt: new Date(),
              }).where(eq(accountsTable.id, matchedAccount.id));
            } else {
              // Record exists — FB data always wins (overwrite spend/conversions, update balance delta)
              const oldSpend = parseFloat(existing.spendAmount ?? "0");
              const delta = spendNum - oldSpend;
              const newBalance = (parseFloat(existing.realBalance ?? "0") - delta).toFixed(2);
              await db.update(dailyStatsTable).set({
                spendAmount: spendNum.toFixed(2),
                realBalance: newBalance,
                hasAlert: parseFloat(newBalance) < 100,
                fbSynced: true,
                status: "approved" as const,
                ...(fbBizType != null ? { businessType: fbBizType } : {}),
                ...(fbFanCount != null ? { fanCount: fbFanCount } : { fanCount: null }),
                ...(fbOrderCount != null ? { orderCount: fbOrderCount } : { orderCount: null }),
              }).where(eq(dailyStatsTable.id, existing.id));

              if (delta !== 0) {
                const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, matchedAccount.id));
                if (acct) {
                  const newCurrent = (parseFloat(acct.currentBalance ?? "0") - delta).toFixed(2);
                  const newTheo = (parseFloat(acct.theoreticalBalance ?? acct.currentBalance ?? "0") - delta).toFixed(2);
                  await db.update(accountsTable).set({
                    currentBalance: newCurrent,
                    theoreticalBalance: newTheo,
                    lastReportedAt: new Date(),
                  }).where(eq(accountsTable.id, matchedAccount.id));
                }
              }
            }

            totalMatched++;
            accountSummary.push({ fbAccountId: fbId, fbAccountName: adAcc.name, spend, matched: true, systemAccountName: matchedAccount.accountName, businessType: fbBizType, fanCount: fbFanCount, orderCount: fbOrderCount });
          } else {
            totalUnmatched++;
            accountSummary.push({ fbAccountId: fbId, fbAccountName: adAcc.name, spend, matched: false });
          }

          totalSynced++;
        }

        await db.update(metaTokensTable)
          .set({
            lastSyncAt: new Date(),
            lastSyncResult: `成功：${syncDate} 拉取 ${adAccounts.length} 个账户`,
          })
          .where(eq(metaTokensTable.id, token.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Token「${token.label}」: ${msg}`);
        await db.update(metaTokensTable)
          .set({ lastSyncAt: new Date(), lastSyncResult: `失败：${msg}` })
          .where(eq(metaTokensTable.id, token.id));
      }
    }

    results.push({ date: syncDate, synced: totalSynced, matched: totalMatched, unmatched: totalUnmatched, errors, accounts: accountSummary });
  }

  return results;
}

// GET /api/meta-tokens
router.get("/meta-tokens", requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: metaTokensTable.id,
      pitcherId: metaTokensTable.pitcherId,
      pitcherName: usersTable.displayName,
      label: metaTokensTable.label,
      isActive: metaTokensTable.isActive,
      lastSyncAt: metaTokensTable.lastSyncAt,
      lastSyncResult: metaTokensTable.lastSyncResult,
      createdAt: metaTokensTable.createdAt,
    })
    .from(metaTokensTable)
    .leftJoin(usersTable, eq(metaTokensTable.pitcherId, usersTable.id))
    .orderBy(metaTokensTable.createdAt);
  res.json(rows);
});

// POST /api/meta-tokens
router.post("/meta-tokens", requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const pitcherId = typeof body.pitcherId === "number" ? body.pitcherId : null;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  if (!pitcherId || !label || !accessToken) {
    res.status(400).json({ error: "pitcherId, label, accessToken are required" }); return;
  }
  const [row] = await db.insert(metaTokensTable).values({ pitcherId, label, accessToken }).returning();
  res.status(201).json(row);
});

// PUT /api/meta-tokens/:id
router.put("/meta-tokens/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof metaTokensTable.$inferInsert> = {};
  if (typeof body.label === "string") updates.label = body.label.trim();
  if (typeof body.accessToken === "string") updates.accessToken = body.accessToken.trim();
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
  if (typeof body.pitcherId === "number") updates.pitcherId = body.pitcherId;
  const [row] = await db.update(metaTokensTable).set(updates).where(eq(metaTokensTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /api/meta-tokens/:id
router.delete("/meta-tokens/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  await db.delete(metaTokensTable).where(eq(metaTokensTable.id, id));
  res.status(204).end();
});

// POST /api/meta-tokens/sync — manual or range sync
router.post("/meta-tokens/sync", requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const dateFrom = typeof body.dateFrom === "string" ? body.dateFrom : (typeof body.date === "string" ? body.date : yesterday());
  const dateTo = typeof body.dateTo === "string" ? body.dateTo : dateFrom;

  logger.info({ dateFrom, dateTo }, "Manual FB sync triggered");
  const results = await runFbSync(dateFrom, dateTo);
  const totals = results.reduce(
    (acc, r) => ({ synced: acc.synced + r.synced, matched: acc.matched + r.matched, unmatched: acc.unmatched + r.unmatched, errors: [...acc.errors, ...r.errors] }),
    { synced: 0, matched: 0, unmatched: 0, errors: [] as string[] }
  );
  res.json({ dateFrom, dateTo, days: results.length, ...totals, results });
});

// GET /api/meta-tokens/spend
router.get("/meta-tokens/spend", requireRole("admin"), async (req, res): Promise<void> => {
  const query = req.query as Record<string, unknown>;
  const date = typeof query.date === "string" ? query.date : yesterday();

  const rows = await db
    .select({
      id: facebookDailySpendTable.id,
      date: facebookDailySpendTable.date,
      fbAccountId: facebookDailySpendTable.fbAccountId,
      fbAccountName: facebookDailySpendTable.fbAccountName,
      spend: facebookDailySpendTable.spend,
      currency: facebookDailySpendTable.currency,
      matchedAccountId: facebookDailySpendTable.matchedAccountId,
      matchedAccountName: accountsTable.accountName,
      syncedAt: facebookDailySpendTable.syncedAt,
    })
    .from(facebookDailySpendTable)
    .leftJoin(accountsTable, eq(facebookDailySpendTable.matchedAccountId, accountsTable.id))
    .where(eq(facebookDailySpendTable.date, date))
    .orderBy(facebookDailySpendTable.fbAccountName);

  res.json(rows);
});

export default router;

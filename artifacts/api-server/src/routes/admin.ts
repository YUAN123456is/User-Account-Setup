import { Router, type IRouter } from "express";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { db, dailyStatsTable, facebookDailySpendTable } from "@workspace/db";
import { requireRole } from "../middlewares/require-auth";
import { logger } from "../lib/logger";
import { syncAccountBalance } from "../lib/balance";

const router: IRouter = Router();

/**
 * POST /api/admin/restore-zeroed-spends
 *
 * One-time recovery: a previous startup function zeroed spend_amount on
 * legacy team attribution records (fbSynced=true, teamId IS NOT NULL).
 * Restores spend from facebook_daily_spend staging table for data accuracy.
 *
 * NOTE: Under the current balance model, team attribution records (teamId IS NOT NULL)
 * are excluded from the balance formula. Restoring their spend_amount affects reporting
 * accuracy but does NOT directly affect account balances. We call syncAccountBalance
 * for each affected account anyway to ensure current_balance is authoritative.
 */
router.post("/admin/restore-zeroed-spends", requireRole("admin"), async (req, res): Promise<void> => {
  const candidates = await db
    .select()
    .from(dailyStatsTable)
    .where(
      and(
        eq(dailyStatsTable.fbSynced, true),
        isNotNull(dailyStatsTable.teamId),
        sql`${dailyStatsTable.spendAmount} = 0`,
      ),
    );

  type ReportRow = {
    recordId: number;
    accountId: number | null;
    date: string;
    restoredSpend: string;
    skipped: boolean;
    reason?: string;
  };
  const report: ReportRow[] = [];
  const affectedAccounts = new Set<number>();

  for (const rec of candidates) {
    if (!rec.accountId || !rec.date) {
      report.push({ recordId: rec.id, accountId: rec.accountId, date: rec.date ?? "", restoredSpend: "0", skipped: true, reason: "Missing accountId or date" });
      continue;
    }

    const [staging] = await db
      .select({ spend: facebookDailySpendTable.spend })
      .from(facebookDailySpendTable)
      .where(
        and(
          eq(facebookDailySpendTable.matchedAccountId, rec.accountId),
          eq(facebookDailySpendTable.date, rec.date),
        ),
      );

    const stagingSpend = staging ? parseFloat(staging.spend ?? "0") : 0;
    if (stagingSpend <= 0) {
      report.push({ recordId: rec.id, accountId: rec.accountId, date: rec.date, restoredSpend: "0", skipped: true, reason: "No FB staging data or spend=0" });
      continue;
    }

    await db
      .update(dailyStatsTable)
      .set({ spendAmount: stagingSpend.toFixed(2) })
      .where(eq(dailyStatsTable.id, rec.id));

    affectedAccounts.add(rec.accountId);
    report.push({ recordId: rec.id, accountId: rec.accountId, date: rec.date, restoredSpend: stagingSpend.toFixed(2), skipped: false });
  }

  // Recalculate balance from source of truth for all affected accounts.
  // Team records don't affect balance (they're excluded from the balance formula),
  // but we sync anyway to correct any prior drift.
  for (const accountId of affectedAccounts) {
    await syncAccountBalance(accountId);
    logger.info({ accountId }, "Balance resynced after restore-zeroed-spends");
  }

  const restored = report.filter((r) => !r.skipped).length;
  const skipped = report.filter((r) => r.skipped).length;
  logger.info({ restored, skipped }, "restore-zeroed-spends complete");
  res.json({ ok: true, restored, skipped, report });
});

export default router;

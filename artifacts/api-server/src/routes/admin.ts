import { Router, type IRouter } from "express";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { db, dailyStatsTable, accountsTable, facebookDailySpendTable } from "@workspace/db";
import { requireRole } from "../middlewares/require-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /api/admin/restore-zeroed-spends
 *
 * One-time recovery: a previous startup function (`fixTeamRecordSpend`) incorrectly
 * zeroed spend_amount on legacy team attribution records (teamId IS NOT NULL, fbSynced=true).
 * This endpoint:
 *  1. Finds those zeroed records
 *  2. Restores spend_amount from the facebook_daily_spend staging table
 *  3. For accounts with NO main record (teamId IS NULL) on that date, corrects the
 *     over-inflated account balance by deducting the restored spend.
 */
router.post("/admin/restore-zeroed-spends", requireRole("admin"), async (req, res): Promise<void> => {
  // Use raw SQL for the initial filter to avoid Drizzle decimal comparison quirks
  const candidateRows = await db.execute<{
    id: number;
    account_id: number;
    date: string;
    team_id: number;
    spend_amount: string;
    real_balance: string;
  }>(sql`
    SELECT id, account_id, date, team_id, spend_amount, real_balance
    FROM daily_stats
    WHERE fb_synced = true
      AND team_id IS NOT NULL
      AND spend_amount = 0
  `);

  const candidates = candidateRows.rows;

  type ReportRow = {
    recordId: number;
    accountId: number;
    date: string;
    restoredSpend: string;
    balanceAdjusted: boolean;
    skipped: boolean;
    reason?: string;
  };
  const report: ReportRow[] = [];

  // Accumulate balance deductions per account (only for accounts with no main record)
  const balanceDeltas = new Map<number, number>();

  for (const rec of candidates) {
    if (!rec.account_id || !rec.date) {
      report.push({ recordId: rec.id, accountId: rec.account_id, date: rec.date, restoredSpend: "0", balanceAdjusted: false, skipped: true, reason: "Missing accountId or date" });
      continue;
    }

    // Look up FB staging spend for this account + date
    const [staging] = await db
      .select({ spend: facebookDailySpendTable.spend })
      .from(facebookDailySpendTable)
      .where(
        and(
          eq(facebookDailySpendTable.matchedAccountId, rec.account_id),
          eq(facebookDailySpendTable.date, rec.date),
        ),
      );

    const stagingSpend = staging ? parseFloat(staging.spend ?? "0") : 0;
    if (stagingSpend <= 0) {
      report.push({ recordId: rec.id, accountId: rec.account_id, date: rec.date, restoredSpend: "0", balanceAdjusted: false, skipped: true, reason: "No FB staging data or spend=0" });
      continue;
    }

    // Restore spend_amount on the team record
    await db
      .update(dailyStatsTable)
      .set({ spendAmount: stagingSpend.toFixed(2) })
      .where(eq(dailyStatsTable.id, rec.id));

    // Check if a main record (teamId IS NULL) exists for this account + date
    const [mainRecord] = await db
      .select({ id: dailyStatsTable.id })
      .from(dailyStatsTable)
      .where(
        and(
          eq(dailyStatsTable.accountId, rec.account_id),
          eq(dailyStatsTable.date, rec.date),
          isNull(dailyStatsTable.teamId),
        ),
      );

    let balanceAdjusted = false;
    if (!mainRecord) {
      // No main record — fixTeamRecordSpend wrongly inflated this account's balance.
      // Accumulate deduction to undo that inflation.
      balanceDeltas.set(rec.account_id, (balanceDeltas.get(rec.account_id) ?? 0) + stagingSpend);
      balanceAdjusted = true;
    }

    report.push({
      recordId: rec.id,
      accountId: rec.account_id,
      date: rec.date,
      restoredSpend: stagingSpend.toFixed(2),
      balanceAdjusted,
      skipped: false,
    });
  }

  // Apply balance corrections for accounts that had no main records
  for (const [accountId, totalDeduction] of balanceDeltas) {
    if (totalDeduction <= 0) continue;
    const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!acct) continue;

    const newBalance = (parseFloat(acct.currentBalance) - totalDeduction).toFixed(2);
    await db
      .update(accountsTable)
      .set({ currentBalance: newBalance, theoreticalBalance: newBalance })
      .where(eq(accountsTable.id, accountId));

    logger.info({ accountId, oldBalance: acct.currentBalance, newBalance, totalDeduction }, "Account balance corrected");
  }

  const restored = report.filter((r) => !r.skipped).length;
  const skipped = report.filter((r) => r.skipped).length;
  logger.info({ restored, skipped }, "restore-zeroed-spends complete");
  res.json({ ok: true, restored, skipped, report });
});

export default router;

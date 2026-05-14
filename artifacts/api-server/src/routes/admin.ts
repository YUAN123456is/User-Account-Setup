import { Router, type IRouter } from "express";
import { eq, and, isNull, ne } from "drizzle-orm";
import { db, dailyStatsTable, accountsTable, facebookDailySpendTable } from "@workspace/db";
import { requireRole } from "../middlewares/require-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /api/admin/restore-zeroed-spends
 *
 * One-time recovery: the `fixTeamRecordSpend` function incorrectly zeroed the
 * spend_amount on team attribution records (teamId IS NOT NULL, fbSynced=true).
 * This endpoint restores their spend from the `facebook_daily_spend` staging table
 * and, for accounts that have NO corresponding main record (teamId IS NULL), also
 * corrects the inflated account balance.
 */
router.post("/admin/restore-zeroed-spends", requireRole("admin"), async (req, res): Promise<void> => {
  const zeroedRecords = await db
    .select()
    .from(dailyStatsTable)
    .where(
      and(
        eq(dailyStatsTable.fbSynced, true),
        ne(dailyStatsTable.teamId as unknown as typeof dailyStatsTable.teamId, null as unknown as number),
        eq(dailyStatsTable.spendAmount, "0.00"),
      ),
    );

  // Filter to only records with teamId != null (ne() doesn't handle null well in Drizzle)
  const teamRecords = zeroedRecords.filter((r) => r.teamId != null);

  const report: Array<{
    recordId: number;
    accountId: number | null;
    date: string;
    stagingSpend: string;
    restoredSpend: string;
    balanceAdjusted: boolean;
    skipped: boolean;
    reason?: string;
  }> = [];

  // Track balance deltas per account so we apply one update per account
  const balanceDeltas = new Map<number, number>();

  for (const rec of teamRecords) {
    if (!rec.accountId || !rec.date) {
      report.push({ recordId: rec.id, accountId: rec.accountId, date: rec.date ?? "", stagingSpend: "0", restoredSpend: "0", balanceAdjusted: false, skipped: true, reason: "Missing accountId or date" });
      continue;
    }

    // Look up FB staging spend for this account + date
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
      report.push({ recordId: rec.id, accountId: rec.accountId, date: rec.date, stagingSpend: String(stagingSpend), restoredSpend: "0", balanceAdjusted: false, skipped: true, reason: "No FB staging data or spend=0" });
      continue;
    }

    // Restore spend_amount on the team record
    await db
      .update(dailyStatsTable)
      .set({ spendAmount: stagingSpend.toFixed(2) })
      .where(eq(dailyStatsTable.id, rec.id));

    // Check if a main record exists for this account + date
    const [mainRecord] = await db
      .select({ id: dailyStatsTable.id })
      .from(dailyStatsTable)
      .where(
        and(
          eq(dailyStatsTable.accountId, rec.accountId),
          eq(dailyStatsTable.date, rec.date),
          isNull(dailyStatsTable.teamId),
        ),
      );

    let balanceAdjusted = false;
    if (!mainRecord) {
      // No main record → fixTeamRecordSpend wrongly inflated this account's balance.
      // We need to deduct the restored spend to undo that inflation.
      const prev = balanceDeltas.get(rec.accountId) ?? 0;
      balanceDeltas.set(rec.accountId, prev + stagingSpend);
      balanceAdjusted = true;
    }

    report.push({
      recordId: rec.id,
      accountId: rec.accountId,
      date: rec.date,
      stagingSpend: stagingSpend.toFixed(2),
      restoredSpend: stagingSpend.toFixed(2),
      balanceAdjusted,
      skipped: false,
    });
  }

  // Apply balance corrections per account (for accounts with no main records)
  for (const [accountId, totalDeduction] of balanceDeltas) {
    if (totalDeduction <= 0) continue;

    const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!acct) continue;

    // Find the most recent team record's real_balance for this account — this is the
    // "ground truth" balance after the last spend was applied.
    const [latestTeamRec] = await db
      .select({ realBalance: dailyStatsTable.realBalance })
      .from(dailyStatsTable)
      .where(
        and(
          eq(dailyStatsTable.accountId, accountId),
          ne(dailyStatsTable.teamId as unknown as typeof dailyStatsTable.teamId, null as unknown as number),
          eq(dailyStatsTable.fbSynced, true),
        ),
      )
      .orderBy(dailyStatsTable.date)
      .limit(1);

    // Prefer using the real_balance of the latest team record as the authoritative balance.
    // Fall back to current - deduction if we can't find one.
    let newBalance: string;
    if (latestTeamRec?.realBalance != null) {
      // The most recent team record's real_balance is what the balance should be after all
      // the spending on that date. Use it directly.
      newBalance = parseFloat(latestTeamRec.realBalance).toFixed(2);
    } else {
      newBalance = (parseFloat(acct.currentBalance) - totalDeduction).toFixed(2);
    }

    await db
      .update(accountsTable)
      .set({ currentBalance: newBalance, theoreticalBalance: newBalance })
      .where(eq(accountsTable.id, accountId));

    logger.info({ accountId, oldBalance: acct.currentBalance, newBalance, totalDeduction }, "Account balance corrected after spend restoration");
  }

  logger.info({ restored: report.filter((r) => !r.skipped).length, skipped: report.filter((r) => r.skipped).length }, "restore-zeroed-spends complete");

  res.json({ ok: true, report });
});

export default router;

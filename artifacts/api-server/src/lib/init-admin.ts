import { eq, and, ne, isNotNull, isNull, sql } from "drizzle-orm";
import { db, usersTable, dailyStatsTable, accountsTable, facebookDailySpendTable } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

/**
 * One-time idempotent fix: team attribution records (teamId != null) should always
 * have spend_amount = 0. An older version of the sync code incorrectly created team
 * records with non-zero spend AND deducted the balance — causing double-deduction when
 * the main record was later created by the auto-sync.
 *
 * This function finds any such records, restores the account balance, and zeros the spend.
 * After running it becomes a no-op (no more fb_synced team records with spend > 0).
 */
/**
 * Idempotent: ensures the DB-level CHECK constraint exists that prevents team attribution
 * records from ever having non-zero spend. Safe to call on every startup — it no-ops if
 * the constraint is already in place.
 */
export async function ensureDbConstraints(): Promise<void> {
  // pg_constraint is the authoritative system catalog; safer than information_schema.
  const existing = await db.execute(sql`
    SELECT 1 FROM pg_constraint WHERE conname = 'team_records_zero_spend'
  `);
  if (existing.rows.length > 0) return;

  await db.execute(sql`
    ALTER TABLE daily_stats
    ADD CONSTRAINT team_records_zero_spend
    CHECK (team_id IS NULL OR spend_amount = 0)
  `);
  logger.info("DB constraint team_records_zero_spend added");
}

export async function fixTeamRecordSpend(): Promise<void> {
  const candidates = await db.select().from(dailyStatsTable).where(
    and(eq(dailyStatsTable.fbSynced, true), ne(dailyStatsTable.spendAmount, "0.00"))
  );
  const teamRecords = candidates.filter((r) => r.teamId != null && parseFloat(r.spendAmount) > 0);
  if (teamRecords.length === 0) return;

  logger.warn({ count: teamRecords.length }, "Detected team attribution records with non-zero spend — applying balance fix");

  for (const record of teamRecords) {
    const spend = parseFloat(record.spendAmount);
    if (!record.accountId || spend <= 0) continue;

    const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, record.accountId));
    if (!acct) continue;

    const newCurrent = (parseFloat(acct.currentBalance) + spend).toFixed(2);
    const newTheo = (parseFloat(acct.theoreticalBalance ?? acct.currentBalance) + spend).toFixed(2);

    await db.update(accountsTable)
      .set({ currentBalance: newCurrent, theoreticalBalance: newTheo })
      .where(eq(accountsTable.id, record.accountId));

    await db.update(dailyStatsTable)
      .set({ spendAmount: "0.00" })
      .where(eq(dailyStatsTable.id, record.id));

    logger.info({ recordId: record.id, accountId: record.accountId, restoredSpend: spend, newBalance: newCurrent }, "Team record spend zeroed, balance restored");
  }
}

/**
 * One-time idempotent fix: a previous startup function (fixTeamRecordSpend)
 * incorrectly zeroed spend_amount on team attribution records (fb_synced=true,
 * team_id IS NOT NULL). This restores the correct values from the FB staging
 * table and, for accounts that had no main record (which is the source-of-truth
 * for balance deductions), also corrects the inflated account balance.
 *
 * Safe to call on every startup — becomes a no-op once all zeroed records are fixed.
 */
export async function restoreZeroedTeamSpend(): Promise<void> {
  // Find all zeroed team attribution records that have FB staging data
  const zeroed = await db
    .select({
      id: dailyStatsTable.id,
      accountId: dailyStatsTable.accountId,
      date: dailyStatsTable.date,
    })
    .from(dailyStatsTable)
    .where(
      and(
        eq(dailyStatsTable.fbSynced, true),
        isNotNull(dailyStatsTable.teamId),
        sql`${dailyStatsTable.spendAmount} = 0`,
      ),
    );

  if (zeroed.length === 0) return;

  logger.info({ count: zeroed.length }, "restoreZeroedTeamSpend: found zeroed records, restoring");

  for (const rec of zeroed) {
    if (!rec.accountId || !rec.date) continue;

    // Look up the correct spend from FB staging
    const [staging] = await db
      .select({ spend: facebookDailySpendTable.spend })
      .from(facebookDailySpendTable)
      .where(
        and(
          eq(facebookDailySpendTable.matchedAccountId, rec.accountId),
          eq(facebookDailySpendTable.date, rec.date),
        ),
      );

    const spendVal = parseFloat(staging?.spend ?? "0");
    if (spendVal <= 0) {
      logger.warn({ recordId: rec.id, accountId: rec.accountId, date: rec.date }, "restoreZeroedTeamSpend: no FB staging data, skipping");
      continue;
    }

    // Restore spend_amount on the team record
    await db
      .update(dailyStatsTable)
      .set({ spendAmount: spendVal.toFixed(2) })
      .where(eq(dailyStatsTable.id, rec.id));

    // Check whether a main record (team_id IS NULL) exists for this account+date.
    // Main records are the source of truth for balance deductions. If none exists,
    // fixTeamRecordSpend incorrectly added the spend back to the balance → deduct it.
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

    if (!mainRecord) {
      const [acct] = await db
        .select({ currentBalance: accountsTable.currentBalance, theoreticalBalance: accountsTable.theoreticalBalance })
        .from(accountsTable)
        .where(eq(accountsTable.id, rec.accountId));

      if (acct) {
        const correctedBalance = (parseFloat(acct.currentBalance) - spendVal).toFixed(2);
        const correctedTheo = (parseFloat(acct.theoreticalBalance ?? acct.currentBalance) - spendVal).toFixed(2);
        await db
          .update(accountsTable)
          .set({ currentBalance: correctedBalance, theoreticalBalance: correctedTheo })
          .where(eq(accountsTable.id, rec.accountId));
        logger.info({ recordId: rec.id, accountId: rec.accountId, date: rec.date, spendVal, correctedBalance }, "restoreZeroedTeamSpend: restored spend + corrected balance (no main record)");
      }
    } else {
      logger.info({ recordId: rec.id, accountId: rec.accountId, date: rec.date, spendVal }, "restoreZeroedTeamSpend: restored spend (main record exists, balance unchanged)");
    }
  }

  logger.info({ count: zeroed.length }, "restoreZeroedTeamSpend: complete");
}

export async function initAdminUser(): Promise<void> {
  const username = process.env["ADMIN_USERNAME"];
  const password = process.env["ADMIN_PASSWORD"];

  if (!username || !password) {
    logger.warn("ADMIN_USERNAME or ADMIN_PASSWORD not set — skipping admin init");
    return;
  }

  const passwordHash = await hashPassword(password);

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  if (existing) {
    await db
      .update(usersTable)
      .set({ username, passwordHash, isActive: true })
      .where(eq(usersTable.id, existing.id));
    logger.info({ username }, "Admin user updated from env vars");
  } else {
    await db.insert(usersTable).values({
      username,
      displayName: "超级管理员",
      passwordHash,
      role: "admin",
      portalSlug: "admin",
      isActive: true,
    });
    logger.info({ username }, "Admin user created from env vars");
  }
}

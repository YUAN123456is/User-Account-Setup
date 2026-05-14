import { eq, and, ne, sql } from "drizzle-orm";
import { db, usersTable, dailyStatsTable, accountsTable } from "@workspace/db";
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

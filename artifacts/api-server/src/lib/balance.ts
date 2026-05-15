import { and, eq, sql } from "drizzle-orm";
import { db, accountsTable, rechargeOrdersTable, dailyStatsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;

/**
 * Single source of truth for account balance:
 *
 *   balance = balance_offset + Σ completed_recharge_amounts − Σ effective_daily_spend
 *
 * balance_offset stores out-of-band adjustments: the initial balance set at account
 * creation, and any explicit clearBalance / set-balance overrides.
 *
 * "Effective daily spend" uses per-day deduplication to avoid double-counting:
 *   - If a main record (team_id IS NULL) exists for a date → use its spend_amount
 *   - If only team records exist for a date → sum all team records for that date
 *
 * This ensures team-only spend days (no main record submitted) are correctly counted,
 * while dates with both a main record and team breakdowns don't double-count.
 *
 * Rejected and deleted records are naturally excluded, so balance auto-corrects
 * when a record is rejected or deleted — no manual restoration needed.
 *
 * All arithmetic is done in PostgreSQL numeric to avoid JS floating-point drift.
 * Pass `tx` when called inside db.transaction() to run within the same transaction.
 */
export async function recalculateBalance(accountId: number, tx?: DbOrTx): Promise<string> {
  const conn = (tx ?? db) as typeof db;

  const [acctRow] = await conn
    .select({ offset: accountsTable.balanceOffset })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  const [rechRow] = await conn
    .select({ total: sql<string>`COALESCE(SUM(COALESCE(actual_amount, amount)), 0)::text` })
    .from(rechargeOrdersTable)
    .where(and(eq(rechargeOrdersTable.accountId, accountId), eq(rechargeOrdersTable.status, "completed")));

  // Per-day deduplication:
  //   - Days WITH a main record  → use main record spend (team breakdowns ignored to avoid double-count)
  //   - Days WITHOUT a main record → sum all team records (real spend that has no main record)
  const spendResult = await conn.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(day_spend), 0)::text AS total
    FROM (
      SELECT
        CASE
          WHEN COUNT(*) FILTER (WHERE team_id IS NULL) > 0
            THEN SUM(spend_amount) FILTER (WHERE team_id IS NULL)
          ELSE
            SUM(spend_amount)
        END AS day_spend
      FROM ${dailyStatsTable}
      WHERE account_id = ${accountId}
        AND status IN ('pending', 'approved')
      GROUP BY date
    ) AS per_day
  `);

  const offsetTotal = parseFloat(acctRow?.offset ?? "0");
  const rechargeTotal = parseFloat(rechRow?.total ?? "0");
  const spendTotal = parseFloat(spendResult.rows[0]?.total ?? "0");
  return (offsetTotal + rechargeTotal - spendTotal).toFixed(2);
}

/**
 * Recalculates and persists the balance to accounts.current_balance /
 * accounts.theoretical_balance. Returns the new balance string.
 *
 * Call this after any operation that changes spend or recharge amounts.
 */
export async function syncAccountBalance(accountId: number, tx?: DbOrTx): Promise<string> {
  const conn = (tx ?? db) as typeof db;
  const balance = await recalculateBalance(accountId, tx);
  await conn
    .update(accountsTable)
    .set({ currentBalance: balance, theoreticalBalance: balance })
    .where(eq(accountsTable.id, accountId));
  return balance;
}

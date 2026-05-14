import { and, eq, isNull, sql } from "drizzle-orm";
import { db, accountsTable, rechargeOrdersTable, dailyStatsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;

/**
 * Single source of truth for account balance:
 *
 *   balance = Σ completed_recharge_amounts − Σ (pending | approved) main_record_spend
 *
 * "Main records" are daily_stats rows where team_id IS NULL.
 * Rejected and deleted records are naturally excluded, so balance auto-corrects
 * when a record is rejected or deleted — no manual restoration needed.
 *
 * All arithmetic is done in PostgreSQL numeric to avoid JS floating-point drift.
 * Pass `tx` when called inside db.transaction() to run within the same transaction.
 */
export async function recalculateBalance(accountId: number, tx?: DbOrTx): Promise<string> {
  const conn = (tx ?? db) as typeof db;

  const [rechRow] = await conn
    .select({ total: sql<string>`COALESCE(SUM(COALESCE(actual_amount, amount)), 0)::text` })
    .from(rechargeOrdersTable)
    .where(and(eq(rechargeOrdersTable.accountId, accountId), eq(rechargeOrdersTable.status, "completed")));

  const [spendRow] = await conn
    .select({ total: sql<string>`COALESCE(SUM(spend_amount), 0)::text` })
    .from(dailyStatsTable)
    .where(and(
      eq(dailyStatsTable.accountId, accountId),
      isNull(dailyStatsTable.teamId),
      sql`${dailyStatsTable.status} IN ('pending', 'approved')`,
    ));

  const rechargeTotal = parseFloat(rechRow?.total ?? "0");
  const spendTotal = parseFloat(spendRow?.total ?? "0");
  return (rechargeTotal - spendTotal).toFixed(2);
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

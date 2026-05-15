import { and, eq, isNull, sql } from "drizzle-orm";
import { db, accountsTable, rechargeOrdersTable, dailyStatsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;

/**
 * Single source of truth for account balance:
 *
 *   balance = balance_offset + Σ completed_recharge_amounts − Σ main_record_spend
 *
 * Rules:
 * - balance_offset: initial balance at account creation or explicit manual overrides.
 * - Recharges: only completed orders count (actual_amount if set, else amount).
 * - Spend: only "main" daily_stats rows (team_id IS NULL) with status pending or approved.
 *   Team records (team_id IS NOT NULL) are breakdowns/details and never affect balance.
 *   Every day with spend MUST have a main record — team records alone are not enough.
 * - Rejected/deleted records are excluded automatically; balance self-corrects on rejection.
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

  const [spendRow] = await conn
    .select({ total: sql<string>`COALESCE(SUM(spend_amount), 0)::text` })
    .from(dailyStatsTable)
    .where(and(
      eq(dailyStatsTable.accountId, accountId),
      isNull(dailyStatsTable.teamId),
      sql`${dailyStatsTable.status} IN ('pending', 'approved')`,
    ));

  const offsetTotal = parseFloat(acctRow?.offset ?? "0");
  const rechargeTotal = parseFloat(rechRow?.total ?? "0");
  const spendTotal = parseFloat(spendRow?.total ?? "0");
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

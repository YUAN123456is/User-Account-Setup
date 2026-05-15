import { eq, sql } from "drizzle-orm";
import { db, accountsTable, rechargeOrdersTable, dailyStatsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;

/**
 * Single source of truth for account balance:
 *
 *   balance = balance_offset + Σ completed_recharge_amounts − Σ spend
 *
 * Rules:
 * - balance_offset: initial balance at account creation or explicit manual overrides.
 * - Recharges: only completed orders count (actual_amount if set, else amount).
 * - Spend: every daily_stats row with status pending or approved.
 *   There is exactly one row per (account_id, date); team breakdown info is embedded
 *   as JSON in the row and does NOT affect this formula.
 * - Rejected/deleted records are excluded automatically; balance self-corrects on rejection.
 *
 * All arithmetic is done entirely in PostgreSQL numeric to avoid JS floating-point drift.
 */
export async function recalculateBalance(accountId: number, tx?: DbOrTx): Promise<string> {
  const conn = (tx ?? db) as typeof db;

  const [row] = await conn
    .select({
      balance: sql<string>`(
        COALESCE(${accountsTable.balanceOffset}, 0)
        + COALESCE((
            SELECT SUM(COALESCE(actual_amount, amount))
            FROM ${rechargeOrdersTable}
            WHERE account_id = ${accountId} AND status = 'completed'
          ), 0)
        - COALESCE((
            SELECT SUM(spend_amount)
            FROM ${dailyStatsTable}
            WHERE account_id = ${accountId}
              AND status IN ('pending', 'approved')
          ), 0)
      )::numeric(18,2)::text`,
    })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId));

  return row?.balance ?? "0.00";
}

/**
 * Recalculates and persists the balance to accounts.current_balance /
 * accounts.theoretical_balance. Returns the new balance string.
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

/**
 * 修复 daily_stats 中错误的 realBalance 历史快照。
 *
 * 根本原因：FB 同步时 fbAccounts 在循环外一次性加载，多日期同步时
 * 第二天及以后的 INSERT 用的是内存中的旧余额，导致快照算错。
 *
 * 修复策略：以 accounts.currentBalance 为可信起点，按日期从近到远
 * 倒推，每遇到已完成充值则减掉，每处理完一天则加回当天消耗，
 * 得到该天结束时的正确余额快照。
 *
 * 只修复 fbSynced=true 的记录（bug 只影响 FB 同步路径）。
 *
 * 用法：
 *   pnpm --filter @workspace/scripts run fix-real-balance          # dry-run
 *   pnpm --filter @workspace/scripts run fix-real-balance -- --apply  # 写入数据库
 */

import { db } from "@workspace/db";
import {
  accountsTable,
  dailyStatsTable,
  rechargeOrdersTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const DRY_RUN = !process.argv.includes("--apply");

if (DRY_RUN) {
  console.log("=== DRY-RUN 模式 — 仅打印差异，不写入数据库 ===");
  console.log("加上 --apply 参数来实际写入\n");
} else {
  console.log("=== APPLY 模式 — 将写入数据库 ===\n");
}

async function fixRealBalances() {
  const accounts = await db.select().from(accountsTable);

  let totalChecked = 0;
  let totalFixed = 0;

  for (const account of accounts) {
    // FB 同步过的记录，按日期从近到远
    const stats = await db
      .select()
      .from(dailyStatsTable)
      .where(
        and(
          eq(dailyStatsTable.accountId, account.id),
          eq(dailyStatsTable.fbSynced, true)
        )
      )
      .orderBy(desc(dailyStatsTable.date));

    if (stats.length === 0) continue;

    // 已完成的充值订单，按完成时间从近到远（updatedAt = 状态变为 completed 的时间）
    const recharges = await db
      .select()
      .from(rechargeOrdersTable)
      .where(
        and(
          eq(rechargeOrdersTable.accountId, account.id),
          eq(rechargeOrdersTable.status, "completed")
        )
      )
      .orderBy(desc(rechargeOrdersTable.updatedAt));

    // 从当前余额往前倒推
    let runningBalance = parseFloat(account.currentBalance ?? "0");
    let rechargePtr = 0;

    for (const stat of stats) {
      // 把这天结束后才到账的充值先减掉（倒推，回到这天结束时的余额）
      // 判断：充值完成时间 > 当天 23:59:59 → 属于这天之后
      const dayEnd = new Date(`${stat.date}T23:59:59.999Z`);
      while (
        rechargePtr < recharges.length &&
        recharges[rechargePtr].updatedAt > dayEnd
      ) {
        const amt = parseFloat(
          recharges[rechargePtr].actualAmount ??
            recharges[rechargePtr].amount ??
            "0"
        );
        runningBalance -= amt;
        rechargePtr++;
      }

      // 此时 runningBalance = 这天结束时（消耗后）的正确余额
      const correctRealBalance = runningBalance.toFixed(2);
      const correctHasAlert = runningBalance < 100;

      totalChecked++;

      const oldVal = parseFloat(stat.realBalance).toFixed(2);
      const needsFix =
        oldVal !== correctRealBalance || stat.hasAlert !== correctHasAlert;

      if (needsFix) {
        totalFixed++;
        console.log(
          `[${needsFix ? (DRY_RUN ? "DRY" : "FIX") : "OK "}] ` +
            `账户=${account.accountName} 日期=${stat.date} ` +
            `realBalance: ${oldVal} → ${correctRealBalance}` +
            (stat.hasAlert !== correctHasAlert
              ? `  hasAlert: ${stat.hasAlert} → ${correctHasAlert}`
              : "")
        );

        if (!DRY_RUN) {
          await db
            .update(dailyStatsTable)
            .set({
              realBalance: correctRealBalance,
              hasAlert: correctHasAlert,
            })
            .where(eq(dailyStatsTable.id, stat.id));
        }
      }

      // 倒推到前一天结束：把这天的消耗加回来 = 这天开始前的余额
      runningBalance += parseFloat(stat.spendAmount);
    }
  }

  console.log(
    `\n共检查 ${totalChecked} 条 FB 记录，` +
      (DRY_RUN
        ? `需修正 ${totalFixed} 条（加 --apply 写入）`
        : `已修正 ${totalFixed} 条`)
  );
}

fixRealBalances()
  .catch((e) => {
    console.error("脚本执行失败:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));

import { Router, type IRouter } from "express";
import { eq, and, or, isNull, asc, SQL } from "drizzle-orm";
import { db, accountsTable, usersTable, dailyStatsTable, rechargeOrdersTable } from "@workspace/db";
import {
  CreateAccountBody,
  UpdateAccountBody,
  AssignAccountBody,
  ListAccountsQueryParams,
  GetAccountParams,
  UpdateAccountParams,
  AssignAccountParams,
  DeleteAccountParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/require-auth";
import { recalculateBalance, syncAccountBalance } from "../lib/balance";

const router: IRouter = Router();

async function formatAccount(account: typeof accountsTable.$inferSelect) {
  const provider = account.providerId
    ? (await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, account.providerId)))[0]
    : null;
  const pitcher = account.pitcherId
    ? (await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, account.pitcherId)))[0]
    : null;

  return {
    id: account.id,
    platformAccountId: account.platformAccountId,
    accountName: account.accountName,
    platform: account.platform,
    providerId: account.providerId,
    providerName: provider?.displayName ?? null,
    pitcherId: account.pitcherId ?? null,
    pitcherName: pitcher?.displayName ?? null,
    status: account.status,
    currentBalance: account.currentBalance,
    theoreticalBalance: account.theoreticalBalance ?? null,
    lastReportedAt: account.lastReportedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    banNotifyProvider: account.banNotifyProvider,
  };
}

router.get("/accounts", requireAuth, async (req, res): Promise<void> => {
  const params = ListAccountsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions: SQL[] = [];
  const { role, userId } = req.session as { role?: string; userId?: number };

  if (role === "provider") {
    conditions.push(eq(accountsTable.providerId, userId!));
  } else if (role === "pitcher") {
    const [callerUser] = await db.select({ canAssignAccounts: usersTable.canAssignAccounts })
      .from(usersTable).where(eq(usersTable.id, userId!));
    if (callerUser?.canAssignAccounts) {
      conditions.push(or(eq(accountsTable.pitcherId, userId!), isNull(accountsTable.pitcherId))!);
    } else {
      conditions.push(eq(accountsTable.pitcherId, userId!));
    }
  } else {
    if (params.data.providerId != null) conditions.push(eq(accountsTable.providerId, params.data.providerId));
    if (params.data.pitcherId != null) conditions.push(eq(accountsTable.pitcherId, params.data.pitcherId));
  }

  if (params.data.status) conditions.push(eq(accountsTable.status, params.data.status));

  const accounts = conditions.length > 0
    ? await db.select().from(accountsTable).where(and(...conditions)).orderBy(asc(accountsTable.accountName))
    : await db.select().from(accountsTable).orderBy(asc(accountsTable.accountName));

  const formatted = await Promise.all(accounts.map(formatAccount));
  res.json(formatted);
});

router.post("/accounts", requireRole("provider"), async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [account] = await db.insert(accountsTable).values({
    platformAccountId: parsed.data.platformAccountId,
    accountName: parsed.data.accountName,
    platform: parsed.data.platform,
    providerId: req.session.userId!,
    balanceOffset: parsed.data.initialBalance,   // persisted so recalculate includes it
    currentBalance: parsed.data.initialBalance,
    theoreticalBalance: parsed.data.initialBalance,
    status: "idle",
  }).returning();

  res.status(201).json(await formatAccount(account));
});

router.get("/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, params.data.id));
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const { role, userId } = req.session as { role?: string; userId?: number };
  if (role === "provider" && account.providerId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (role === "pitcher" && account.pitcherId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(await formatAccount(account));
});

router.patch("/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { role, userId } = req.session as { role?: string; userId?: number };

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, params.data.id));
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  // Permission checks per role
  if (role === "provider") {
    if (account.providerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    // Providers can only clear ban notification and balance — not change status
    if (parsed.data.status != null) {
      res.status(403).json({ error: "开户商不可修改状态" });
      return;
    }
  } else if (role === "pitcher") {
    // All pitchers can update status of their own accounts (but not set "banned")
    if (account.pitcherId !== userId) {
      res.status(403).json({ error: "只能操作自己名下的账户" });
      return;
    }
    // Pitchers cannot touch balance, ban flags, account name, or set banned status
    if (parsed.data.accountName != null || parsed.data.clearBalance != null || parsed.data.banNotifyProvider != null) {
      res.status(403).json({ error: "无权限" });
      return;
    }
    if (parsed.data.status === "banned") {
      res.status(403).json({ error: "只有管理员可将账户标记为封禁" });
      return;
    }
  } else if (role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updates: Partial<typeof accountsTable.$inferInsert> = {};
  if (parsed.data.accountName != null) updates.accountName = parsed.data.accountName;

  if (parsed.data.status != null) {
    updates.status = parsed.data.status as "idle" | "active" | "banned";
    // When banning: flag provider to clear balance
    if (parsed.data.status === "banned") {
      updates.banNotifyProvider = true;
    }
  }

  // clearBalance: compute the offset needed to make recalculate return 0, then sync.
  // Done as a special early-return because it requires async recalculation.
  // Any other accumulated updates (e.g. status, accountName) are applied first inside
  // the same transaction so nothing is silently lost.
  if (parsed.data.clearBalance === true) {
    await db.transaction(async (tx) => {
      // Apply any non-balance updates (status changes, accountName, etc.) first.
      if (Object.keys(updates).length > 0) {
        await tx.update(accountsTable).set(updates).where(eq(accountsTable.id, params.data.id));
      }
      const [acctRow] = await tx
        .select({ balanceOffset: accountsTable.balanceOffset })
        .from(accountsTable)
        .where(eq(accountsTable.id, params.data.id));
      const currentOffset = parseFloat(acctRow?.balanceOffset ?? "0");
      const currentBalance = parseFloat(await recalculateBalance(account.id, tx));
      // naturalBalance = recharges − spend (excludes offset)
      const naturalBalance = currentBalance - currentOffset;
      // new_offset such that (new_offset + naturalBalance) = 0
      const newOffset = (-naturalBalance).toFixed(2);
      // banNotifyProvider: false — clearBalance dismisses the provider notification.
      await tx.update(accountsTable)
        .set({ balanceOffset: newOffset, banNotifyProvider: false })
        .where(eq(accountsTable.id, params.data.id));
      await syncAccountBalance(account.id, tx);
    });
    const [refreshed] = await db.select().from(accountsTable).where(eq(accountsTable.id, params.data.id));
    res.json(await formatAccount(refreshed));
    return;
  }

  if (parsed.data.banNotifyProvider === false) {
    updates.banNotifyProvider = false;
  }

  if (Object.keys(updates).length === 0) {
    res.json(await formatAccount(account));
    return;
  }

  const [updated] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, params.data.id)).returning();
  res.json(await formatAccount(updated));
});

// POST /api/accounts/:id/set-balance — admin only, password-gated balance correction
router.post("/accounts/:id/set-balance", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as { currentBalance?: string; password?: string; note?: string };

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || body.password !== adminPassword) {
    res.status(403).json({ error: "密码错误" });
    return;
  }

  const newBalance = parseFloat(body.currentBalance ?? "");
  if (isNaN(newBalance)) {
    res.status(400).json({ error: "余额格式无效" });
    return;
  }

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  // Compute the offset needed so that recalculate returns exactly `newBalance`.
  //   new_offset + naturalBalance = newBalance
  //   naturalBalance = currentBalance − currentOffset  (= recharges − spend)
  let updated: typeof accountsTable.$inferSelect;
  await db.transaction(async (tx) => {
    const currentOffset = parseFloat(account.balanceOffset ?? "0");
    const currentBalance = parseFloat(await recalculateBalance(id, tx));
    const naturalBalance = currentBalance - currentOffset;
    const newOffset = (newBalance - naturalBalance).toFixed(2);
    await tx.update(accountsTable)
      .set({ balanceOffset: newOffset })
      .where(eq(accountsTable.id, id));
    await syncAccountBalance(id, tx);
    const [refreshed] = await tx.select().from(accountsTable).where(eq(accountsTable.id, id));
    updated = refreshed;
  });

  res.json(await formatAccount(updated!));
});

router.delete("/accounts/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const existing = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.id, params.data.id));
  if (!existing.length) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  // Wrap all three deletes in one transaction so a mid-flight crash can't leave orphans.
  await db.transaction(async (tx) => {
    await tx.delete(dailyStatsTable).where(eq(dailyStatsTable.accountId, params.data.id));
    await tx.delete(rechargeOrdersTable).where(eq(rechargeOrdersTable.accountId, params.data.id));
    await tx.delete(accountsTable).where(eq(accountsTable.id, params.data.id));
  });
  res.status(204).end();
});

router.post("/accounts/:id/assign", requireRole("admin", "pitcher"), async (req, res): Promise<void> => {
  const params = AssignAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AssignAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Pitchers with canAssignAccounts can only assign idle (unassigned) accounts; no transfers
  const { role, userId } = req.session as { role?: string; userId?: number };
  if (role === "pitcher") {
    const [caller] = await db.select({ canAssignAccounts: usersTable.canAssignAccounts })
      .from(usersTable).where(eq(usersTable.id, userId!));
    if (!caller?.canAssignAccounts) {
      res.status(403).json({ error: "无账户分配权限" });
      return;
    }
    const [existing] = await db.select({ pitcherId: accountsTable.pitcherId })
      .from(accountsTable).where(eq(accountsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    if (existing.pitcherId != null) {
      res.status(403).json({ error: "已分配账户只有管理员可转移" });
      return;
    }
  }

  const newStatus = parsed.data.pitcherId != null ? "active" : "idle";
  const [account] = await db.update(accountsTable)
    .set({ pitcherId: parsed.data.pitcherId, status: newStatus })
    .where(eq(accountsTable.id, params.data.id))
    .returning();

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(await formatAccount(account));
});

export default router;

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

  if (parsed.data.clearBalance === true) {
    updates.currentBalance = "0.00";
    updates.theoreticalBalance = "0.00";
    updates.banNotifyProvider = false;
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
  await db.delete(dailyStatsTable).where(eq(dailyStatsTable.accountId, params.data.id));
  await db.delete(rechargeOrdersTable).where(eq(rechargeOrdersTable.accountId, params.data.id));
  await db.delete(accountsTable).where(eq(accountsTable.id, params.data.id));
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

import { Router, type IRouter } from "express";
import { eq, ne, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, usersTable, accountsTable, dailyStatsTable, rechargeOrdersTable } from "@workspace/db";
import { CreateUserBody, UpdateUserBody, ListUsersQueryParams, GetUserParams, UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";
import { requireRole, requireAuth } from "../middlewares/require-auth";
import { hashPassword } from "../lib/auth";
import { syncAccountBalance } from "../lib/balance";

const router: IRouter = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    portalSlug: user.portalSlug,
    magicToken: user.magicToken ?? null,
    canAssignAccounts: user.canAssignAccounts,
    isActive: user.isActive,
    feeRate: user.feeRate ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

// GET /api/pitchers — active pitchers only (for assignment dropdowns)
router.get("/pitchers", requireAuth, async (req, res): Promise<void> => {
  const pitchers = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(and(eq(usersTable.role, "pitcher"), eq(usersTable.isActive, true)));
  res.json(pitchers);
});

// GET /api/providers — active providers only (for ticket submission)
router.get("/providers", requireAuth, async (req, res): Promise<void> => {
  const providers = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(and(eq(usersTable.role, "provider"), eq(usersTable.isActive, true)));
  res.json(providers);
});

router.get("/users", requireRole("admin"), async (req, res): Promise<void> => {
  const params = ListUsersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let query = db.select().from(usersTable).$dynamic();
  if (params.data.role) {
    query = query.where(eq(usersTable.role, params.data.role));
  } else {
    query = query.where(ne(usersTable.role, "admin"));
  }

  const users = await query;
  res.json(users.map(formatUser));
});

router.post("/users", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, displayName, password, role, portalSlug } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing.length > 0) {
    res.status(400).json({ error: "用户名已被占用" });
    return;
  }

  if (portalSlug) {
    const slugExisting = await db.select().from(usersTable).where(eq(usersTable.portalSlug, portalSlug));
    if (slugExisting.length > 0) {
      res.status(400).json({ error: "门户路径已被占用" });
      return;
    }
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({ username, displayName, passwordHash, role, portalSlug: portalSlug || null }).returning();
  res.status(201).json(formatUser(user));
});

router.get("/users/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
});

router.patch("/users/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Check portalSlug uniqueness when updating (creation already checks, but update didn't).
  if (parsed.data.portalSlug != null) {
    const [slugConflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.portalSlug, parsed.data.portalSlug), ne(usersTable.id, params.data.id)));
    if (slugConflict) {
      res.status(400).json({ error: "门户路径已被占用" });
      return;
    }
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.displayName != null) updates.displayName = parsed.data.displayName;
  if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
  if (parsed.data.canAssignAccounts != null) updates.canAssignAccounts = parsed.data.canAssignAccounts;
  if (parsed.data.portalSlug != null) updates.portalSlug = parsed.data.portalSlug;
  if (parsed.data.password) updates.passwordHash = await hashPassword(parsed.data.password);
  if ("feeRate" in parsed.data) {
    updates.feeRate = parsed.data.feeRate ?? null;
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
});

router.post("/users/:id/magic-token", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const token = randomUUID().replace(/-/g, "");
  const [user] = await db.update(usersTable).set({ magicToken: token }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ magicToken: user.magicToken });
});

router.delete("/users/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === "provider") {
    // Collect account IDs for this provider before deletion.
    const providerAccounts = await db
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(eq(accountsTable.providerId, params.data.id));
    const accountIds = providerAccounts.map((a) => a.id);

    // All deletes in one transaction — crash cannot leave partial data.
    await db.transaction(async (tx) => {
      if (accountIds.length > 0) {
        await tx.delete(dailyStatsTable).where(inArray(dailyStatsTable.accountId, accountIds));
        await tx.delete(rechargeOrdersTable).where(inArray(rechargeOrdersTable.accountId, accountIds));
        await tx.delete(accountsTable).where(eq(accountsTable.providerId, params.data.id));
      }
      // Also clear any recharge orders submitted BY this provider that aren't account-linked.
      await tx.delete(rechargeOrdersTable).where(eq(rechargeOrdersTable.providerId, params.data.id));
      await tx.delete(usersTable).where(eq(usersTable.id, params.data.id));
    });

  } else if (user.role === "pitcher") {
    // Collect the account IDs where this pitcher had pending/approved main records.
    // Deleting those stats will make the balance formula return a higher value,
    // so we must sync those accounts within the same transaction.
    const activeStats = await db
      .select({ accountId: dailyStatsTable.accountId })
      .from(dailyStatsTable)
      .where(and(
        eq(dailyStatsTable.pitcherId, params.data.id),
        inArray(dailyStatsTable.status, ["pending", "approved"]),
      ));
    const balanceAffectedIds = [
      ...new Set(activeStats.filter((s) => s.accountId != null).map((s) => s.accountId!)),
    ];

    await db.transaction(async (tx) => {
      await tx.delete(dailyStatsTable).where(eq(dailyStatsTable.pitcherId, params.data.id));
      // Nullify pitcher reference; preserve "banned" status for banned accounts.
      // accounts with pitcherId = this pitcher that are NOT banned → set to idle.
      await tx.update(accountsTable)
        .set({ pitcherId: null, status: "idle" })
        .where(and(eq(accountsTable.pitcherId, params.data.id), ne(accountsTable.status, "banned")));
      await tx.update(accountsTable)
        .set({ pitcherId: null })
        .where(and(eq(accountsTable.pitcherId, params.data.id), eq(accountsTable.status, "banned")));
      await tx.update(rechargeOrdersTable)
        .set({ pitcherId: null })
        .where(eq(rechargeOrdersTable.pitcherId, params.data.id));
      await tx.delete(usersTable).where(eq(usersTable.id, params.data.id));

      // Sync balances for accounts whose pending/approved stats were just deleted.
      for (const accountId of balanceAffectedIds) {
        await syncAccountBalance(accountId, tx);
      }
    });

  } else {
    await db.delete(usersTable).where(eq(usersTable.id, params.data.id));
  }

  res.sendStatus(204);
});

export default router;

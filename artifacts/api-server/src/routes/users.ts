import { Router, type IRouter } from "express";
import { eq, ne, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, usersTable, accountsTable, dailyStatsTable, rechargeOrdersTable } from "@workspace/db";
import { CreateUserBody, UpdateUserBody, ListUsersQueryParams, GetUserParams, UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";
import { requireRole } from "../middlewares/require-auth";
import { hashPassword } from "../lib/auth";

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
    createdAt: user.createdAt.toISOString(),
  };
}

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

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.displayName != null) updates.displayName = parsed.data.displayName;
  if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
  if (parsed.data.canAssignAccounts != null) updates.canAssignAccounts = parsed.data.canAssignAccounts;
  if (parsed.data.portalSlug != null) updates.portalSlug = parsed.data.portalSlug;
  if (parsed.data.password) updates.passwordHash = await hashPassword(parsed.data.password);

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
    const providerAccounts = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.providerId, params.data.id));
    const accountIds = providerAccounts.map((a) => a.id);
    if (accountIds.length > 0) {
      await db.delete(dailyStatsTable).where(inArray(dailyStatsTable.accountId, accountIds));
      await db.delete(rechargeOrdersTable).where(inArray(rechargeOrdersTable.accountId, accountIds));
      await db.delete(accountsTable).where(eq(accountsTable.providerId, params.data.id));
    }
    await db.delete(rechargeOrdersTable).where(eq(rechargeOrdersTable.providerId, params.data.id));
  } else if (user.role === "pitcher") {
    await db.delete(dailyStatsTable).where(eq(dailyStatsTable.pitcherId, params.data.id));
    await db.update(accountsTable).set({ pitcherId: null }).where(eq(accountsTable.pitcherId, params.data.id));
    await db.update(rechargeOrdersTable).set({ pitcherId: null }).where(eq(rechargeOrdersTable.pitcherId, params.data.id));
  }

  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;

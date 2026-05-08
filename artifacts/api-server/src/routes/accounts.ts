import { Router, type IRouter } from "express";
import { eq, and, SQL } from "drizzle-orm";
import { db, accountsTable, usersTable } from "@workspace/db";
import {
  CreateAccountBody,
  UpdateAccountBody,
  AssignAccountBody,
  ListAccountsQueryParams,
  GetAccountParams,
  UpdateAccountParams,
  AssignAccountParams,
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
    conditions.push(eq(accountsTable.pitcherId, userId!));
  } else {
    if (params.data.providerId != null) conditions.push(eq(accountsTable.providerId, params.data.providerId));
    if (params.data.pitcherId != null) conditions.push(eq(accountsTable.pitcherId, params.data.pitcherId));
  }

  if (params.data.status) conditions.push(eq(accountsTable.status, params.data.status));

  const accounts = conditions.length > 0
    ? await db.select().from(accountsTable).where(and(...conditions))
    : await db.select().from(accountsTable);

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

router.patch("/accounts/:id", requireRole("admin", "provider"), async (req, res): Promise<void> => {
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

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, params.data.id));
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  if (req.session.role === "provider" && account.providerId !== req.session.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updates: Partial<typeof accountsTable.$inferInsert> = {};
  if (parsed.data.accountName != null) updates.accountName = parsed.data.accountName;
  if (parsed.data.status != null) updates.status = parsed.data.status as "idle" | "active" | "banned";

  const [updated] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, params.data.id)).returning();
  res.json(await formatAccount(updated));
});

router.post("/accounts/:id/assign", requireRole("admin"), async (req, res): Promise<void> => {
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

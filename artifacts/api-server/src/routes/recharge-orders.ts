import { Router, type IRouter } from "express";
import { eq, and, gte, lte, SQL } from "drizzle-orm";
import { db, rechargeOrdersTable, accountsTable, usersTable } from "@workspace/db";
import {
  CreateRechargeOrderBody,
  UpdateRechargeOrderBody,
  ListRechargeOrdersQueryParams,
  GetRechargeOrderParams,
  UpdateRechargeOrderParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

async function formatOrder(order: typeof rechargeOrdersTable.$inferSelect) {
  const account = order.accountId
    ? (await db.select({ accountName: accountsTable.accountName, platformAccountId: accountsTable.platformAccountId }).from(accountsTable).where(eq(accountsTable.id, order.accountId)))[0]
    : null;
  const provider = order.providerId
    ? (await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, order.providerId)))[0]
    : null;
  const pitcher = order.pitcherId
    ? (await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, order.pitcherId)))[0]
    : null;

  return {
    id: order.id,
    accountId: order.accountId,
    accountName: account?.accountName ?? null,
    platformAccountId: account?.platformAccountId ?? null,
    amount: order.amount,
    status: order.status,
    providerId: order.providerId,
    providerName: provider?.displayName ?? null,
    pitcherId: order.pitcherId ?? null,
    pitcherName: pitcher?.displayName ?? null,
    note: order.note ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

router.get("/recharge-orders", requireAuth, async (req, res): Promise<void> => {
  const params = ListRechargeOrdersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions: SQL[] = [];
  const { role, userId } = req.session as { role?: string; userId?: number };

  if (role === "provider") {
    conditions.push(eq(rechargeOrdersTable.providerId, userId!));
  } else if (role === "pitcher") {
    conditions.push(eq(rechargeOrdersTable.pitcherId, userId!));
  }

  if (params.data.status) conditions.push(eq(rechargeOrdersTable.status, params.data.status));
  if (params.data.accountId != null) conditions.push(eq(rechargeOrdersTable.accountId, params.data.accountId));
  if (params.data.dateFrom) conditions.push(gte(rechargeOrdersTable.createdAt, new Date(params.data.dateFrom)));
  if (params.data.dateTo) {
    const end = new Date(params.data.dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(rechargeOrdersTable.createdAt, end));
  }

  const orders = conditions.length > 0
    ? await db.select().from(rechargeOrdersTable).where(and(...conditions))
    : await db.select().from(rechargeOrdersTable);

  const formatted = await Promise.all(orders.map(formatOrder));
  res.json(formatted);
});

router.post("/recharge-orders", requireRole("pitcher"), async (req, res): Promise<void> => {
  const parsed = CreateRechargeOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [account] = await db.select().from(accountsTable).where(
    and(eq(accountsTable.id, parsed.data.accountId), eq(accountsTable.pitcherId, req.session.userId!))
  );
  if (!account) {
    res.status(403).json({ error: "Account not assigned to you" });
    return;
  }

  const [order] = await db.insert(rechargeOrdersTable).values({
    accountId: parsed.data.accountId,
    amount: parsed.data.amount,
    status: "pending",
    providerId: account.providerId,
    pitcherId: req.session.userId!,
    note: parsed.data.note ?? null,
  }).returning();

  res.status(201).json(await formatOrder(order));
});

router.get("/recharge-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetRechargeOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [order] = await db.select().from(rechargeOrdersTable).where(eq(rechargeOrdersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const { role, userId } = req.session as { role?: string; userId?: number };
  if (role === "provider" && order.providerId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (role === "pitcher" && order.pitcherId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(await formatOrder(order));
});

router.patch("/recharge-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateRechargeOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRechargeOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { role, userId } = req.session as { role?: string; userId?: number };

  const [order] = await db.select().from(rechargeOrdersTable).where(eq(rechargeOrdersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Pitcher: can only update amount/note of their own pending orders (no status change)
  if (role === "pitcher") {
    if (order.pitcherId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (order.status !== "pending") {
      res.status(409).json({ error: "该订单已处理，无法修改" });
      return;
    }
    if (parsed.data.status) {
      res.status(403).json({ error: "投手无法变更订单状态" });
      return;
    }
    if (!parsed.data.amount) {
      res.status(400).json({ error: "请提供修改后的金额" });
      return;
    }
    const amountVal = parseFloat(parsed.data.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      res.status(400).json({ error: "金额无效" });
      return;
    }
    const [updated] = await db.update(rechargeOrdersTable).set({
      amount: parsed.data.amount,
      note: parsed.data.note !== undefined ? parsed.data.note : order.note,
    }).where(eq(rechargeOrdersTable.id, params.data.id)).returning();
    res.json(await formatOrder(updated));
    return;
  }

  // Provider / Admin: approve or reject
  if (role !== "provider" && role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (role === "provider" && order.providerId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (order.status !== "pending") {
    res.status(409).json({ error: "该订单已处理，无法重复操作" });
    return;
  }
  if (!parsed.data.status) {
    res.status(400).json({ error: "请提供订单状态" });
    return;
  }

  const [updated] = await db.update(rechargeOrdersTable).set({
    status: parsed.data.status,
    note: parsed.data.note !== undefined ? parsed.data.note : order.note,
  }).where(eq(rechargeOrdersTable.id, params.data.id)).returning();

  if (parsed.data.status === "completed") {
    const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, order.accountId));
    if (acct) {
      const newBal = parseFloat(acct.currentBalance) + parseFloat(order.amount);
      const newTheoretical = parseFloat(acct.theoreticalBalance ?? acct.currentBalance) + parseFloat(order.amount);
      await db.update(accountsTable).set({
        currentBalance: newBal.toFixed(2),
        theoreticalBalance: newTheoretical.toFixed(2),
      }).where(eq(accountsTable.id, order.accountId));
    }
  }

  res.json(await formatOrder(updated));
});

export default router;

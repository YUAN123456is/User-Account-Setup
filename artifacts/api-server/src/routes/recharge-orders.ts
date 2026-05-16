import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, SQL } from "drizzle-orm";
import { db, rechargeOrdersTable, accountsTable, usersTable } from "@workspace/db";
import { syncAccountBalance } from "../lib/balance";
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
    ? (await db.select({ displayName: usersTable.displayName, feeRate: usersTable.feeRate }).from(usersTable).where(eq(usersTable.id, order.providerId)))[0]
    : null;
  const pitcher = order.pitcherId
    ? (await db.select({ displayName: usersTable.displayName, username: usersTable.username }).from(usersTable).where(eq(usersTable.id, order.pitcherId)))[0]
    : null;

  return {
    id: order.id,
    accountId: order.accountId,
    accountName: account?.accountName ?? null,
    platformAccountId: account?.platformAccountId ?? null,
    amount: order.amount,
    actualAmount: order.actualAmount ?? null,
    feeRate: provider?.feeRate ?? null,
    status: order.status,
    providerId: order.providerId,
    providerName: provider?.displayName ?? null,
    pitcherId: order.pitcherId ?? null,
    pitcherName: pitcher?.displayName ?? pitcher?.username ?? null,
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
    ? await db.select().from(rechargeOrdersTable).where(and(...conditions)).orderBy(desc(rechargeOrdersTable.createdAt))
    : await db.select().from(rechargeOrdersTable).orderBy(desc(rechargeOrdersTable.createdAt));

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

  // Determine actualAmount: use provided value, or compute from feeRate, or fall back to amount
  let actualAmountVal: string | null = null;
  if (parsed.data.status === "completed") {
    if (parsed.data.actualAmount != null) {
      actualAmountVal = String(parseFloat(parsed.data.actualAmount).toFixed(2));
    } else {
      // Auto-compute from provider's feeRate if available
      const [provider] = await db.select({ feeRate: usersTable.feeRate }).from(usersTable).where(eq(usersTable.id, order.providerId));
      if (provider?.feeRate) {
        const rate = parseFloat(provider.feeRate);
        const base = parseFloat(order.amount);
        actualAmountVal = (base * (1 - rate / 100)).toFixed(2);
      }
    }
  }

  let updated: typeof rechargeOrdersTable.$inferSelect;

  if (parsed.data.status === "completed") {
    // Mark the order completed first, then recalculate balance from source of truth.
    // Both happen inside a transaction so the balance is always consistent with the orders table.
    // The WHERE clause includes status='pending' to guard against a double-completion race:
    // if two requests concurrently pass the pending check above, only one will match the UPDATE
    // and succeed — the other gets 0 rows back and is treated as already-processed.
    let alreadyProcessed = false;
    await db.transaction(async (tx) => {
      const [u] = await tx.update(rechargeOrdersTable).set({
        status: parsed.data.status,
        actualAmount: actualAmountVal,
        note: parsed.data.note !== undefined ? parsed.data.note : order.note,
      }).where(and(
        eq(rechargeOrdersTable.id, params.data.id),
        eq(rechargeOrdersTable.status, "pending"),
      )).returning();
      if (!u) {
        alreadyProcessed = true;
        return; // no-op — other request won the race; transaction commits cleanly
      }
      updated = u;
      await syncAccountBalance(order.accountId, tx);
    });
    if (alreadyProcessed) {
      res.status(409).json({ error: "该订单已处理，无法重复操作" });
      return;
    }
  } else {
    // Rejected path: also guard against race condition with status check in WHERE clause.
    const [u] = await db.update(rechargeOrdersTable).set({
      status: parsed.data.status,
      actualAmount: actualAmountVal,
      note: parsed.data.note !== undefined ? parsed.data.note : order.note,
    }).where(and(
      eq(rechargeOrdersTable.id, params.data.id),
      eq(rechargeOrdersTable.status, "pending"),
    )).returning();
    if (!u) {
      res.status(409).json({ error: "该订单已处理，无法重复操作" });
      return;
    }
    updated = u;
  }

  res.json(await formatOrder(updated!));
});

// PATCH /api/recharge-orders/:id/adjust — admin only, password-protected
// Allows correcting actualAmount on an already-completed order and re-syncs balance.
router.patch("/recharge-orders/:id/adjust", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "无效的订单 ID" }); return; }

  const body = req.body as { actualAmount?: unknown; adminPassword?: unknown };
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (!adminPassword || body.adminPassword !== adminPassword) {
    res.status(403).json({ error: "密码错误" });
    return;
  }

  const newAmount = parseFloat(String(body.actualAmount ?? ""));
  if (isNaN(newAmount) || newAmount <= 0) {
    res.status(400).json({ error: "请输入有效的实际到账金额" });
    return;
  }

  const [order] = await db.select().from(rechargeOrdersTable).where(eq(rechargeOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "订单不存在" }); return; }
  if (order.status !== "completed") {
    res.status(409).json({ error: "只能修改已完成的订单" });
    return;
  }

  let updated: typeof rechargeOrdersTable.$inferSelect;
  await db.transaction(async (tx) => {
    [updated] = await tx
      .update(rechargeOrdersTable)
      .set({ actualAmount: newAmount.toFixed(2) })
      .where(eq(rechargeOrdersTable.id, id))
      .returning();
    await syncAccountBalance(order.accountId, tx);
  });

  res.json(await formatOrder(updated!));
});

export default router;

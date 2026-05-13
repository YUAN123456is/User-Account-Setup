import { Router, type IRouter } from "express";
import { eq, and, gte, lte, SQL } from "drizzle-orm";
import { db, ticketsTable, usersTable } from "@workspace/db";
import {
  CreateTicketBody,
  CompleteTicketBody,
  ListTicketsQueryParams,
  CompleteTicketParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

async function formatTicket(t: typeof ticketsTable.$inferSelect) {
  const [pitcher] = t.pitcherId
    ? await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, t.pitcherId))
    : [null];
  const [provider] = t.providerId
    ? await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, t.providerId))
    : [null];

  return {
    id: t.id,
    pitcherId: t.pitcherId,
    pitcherName: pitcher?.displayName ?? null,
    providerId: t.providerId,
    providerName: provider?.displayName ?? null,
    type: t.type,
    status: t.status,
    platform: t.platform ?? null,
    amount: t.amount ?? null,
    targetBm: t.targetBm ?? null,
    account: t.account ?? null,
    remark: t.remark ?? null,
    completedNote: t.completedNote ?? null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/tickets", requireAuth, async (req, res): Promise<void> => {
  const params = ListTicketsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { role, userId } = req.session as { role?: string; userId?: number };
  const conditions: SQL[] = [];

  if (role === "pitcher") {
    conditions.push(eq(ticketsTable.pitcherId, userId!));
  } else if (role === "provider") {
    conditions.push(eq(ticketsTable.providerId, userId!));
  }

  if (params.data.status) conditions.push(eq(ticketsTable.status, params.data.status as "pending" | "completed"));
  if (params.data.pitcherId != null) conditions.push(eq(ticketsTable.pitcherId, params.data.pitcherId));
  if (params.data.providerId != null) conditions.push(eq(ticketsTable.providerId, params.data.providerId));
  if (params.data.dateFrom) conditions.push(gte(ticketsTable.createdAt, new Date(params.data.dateFrom)));
  if (params.data.dateTo) {
    const end = new Date(params.data.dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(ticketsTable.createdAt, end));
  }

  const rows = conditions.length > 0
    ? await db.select().from(ticketsTable).where(and(...conditions))
    : await db.select().from(ticketsTable);

  const sorted = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const formatted = await Promise.all(sorted.map(formatTicket));
  res.json(formatted);
});

router.post("/tickets", requireRole("pitcher"), async (req, res): Promise<void> => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [provider] = await db.select({ id: usersTable.id }).from(usersTable).where(
    and(eq(usersTable.id, parsed.data.providerId), eq(usersTable.role, "provider"))
  );
  if (!provider) {
    res.status(400).json({ error: "指定的开户商不存在" });
    return;
  }

  const [ticket] = await db.insert(ticketsTable).values({
    pitcherId: req.session.userId!,
    providerId: parsed.data.providerId,
    type: parsed.data.type,
    status: "pending",
    platform: parsed.data.platform ?? null,
    amount: parsed.data.amount ?? null,
    targetBm: parsed.data.targetBm ?? null,
    account: parsed.data.account ?? null,
    remark: parsed.data.remark ?? null,
  }).returning();

  res.status(201).json(await formatTicket(ticket));
});

router.patch("/tickets/:id/complete", requireRole("provider"), async (req, res): Promise<void> => {
  const params = CompleteTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CompleteTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, params.data.id));
  if (!ticket) {
    res.status(404).json({ error: "工单不存在" });
    return;
  }
  if (ticket.providerId !== req.session.userId!) {
    res.status(403).json({ error: "无权操作此工单" });
    return;
  }
  if (ticket.status === "completed") {
    res.status(409).json({ error: "工单已完成，无法重复操作" });
    return;
  }

  const [updated] = await db.update(ticketsTable).set({
    status: "completed",
    completedNote: parsed.data.completedNote ?? null,
    completedAt: new Date(),
  }).where(eq(ticketsTable.id, params.data.id)).returning();

  res.json(await formatTicket(updated));
});

export default router;

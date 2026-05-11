import { Router, type IRouter } from "express";
import { eq, and, gte, lte, SQL, desc } from "drizzle-orm";
import { db, teamsTable, teamFeedbackTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

function formatFeedback(row: typeof teamFeedbackTable.$inferSelect, teamName: string | null) {
  return {
    id: row.id,
    teamId: row.teamId,
    teamName,
    date: row.date,
    leadCount: row.leadCount,
    orderAmount: row.orderAmount,
    description: row.description,
    images: JSON.parse(row.images ?? "[]") as string[],
    submittedAt: row.submittedAt.toISOString(),
  };
}

function formatFeedbackPitcher(row: typeof teamFeedbackTable.$inferSelect, teamName: string | null) {
  return {
    id: row.id,
    teamId: row.teamId,
    teamName,
    date: row.date,
    description: row.description,
    images: JSON.parse(row.images ?? "[]") as string[],
    submittedAt: row.submittedAt.toISOString(),
  };
}

router.get("/public/team-feedback/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token);
  if (!token) { res.status(400).json({ error: "Invalid token" }); return; }

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.publicToken, token));
  if (!team) { res.status(404).json({ error: "链接无效或已过期" }); return; }

  res.json({ teamId: team.id, teamName: team.name });
});

router.post("/public/team-feedback/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token);
  if (!token) { res.status(400).json({ error: "Invalid token" }); return; }

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.publicToken, token));
  if (!team) { res.status(404).json({ error: "链接无效或已过期" }); return; }

  const body = req.body as Record<string, unknown>;
  const date = typeof body.date === "string" ? body.date : null;
  const leadCount = typeof body.leadCount === "number" ? body.leadCount : null;
  const orderAmount = typeof body.orderAmount === "string" ? body.orderAmount : null;
  const description = typeof body.description === "string" ? body.description : "";
  const images = Array.isArray(body.images) ? (body.images as unknown[]).filter((i) => typeof i === "string") as string[] : [];

  if (!date) { res.status(400).json({ error: "date is required" }); return; }
  if (leadCount === null || isNaN(leadCount)) { res.status(400).json({ error: "leadCount must be a number" }); return; }

  const [row] = await db.insert(teamFeedbackTable).values({
    teamId: team.id,
    date,
    leadCount,
    orderAmount: orderAmount ?? null,
    description,
    images: JSON.stringify(images),
  }).returning();

  res.status(201).json(formatFeedback(row, team.name));
});

router.get("/team-feedback", requireRole("admin"), async (req, res): Promise<void> => {
  const query = req.query as Record<string, unknown>;
  const teamId = query.teamId ? parseInt(String(query.teamId), 10) : null;
  const dateFrom = typeof query.dateFrom === "string" ? query.dateFrom : null;
  const dateTo = typeof query.dateTo === "string" ? query.dateTo : null;

  const conditions: SQL[] = [];
  if (teamId && !isNaN(teamId)) conditions.push(eq(teamFeedbackTable.teamId, teamId));
  if (dateFrom) conditions.push(gte(teamFeedbackTable.date, dateFrom));
  if (dateTo) conditions.push(lte(teamFeedbackTable.date, dateTo));

  const rows = await db
    .select({ feedback: teamFeedbackTable, teamName: teamsTable.name })
    .from(teamFeedbackTable)
    .leftJoin(teamsTable, eq(teamFeedbackTable.teamId, teamsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(teamFeedbackTable.submittedAt));

  res.json(rows.map((r) => formatFeedback(r.feedback, r.teamName ?? null)));
});

router.get("/pitcher/team-feedback", requireAuth, async (req, res): Promise<void> => {
  const query = req.query as Record<string, unknown>;
  const teamId = query.teamId ? parseInt(String(query.teamId), 10) : null;
  const dateFrom = typeof query.dateFrom === "string" ? query.dateFrom : null;
  const dateTo = typeof query.dateTo === "string" ? query.dateTo : null;

  const conditions: SQL[] = [];
  if (teamId && !isNaN(teamId)) conditions.push(eq(teamFeedbackTable.teamId, teamId));
  if (dateFrom) conditions.push(gte(teamFeedbackTable.date, dateFrom));
  if (dateTo) conditions.push(lte(teamFeedbackTable.date, dateTo));

  const rows = await db
    .select({ feedback: teamFeedbackTable, teamName: teamsTable.name })
    .from(teamFeedbackTable)
    .leftJoin(teamsTable, eq(teamFeedbackTable.teamId, teamsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(teamFeedbackTable.submittedAt));

  res.json(rows.map((r) => formatFeedbackPitcher(r.feedback, r.teamName ?? null)));
});

export default router;

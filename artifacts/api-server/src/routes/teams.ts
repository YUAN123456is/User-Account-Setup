import { Router, type IRouter } from "express";
import { eq, and, SQL } from "drizzle-orm";
import { db, teamsTable } from "@workspace/db";
import {
  ListTeamsQueryParams,
  CreateTeamBody,
  UpdateTeamBody,
  UpdateTeamParams,
  DeleteTeamParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

router.get("/teams", requireAuth, async (req, res): Promise<void> => {
  const params = ListTeamsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions: SQL[] = [eq(teamsTable.isActive, true)];
  if (params.data.businessType) {
    conditions.push(eq(teamsTable.businessType, params.data.businessType as "liveChat" | "ecommerce"));
  }

  const teams = await db.select().from(teamsTable).where(and(...conditions)).orderBy(teamsTable.name);
  res.json(teams.map((t) => ({
    id: t.id,
    name: t.name,
    businessType: t.businessType,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
  })));
});

router.post("/teams", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [team] = await db.insert(teamsTable).values({
    name: parsed.data.name,
    businessType: parsed.data.businessType as "liveChat" | "ecommerce",
  }).returning();

  res.status(201).json({
    id: team.id,
    name: team.name,
    businessType: team.businessType,
    isActive: team.isActive,
    createdAt: team.createdAt.toISOString(),
  });
});

router.patch("/teams/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  const updates: Partial<typeof teamsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const [team] = await db.update(teamsTable).set(updates).where(eq(teamsTable.id, params.data.id)).returning();

  res.json({
    id: team.id,
    name: team.name,
    businessType: team.businessType,
    isActive: team.isActive,
    createdAt: team.createdAt.toISOString(),
  });
});

router.delete("/teams/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  await db.update(teamsTable).set({ isActive: false }).where(eq(teamsTable.id, params.data.id));
  res.status(204).send();
});

export default router;

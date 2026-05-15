import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * POST /api/admin/restore-zeroed-spends
 *
 * Historical one-time recovery endpoint — now a no-op.
 * The Option B migration (2026-05) consolidated team attribution records
 * into team_breakdowns JSON on the main record and removed the team_id
 * column from daily_stats. There are no more separate team attribution rows
 * to restore.
 */
router.post("/admin/restore-zeroed-spends", (_req, res) => {
  res.json({ ok: true, restored: 0, skipped: 0, report: [], note: "No-op: team attribution rows have been migrated to JSON (Option B)." });
});

export default router;

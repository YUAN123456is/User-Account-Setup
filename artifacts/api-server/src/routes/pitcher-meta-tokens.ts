import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, metaTokensTable, accountsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

const META_GRAPH = "https://graph.facebook.com/v21.0";

interface MetaAdAccount {
  account_id: string;
  name: string;
}

async function fetchAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = `${META_GRAPH}/me/adaccounts?fields=account_id,name&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const json = await res.json() as { data?: MetaAdAccount[]; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.data ?? [];
}

function normalizeId(id: string) {
  return id.replace(/^act_/, "");
}

// GET /api/pitcher/meta-tokens
router.get("/pitcher/meta-tokens", requireAuth, async (req, res): Promise<void> => {
  const pitcherId = req.session.user!.id;
  const rows = await db
    .select({
      id: metaTokensTable.id,
      label: metaTokensTable.label,
      isActive: metaTokensTable.isActive,
      lastSyncAt: metaTokensTable.lastSyncAt,
      lastSyncResult: metaTokensTable.lastSyncResult,
      createdAt: metaTokensTable.createdAt,
    })
    .from(metaTokensTable)
    .where(eq(metaTokensTable.pitcherId, pitcherId))
    .orderBy(metaTokensTable.createdAt);
  res.json(rows);
});

// POST /api/pitcher/meta-tokens
router.post("/pitcher/meta-tokens", requireAuth, async (req, res): Promise<void> => {
  const pitcherId = req.session.user!.id;
  const body = req.body as Record<string, unknown>;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  if (!label || !accessToken) { res.status(400).json({ error: "label 和 accessToken 必填" }); return; }

  const [row] = await db.insert(metaTokensTable).values({ pitcherId, label, accessToken }).returning();
  res.status(201).json({ id: row.id, label: row.label, isActive: row.isActive, lastSyncAt: row.lastSyncAt, lastSyncResult: row.lastSyncResult, createdAt: row.createdAt });
});

// PUT /api/pitcher/meta-tokens/:id
router.put("/pitcher/meta-tokens/:id", requireAuth, async (req, res): Promise<void> => {
  const pitcherId = req.session.user!.id;
  const id = parseInt(req.params.id, 10);
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof metaTokensTable.$inferInsert> = {};
  if (typeof body.label === "string") updates.label = body.label.trim();
  if (typeof body.accessToken === "string" && body.accessToken.trim()) updates.accessToken = body.accessToken.trim();
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
  const [row] = await db
    .update(metaTokensTable).set(updates)
    .where(and(eq(metaTokensTable.id, id), eq(metaTokensTable.pitcherId, pitcherId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: row.id, label: row.label, isActive: row.isActive, lastSyncAt: row.lastSyncAt, lastSyncResult: row.lastSyncResult, createdAt: row.createdAt });
});

// DELETE /api/pitcher/meta-tokens/:id
router.delete("/pitcher/meta-tokens/:id", requireAuth, async (req, res): Promise<void> => {
  const pitcherId = req.session.user!.id;
  const id = parseInt(req.params.id, 10);
  await db.delete(metaTokensTable).where(and(eq(metaTokensTable.id, id), eq(metaTokensTable.pitcherId, pitcherId)));
  res.status(204).end();
});

// GET /api/pitcher/meta-tokens/fb-accounts
// Fetches FB accounts from Meta API + returns current matching status
router.get("/pitcher/meta-tokens/fb-accounts", requireAuth, async (req, res): Promise<void> => {
  const pitcherId = req.session.user!.id;

  const tokens = await db
    .select()
    .from(metaTokensTable)
    .where(and(eq(metaTokensTable.pitcherId, pitcherId), eq(metaTokensTable.isActive, true)));

  // System accounts for this pitcher
  const systemAccounts = await db
    .select({ id: accountsTable.id, accountName: accountsTable.accountName, platformAccountId: accountsTable.platformAccountId })
    .from(accountsTable)
    .where(and(eq(accountsTable.pitcherId, pitcherId), eq(accountsTable.platform, "FB")));

  const result: Array<{
    fbAccountId: string;
    fbAccountName: string;
    tokenId: number;
    tokenLabel: string;
    matchedAccountId: number | null;
    matchedAccountName: string | null;
  }> = [];
  const errors: string[] = [];

  for (const token of tokens) {
    try {
      const fbAccounts = await fetchAdAccounts(token.accessToken);
      for (const fbAcc of fbAccounts) {
        const fbId = normalizeId(fbAcc.account_id);
        const matched = systemAccounts.find((a) => normalizeId(a.platformAccountId) === fbId);
        result.push({
          fbAccountId: fbId,
          fbAccountName: fbAcc.name,
          tokenId: token.id,
          tokenLabel: token.label,
          matchedAccountId: matched?.id ?? null,
          matchedAccountName: matched?.accountName ?? null,
        });
      }
    } catch (err) {
      errors.push(`Token「${token.label}」: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.json({ accounts: result, systemAccounts, errors });
});

// POST /api/pitcher/meta-tokens/match
// Links a FB account to a system account (saves fbAccountId as platformAccountId)
router.post("/pitcher/meta-tokens/match", requireAuth, async (req, res): Promise<void> => {
  const pitcherId = req.session.user!.id;
  const body = req.body as Record<string, unknown>;
  const systemAccountId = typeof body.systemAccountId === "number" ? body.systemAccountId : null;
  const fbAccountId = typeof body.fbAccountId === "string" ? body.fbAccountId.replace(/^act_/, "") : null;

  if (!systemAccountId || !fbAccountId) {
    res.status(400).json({ error: "systemAccountId 和 fbAccountId 必填" }); return;
  }

  // Verify the system account belongs to this pitcher
  const [acct] = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.id, systemAccountId), eq(accountsTable.pitcherId, pitcherId)));
  if (!acct) { res.status(403).json({ error: "账户不存在或无权操作" }); return; }

  await db
    .update(accountsTable)
    .set({ platformAccountId: fbAccountId })
    .where(eq(accountsTable.id, systemAccountId));

  res.json({ ok: true });
});

// POST /api/pitcher/meta-tokens/unmatch
router.post("/pitcher/meta-tokens/unmatch", requireAuth, async (req, res): Promise<void> => {
  const pitcherId = req.session.user!.id;
  const body = req.body as Record<string, unknown>;
  const systemAccountId = typeof body.systemAccountId === "number" ? body.systemAccountId : null;
  if (!systemAccountId) { res.status(400).json({ error: "systemAccountId 必填" }); return; }

  const [acct] = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.id, systemAccountId), eq(accountsTable.pitcherId, pitcherId)));
  if (!acct) { res.status(403).json({ error: "账户不存在或无权操作" }); return; }

  await db
    .update(accountsTable)
    .set({ platformAccountId: "" })
    .where(eq(accountsTable.id, systemAccountId));

  res.json({ ok: true });
});

export default router;

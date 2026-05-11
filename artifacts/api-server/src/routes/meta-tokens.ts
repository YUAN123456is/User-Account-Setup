import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, metaTokensTable, facebookDailySpendTable, accountsTable, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

const META_GRAPH = "https://graph.facebook.com/v21.0";

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function normalizeAccountId(id: string) {
  return id.replace(/^act_/, "");
}

interface MetaAdAccount {
  account_id: string;
  name: string;
  insights?: { data: Array<{ spend: string; currency: string }> };
}

async function fetchAdAccountsWithSpend(accessToken: string): Promise<MetaAdAccount[]> {
  const url = `${META_GRAPH}/me/adaccounts?fields=account_id,name,insights.date_preset(yesterday){spend,currency}&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const json = await res.json() as { data?: MetaAdAccount[]; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.data ?? [];
}

// GET /api/meta-tokens — list all tokens with pitcher info
router.get("/meta-tokens", requireRole("admin"), async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: metaTokensTable.id,
      pitcherId: metaTokensTable.pitcherId,
      pitcherName: usersTable.displayName,
      label: metaTokensTable.label,
      isActive: metaTokensTable.isActive,
      lastSyncAt: metaTokensTable.lastSyncAt,
      lastSyncResult: metaTokensTable.lastSyncResult,
      createdAt: metaTokensTable.createdAt,
    })
    .from(metaTokensTable)
    .leftJoin(usersTable, eq(metaTokensTable.pitcherId, usersTable.id))
    .orderBy(metaTokensTable.createdAt);
  res.json(rows);
});

// POST /api/meta-tokens — create token
router.post("/meta-tokens", requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const pitcherId = typeof body.pitcherId === "number" ? body.pitcherId : null;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  if (!pitcherId || !label || !accessToken) {
    res.status(400).json({ error: "pitcherId, label, accessToken are required" }); return;
  }
  const [row] = await db.insert(metaTokensTable).values({ pitcherId, label, accessToken }).returning();
  res.status(201).json(row);
});

// PUT /api/meta-tokens/:id — update
router.put("/meta-tokens/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof metaTokensTable.$inferInsert> = {};
  if (typeof body.label === "string") updates.label = body.label.trim();
  if (typeof body.accessToken === "string") updates.accessToken = body.accessToken.trim();
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
  if (typeof body.pitcherId === "number") updates.pitcherId = body.pitcherId;
  const [row] = await db.update(metaTokensTable).set(updates).where(eq(metaTokensTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /api/meta-tokens/:id
router.delete("/meta-tokens/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(metaTokensTable).where(eq(metaTokensTable.id, id));
  res.status(204).end();
});

// POST /api/meta-tokens/sync — pull yesterday's data from all active tokens
router.post("/meta-tokens/sync", requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const syncDate = typeof body.date === "string" ? body.date : yesterday();

  const tokens = await db.select().from(metaTokensTable).where(eq(metaTokensTable.isActive, true));
  if (!tokens.length) { res.json({ synced: 0, matched: 0, unmatched: 0, errors: [] }); return; }

  // Load all FB-platform accounts for matching
  const fbAccounts = await db.select().from(accountsTable).where(eq(accountsTable.platform, "FB"));

  let totalSynced = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;
  const errors: string[] = [];

  for (const token of tokens) {
    try {
      const adAccounts = await fetchAdAccountsWithSpend(token.accessToken);
      let matched = 0; let unmatched = 0;

      for (const adAcc of adAccounts) {
        const spend = adAcc.insights?.data?.[0]?.spend ?? "0";
        const currency = adAcc.insights?.data?.[0]?.currency ?? "USD";
        const fbId = normalizeAccountId(adAcc.account_id);

        // Match by platformAccountId (strip act_ from both sides)
        let matchedAccount = fbAccounts.find(
          (a) => normalizeAccountId(a.platformAccountId) === fbId
        );
        // Fallback: match by account name (case-insensitive, trimmed)
        if (!matchedAccount) {
          const nameLower = adAcc.name.trim().toLowerCase();
          matchedAccount = fbAccounts.find(
            (a) => a.accountName.trim().toLowerCase() === nameLower
          );
        }

        if (matchedAccount) matched++; else unmatched++;

        // Upsert into facebook_daily_spend
        await db
          .insert(facebookDailySpendTable)
          .values({
            date: syncDate,
            fbAccountId: fbId,
            fbAccountName: adAcc.name,
            spend,
            currency,
            tokenId: token.id,
            matchedAccountId: matchedAccount?.id ?? null,
          })
          .onConflictDoUpdate({
            target: [facebookDailySpendTable.date, facebookDailySpendTable.fbAccountId],
            set: {
              fbAccountName: adAcc.name,
              spend,
              currency,
              tokenId: token.id,
              matchedAccountId: matchedAccount?.id ?? null,
              syncedAt: new Date(),
            },
          });
        totalSynced++;
      }

      totalMatched += matched;
      totalUnmatched += unmatched;

      await db.update(metaTokensTable)
        .set({
          lastSyncAt: new Date(),
          lastSyncResult: `成功：拉取 ${adAccounts.length} 个账户，匹配 ${matched} 个，未匹配 ${unmatched} 个`,
        })
        .where(eq(metaTokensTable.id, token.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Token「${token.label}」: ${msg}`);
      await db.update(metaTokensTable)
        .set({ lastSyncAt: new Date(), lastSyncResult: `失败：${msg}` })
        .where(eq(metaTokensTable.id, token.id));
    }
  }

  res.json({ date: syncDate, synced: totalSynced, matched: totalMatched, unmatched: totalUnmatched, errors });
});

// GET /api/meta-tokens/spend — query synced spend data
router.get("/meta-tokens/spend", requireRole("admin"), async (req, res): Promise<void> => {
  const query = req.query as Record<string, unknown>;
  const date = typeof query.date === "string" ? query.date : yesterday();

  const rows = await db
    .select({
      id: facebookDailySpendTable.id,
      date: facebookDailySpendTable.date,
      fbAccountId: facebookDailySpendTable.fbAccountId,
      fbAccountName: facebookDailySpendTable.fbAccountName,
      spend: facebookDailySpendTable.spend,
      currency: facebookDailySpendTable.currency,
      matchedAccountId: facebookDailySpendTable.matchedAccountId,
      matchedAccountName: accountsTable.accountName,
      syncedAt: facebookDailySpendTable.syncedAt,
    })
    .from(facebookDailySpendTable)
    .leftJoin(accountsTable, eq(facebookDailySpendTable.matchedAccountId, accountsTable.id))
    .where(eq(facebookDailySpendTable.date, date))
    .orderBy(facebookDailySpendTable.fbAccountName);

  res.json(rows);
});

export default router;

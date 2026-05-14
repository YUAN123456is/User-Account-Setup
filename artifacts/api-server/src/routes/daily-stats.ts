import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray, desc, SQL, isNull } from "drizzle-orm";
import { db, dailyStatsTable, accountsTable, usersTable, teamsTable } from "@workspace/db";
import {
  CreateDailyStatBody,
  UpdateDailyStatBody,
  ListDailyStatsQueryParams,
  UpdateDailyStatParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/require-auth";
import { recalculateBalance, syncAccountBalance } from "../lib/balance";

const router: IRouter = Router();

async function formatStat(stat: typeof dailyStatsTable.$inferSelect) {
  const account = stat.accountId
    ? (await db.select({ accountName: accountsTable.accountName, platformAccountId: accountsTable.platformAccountId, currentBalance: accountsTable.currentBalance }).from(accountsTable).where(eq(accountsTable.id, stat.accountId)))[0]
    : null;
  const pitcher = stat.pitcherId
    ? (await db.select({ displayName: usersTable.displayName, username: usersTable.username }).from(usersTable).where(eq(usersTable.id, stat.pitcherId)))[0]
    : null;
  const team = stat.teamId
    ? (await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, stat.teamId)))[0]
    : null;

  const spend = parseFloat(stat.spendAmount);
  const fanCount = stat.fanCount ?? null;
  const gmv = stat.gmv != null ? parseFloat(stat.gmv) : null;
  const orderCount = stat.orderCount ?? null;

  const fanCost = fanCount && fanCount > 0 ? (spend / fanCount).toFixed(4) : null;
  const roas = gmv != null && spend > 0 ? (gmv / spend).toFixed(4) : null;
  const avgOrderValue = gmv != null && orderCount && orderCount > 0 ? (gmv / orderCount).toFixed(2) : null;

  return {
    id: stat.id,
    accountId: stat.accountId,
    accountName: account?.accountName ?? null,
    platformAccountId: account?.platformAccountId ?? null,
    accountCurrentBalance: account?.currentBalance ?? null,
    date: stat.date,
    spendAmount: stat.spendAmount,
    realBalance: stat.realBalance,
    pitcherId: stat.pitcherId,
    pitcherName: pitcher?.displayName ?? pitcher?.username ?? null,
    hasAlert: stat.hasAlert,
    businessType: stat.businessType ?? null,
    teamId: stat.teamId ?? null,
    teamName: team?.name ?? null,
    fanCount: stat.fanCount ?? null,
    fanCost,
    gmv: stat.gmv ?? null,
    orderCount: stat.orderCount ?? null,
    roas,
    avgOrderValue,
    fbSynced: stat.fbSynced,
    status: stat.status,
    reviewNote: stat.reviewNote ?? null,
    createdAt: stat.createdAt.toISOString(),
  };
}

router.get("/daily-stats", requireAuth, async (req, res): Promise<void> => {
  const params = ListDailyStatsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions: SQL[] = [];
  const { role, userId } = req.session as { role?: string; userId?: number };

  if (role === "pitcher") {
    conditions.push(eq(dailyStatsTable.pitcherId, userId!));
  } else if (role === "provider") {
    const providerAccounts = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.providerId, userId!));
    const ids = providerAccounts.map((a) => a.id);
    if (ids.length === 0) { res.json([]); return; }
    conditions.push(inArray(dailyStatsTable.accountId, ids));
  }

  if (params.data.accountId != null) conditions.push(eq(dailyStatsTable.accountId, params.data.accountId));
  if (params.data.pitcherId != null && role === "admin") conditions.push(eq(dailyStatsTable.pitcherId, params.data.pitcherId));
  if (params.data.dateFrom) conditions.push(gte(dailyStatsTable.date, params.data.dateFrom));
  if (params.data.dateTo) conditions.push(lte(dailyStatsTable.date, params.data.dateTo));

  const stats = conditions.length > 0
    ? await db.select().from(dailyStatsTable).where(and(...conditions)).orderBy(desc(dailyStatsTable.date), desc(dailyStatsTable.createdAt))
    : await db.select().from(dailyStatsTable).orderBy(desc(dailyStatsTable.date), desc(dailyStatsTable.createdAt));

  const formatted = await Promise.all(stats.map(formatStat));
  res.json(formatted);
});

// GET /api/daily-stats/pending — admin views pending manual submissions
router.get("/daily-stats/pending", requireRole("admin"), async (req, res): Promise<void> => {
  const stats = await db
    .select()
    .from(dailyStatsTable)
    .where(eq(dailyStatsTable.status, "pending"))
    .orderBy(dailyStatsTable.createdAt);
  const formatted = await Promise.all(stats.map(formatStat));
  res.json(formatted);
});

// POST /api/daily-stats/:id/approve — admin approves (balance unchanged: pending already counted)
router.post("/daily-stats/:id/approve", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as { note?: string };
  const [stat] = await db
    .update(dailyStatsTable)
    .set({ status: "approved", reviewNote: body.note ?? null })
    .where(eq(dailyStatsTable.id, id))
    .returning();
  if (!stat) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await formatStat(stat));
});

// POST /api/daily-stats/:id/reject — admin rejects
// Rejected records are excluded from the balance sum, so balance auto-restores via recalculate.
// Both the status update and balance sync run in one transaction for consistency.
router.post("/daily-stats/:id/reject", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as { note?: string };
  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  let stat: typeof dailyStatsTable.$inferSelect;
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(dailyStatsTable)
      .set({ status: "rejected", reviewNote: body.note ?? null })
      .where(eq(dailyStatsTable.id, id))
      .returning();
    stat = updated;
    if (existing.accountId && existing.teamId == null) {
      await syncAccountBalance(existing.accountId, tx);
    }
  });

  res.json(await formatStat(stat!));
});

// DELETE /api/daily-stats/:id — admin hard-deletes a record (requires admin password)
router.delete("/daily-stats/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as { password?: string };
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || body.password !== adminPassword) {
    res.status(403).json({ error: "密码错误" });
    return;
  }

  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  if (!existing) { res.status(404).json({ error: "记录不存在" }); return; }

  const accountId = existing.accountId;
  const isMainRecord = existing.teamId == null;

  await db.transaction(async (tx) => {
    // Cascade delete: main record → all records for same account+date;
    // team record with no main sibling → all siblings; otherwise just this record.
    if (isMainRecord && accountId && existing.date) {
      await tx.delete(dailyStatsTable).where(
        and(eq(dailyStatsTable.accountId, accountId), eq(dailyStatsTable.date, existing.date))
      );
    } else if (accountId && existing.date) {
      const [mainRecord] = await tx.select({ id: dailyStatsTable.id }).from(dailyStatsTable).where(
        and(eq(dailyStatsTable.accountId, accountId), eq(dailyStatsTable.date, existing.date), isNull(dailyStatsTable.teamId))
      );
      if (!mainRecord) {
        await tx.delete(dailyStatsTable).where(
          and(eq(dailyStatsTable.accountId, accountId), eq(dailyStatsTable.date, existing.date))
        );
      } else {
        await tx.delete(dailyStatsTable).where(eq(dailyStatsTable.id, id));
      }
    } else {
      await tx.delete(dailyStatsTable).where(eq(dailyStatsTable.id, id));
    }

    // Deleted records are no longer in the table, so recalculate auto-corrects the balance.
    if (isMainRecord && accountId) {
      await syncAccountBalance(accountId, tx);
    }
  });

  res.json({ ok: true });
});

// DELETE /api/daily-stats/:id/self — pitcher deletes their own rejected record
router.delete("/daily-stats/:id/self", requireRole("pitcher"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, id));
  if (!existing) { res.status(404).json({ error: "记录不存在" }); return; }

  if (existing.pitcherId !== req.session.userId) {
    res.status(403).json({ error: "无权限删除此记录" }); return;
  }
  if (existing.status !== "rejected" || existing.fbSynced) {
    res.status(400).json({ error: "只能删除已驳回且未FB同步的记录" }); return;
  }

  const accountId = existing.accountId;
  const isMainRecord = existing.teamId == null;

  await db.transaction(async (tx) => {
    if (isMainRecord && accountId && existing.date) {
      await tx.delete(dailyStatsTable).where(
        and(
          eq(dailyStatsTable.accountId, accountId),
          eq(dailyStatsTable.date, existing.date),
          eq(dailyStatsTable.pitcherId, existing.pitcherId!),
        )
      );
    } else {
      await tx.delete(dailyStatsTable).where(eq(dailyStatsTable.id, id));
    }
    // Record was already rejected (excluded from balance sum), so this delete is a no-op for balance.
    // Still sync for correctness in case of data drift.
    if (isMainRecord && accountId) {
      await syncAccountBalance(accountId, tx);
    }
  });

  res.json({ ok: true });
});

router.post("/daily-stats", requireRole("pitcher"), async (req, res): Promise<void> => {
  const parsed = CreateDailyStatBody.safeParse(req.body);
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

  // Team split records (teamId != null) are attribution-only: spend=0, no balance effect.
  // Main records (teamId=null) carry the actual spend and deduct the balance.
  const isTeamSplitRecord = parsed.data.teamId != null;
  const rawSpend = parsed.data.spendAmount ? parseFloat(parsed.data.spendAmount) : 0;
  const spend = isTeamSplitRecord ? 0 : rawSpend;

  const dupConditions = parsed.data.teamId != null
    ? and(eq(dailyStatsTable.accountId, parsed.data.accountId), eq(dailyStatsTable.date, parsed.data.date), eq(dailyStatsTable.teamId, parsed.data.teamId))
    : and(eq(dailyStatsTable.accountId, parsed.data.accountId), eq(dailyStatsTable.date, parsed.data.date), isNull(dailyStatsTable.teamId));
  const existing = await db.select({ id: dailyStatsTable.id }).from(dailyStatsTable).where(dupConditions);
  if (existing.length > 0) {
    res.status(409).json({ error: "该账户今日相同团队数据已上报，如需修改请使用编辑功能" });
    return;
  }

  let stat!: typeof dailyStatsTable.$inferSelect;
  try {
    await db.transaction(async (tx) => {
      // Recalculate balance before insert so realBalance snapshot is accurate.
      // preBalance = balance before this spend; realBalance = balance after.
      const preBalance = await recalculateBalance(parsed.data.accountId, tx);
      const realBalance = isTeamSplitRecord
        ? preBalance
        : (parseFloat(preBalance) - spend).toFixed(2);

      const [inserted] = await tx.insert(dailyStatsTable).values({
        accountId: parsed.data.accountId,
        date: parsed.data.date,
        spendAmount: spend.toFixed(2),
        realBalance,
        pitcherId: req.session.userId!,
        hasAlert: !isTeamSplitRecord && parseFloat(realBalance) < 100,
        businessType: (parsed.data.businessType as "liveChat" | "ecommerce" | null | undefined) ?? null,
        teamId: parsed.data.teamId ?? null,
        fanCount: parsed.data.fanCount ?? null,
        gmv: parsed.data.gmv ?? null,
        orderCount: parsed.data.orderCount ?? null,
        status: isTeamSplitRecord ? "approved" : "pending",
        fbSynced: false,
      }).returning();
      stat = inserted;

      if (!isTeamSplitRecord) {
        await syncAccountBalance(parsed.data.accountId, tx);
      }
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "该账户今日相同团队数据已上报，如需修改请使用编辑功能" });
      return;
    }
    throw err;
  }

  res.status(201).json(await formatStat(stat));
});

router.patch("/daily-stats/:id", requireRole("pitcher"), async (req, res): Promise<void> => {
  const params = UpdateDailyStatParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateDailyStatBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(dailyStatsTable).where(eq(dailyStatsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Stat not found" }); return; }
  if (existing.pitcherId !== req.session.userId!) { res.status(403).json({ error: "Forbidden" }); return; }

  const isTeamRecord = existing.teamId != null;
  // teamId is immutable after creation — changing it would corrupt balance accounting.
  const spendChanged = parsed.data.spendAmount != null && !isTeamRecord;

  const updates: Partial<typeof dailyStatsTable.$inferInsert> = {};
  if (parsed.data.businessType !== undefined) updates.businessType = (parsed.data.businessType as "liveChat" | "ecommerce" | null | undefined) ?? null;
  if (parsed.data.fanCount !== undefined) updates.fanCount = parsed.data.fanCount ?? null;
  if (parsed.data.gmv !== undefined) updates.gmv = parsed.data.gmv ?? null;
  if (parsed.data.orderCount !== undefined) updates.orderCount = parsed.data.orderCount ?? null;
  if (spendChanged) updates.spendAmount = parsed.data.spendAmount!;

  if (!spendChanged && Object.keys(updates).length === 0) {
    res.json(await formatStat(existing)); return;
  }

  if (isTeamRecord) {
    // Team records: no spend changes allowed, metadata edits stay approved.
  } else {
    if (existing.status !== "approved" || spendChanged) {
      updates.status = "pending";
      updates.reviewNote = null;
    }
  }

  let stat: typeof dailyStatsTable.$inferSelect;

  if (spendChanged && existing.accountId) {
    await db.transaction(async (tx) => {
      // Compute new realBalance from source of truth before the DB update.
      // preBalance already includes existing.spendAmount in the sum, so:
      //   newBalance = preBalance - newSpend + oldSpend
      const preBalance = await recalculateBalance(existing.accountId!, tx);
      const oldSpend = parseFloat(existing.spendAmount);
      const newSpend = parseFloat(parsed.data.spendAmount!);
      const newBalance = (parseFloat(preBalance) - newSpend + oldSpend).toFixed(2);

      updates.realBalance = newBalance;
      updates.hasAlert = parseFloat(newBalance) < 100;

      const [updated] = await tx
        .update(dailyStatsTable)
        .set(updates)
        .where(eq(dailyStatsTable.id, params.data.id))
        .returning();
      stat = updated;

      await syncAccountBalance(existing.accountId!, tx);
    });
  } else {
    const [updated] = await db.update(dailyStatsTable).set(updates).where(eq(dailyStatsTable.id, params.data.id)).returning();
    stat = updated;
  }

  res.json(await formatStat(stat!));
});

export default router;

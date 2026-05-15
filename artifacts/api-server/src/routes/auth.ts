import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { verifyPassword } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.username = user.username;

  const payload = {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      portalSlug: user.portalSlug,
      canAssignAccounts: user.canAssignAccounts,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    },
  };

  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session save failed" });
      return;
    }
    res.json(payload);
  });
});

router.get("/auth/magic/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.magicToken, token));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "链接无效或已被停用" });
    return;
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.username = user.username;
  req.session.save((err) => {
    if (err) { res.status(500).json({ error: "Session save failed" }); return; }
    res.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      portalSlug: user.portalSlug,
      canAssignAccounts: user.canAssignAccounts,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    });
  });
});

// ── Dev-only: create a test session for E2E testing ───────────────────────────
// Only active when NODE_ENV=development. Never compiled into production builds.
if (process.env["NODE_ENV"] === "development") {
  router.post("/auth/dev-login", async (req, res): Promise<void> => {
    const { role } = req.body as { role?: string };
    if (!role || !["admin", "pitcher", "provider"].includes(role)) {
      res.status(400).json({ error: "role must be admin | pitcher | provider" });
      return;
    }
    const testUsername = `e2e_test_${role}`;
    let [user] = await db.select().from(usersTable).where(eq(usersTable.username, testUsername));
    if (!user) {
      [user] = await db
        .insert(usersTable)
        .values({
          username: testUsername,
          displayName: `E2E测试${role}`,
          passwordHash: "dev-only-not-used",
          role: role as "admin" | "pitcher" | "provider",
          isActive: true,
        })
        .returning();
    } else if (!user.isActive) {
      [user] = await db
        .update(usersTable)
        .set({ isActive: true })
        .where(eq(usersTable.username, testUsername))
        .returning();
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;
    req.session.save((err) => {
      if (err) { res.status(500).json({ error: "Session save failed" }); return; }
      res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, isActive: user.isActive, canAssignAccounts: user.canAssignAccounts } });
    });
  });
}

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.sendStatus(204);
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    portalSlug: user.portalSlug,
    canAssignAccounts: user.canAssignAccounts,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;

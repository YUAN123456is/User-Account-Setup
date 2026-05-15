import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

export async function initAdminUser(): Promise<void> {
  const username = process.env["ADMIN_USERNAME"];
  const password = process.env["ADMIN_PASSWORD"];

  if (!username || !password) {
    logger.warn("ADMIN_USERNAME or ADMIN_PASSWORD not set — skipping admin init");
    return;
  }

  const passwordHash = await hashPassword(password);

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (existing) {
    await db
      .update(usersTable)
      .set({ username, passwordHash, isActive: true })
      .where(eq(usersTable.id, existing.id));
    logger.info({ username }, "Admin user updated from env vars");
  } else {
    await db.insert(usersTable).values({
      username,
      displayName: "超级管理员",
      passwordHash,
      role: "admin",
      portalSlug: "admin",
      isActive: true,
    });
    logger.info({ username }, "Admin user created from env vars");
  }
}

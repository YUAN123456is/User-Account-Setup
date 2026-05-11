import { pgTable, serial, timestamp, text, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const metaTokensTable = pgTable("meta_tokens", {
  id: serial("id").primaryKey(),
  pitcherId: integer("pitcher_id").notNull().references(() => usersTable.id),
  label: text("label").notNull(),
  accessToken: text("access_token").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncResult: text("last_sync_result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MetaToken = typeof metaTokensTable.$inferSelect;
export type InsertMetaToken = typeof metaTokensTable.$inferInsert;

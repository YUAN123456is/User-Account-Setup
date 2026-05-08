import { pgTable, text, serial, timestamp, integer, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  platformAccountId: text("platform_account_id").notNull(),
  accountName: text("account_name").notNull(),
  platform: text("platform", { enum: ["FB", "GG", "TT", "TW", "OTHER"] }).notNull(),
  providerId: integer("provider_id").notNull().references(() => usersTable.id),
  pitcherId: integer("pitcher_id").references(() => usersTable.id),
  status: text("status", { enum: ["idle", "active", "banned"] }).notNull().default("idle"),
  currentBalance: decimal("current_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  theoreticalBalance: decimal("theoretical_balance", { precision: 18, scale: 2 }),
  lastReportedAt: timestamp("last_reported_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;

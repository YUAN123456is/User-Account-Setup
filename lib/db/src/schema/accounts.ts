import { pgTable, text, serial, timestamp, integer, decimal, boolean } from "drizzle-orm/pg-core";
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
  // balanceOffset stores any "out-of-band" balance adjustments that aren't tracked in
  // recharge_orders. Set at account creation (initialBalance), and updated whenever
  // clearBalance or set-balance is called, so that recalculateBalance always returns
  // the correct value even after manual overrides. Default 0 (safe for existing rows).
  balanceOffset: decimal("balance_offset", { precision: 18, scale: 2 }).notNull().default("0"),
  lastReportedAt: timestamp("last_reported_at", { withTimezone: true }),
  banNotifyProvider: boolean("ban_notify_provider").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;

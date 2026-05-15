import { pgTable, serial, timestamp, integer, decimal, text, boolean, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { usersTable } from "./users";

/**
 * One row per (account_id, date).
 *
 * team_breakdowns: optional JSON array — embedded when the account is served by
 * one or more liveChat teams. Stored denormalised (teamName copied at write time)
 * so queries never need to join teams for display.
 *
 * fan_count: total fans across all team breakdowns (sum), or the single-team /
 * FB-provided fan count when no breakdowns are present.
 *
 * Balance formula uses ALL rows in this table (status pending|approved).
 * No team_id column exists — the old "team attribution record" pattern is gone.
 */
export type TeamBreakdown = {
  teamId: number;
  teamName: string;
  fanCount: number | null;
};

export const dailyStatsTable = pgTable("daily_stats", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  date: text("date").notNull(),
  spendAmount: decimal("spend_amount", { precision: 18, scale: 2 }).notNull(),
  realBalance: decimal("real_balance", { precision: 18, scale: 2 }).notNull(),
  pitcherId: integer("pitcher_id").notNull().references(() => usersTable.id),
  hasAlert: boolean("has_alert").notNull().default(false),
  businessType: text("business_type", { enum: ["liveChat", "ecommerce"] }),
  teamBreakdowns: jsonb("team_breakdowns").$type<TeamBreakdown[]>(),
  fanCount: integer("fan_count"),
  gmv: decimal("gmv", { precision: 18, scale: 2 }),
  orderCount: integer("order_count"),
  fbSynced: boolean("fb_synced").notNull().default(false),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // One record per (account, date) — enforced at both DB and application level.
  uniqueIndex("daily_stats_account_date_unique").on(t.accountId, t.date),
]);

export const insertDailyStatSchema = createInsertSchema(dailyStatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyStat = z.infer<typeof insertDailyStatSchema>;
export type DailyStat = typeof dailyStatsTable.$inferSelect;

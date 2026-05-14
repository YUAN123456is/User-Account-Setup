import { pgTable, serial, timestamp, integer, decimal, text, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { usersTable } from "./users";
import { teamsTable } from "./teams";

export const dailyStatsTable = pgTable("daily_stats", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  date: text("date").notNull(),
  spendAmount: decimal("spend_amount", { precision: 18, scale: 2 }).notNull(),
  realBalance: decimal("real_balance", { precision: 18, scale: 2 }).notNull(),
  pitcherId: integer("pitcher_id").notNull().references(() => usersTable.id),
  hasAlert: boolean("has_alert").notNull().default(false),
  businessType: text("business_type", { enum: ["liveChat", "ecommerce"] }),
  teamId: integer("team_id").references(() => teamsTable.id),
  fanCount: integer("fan_count"),
  gmv: decimal("gmv", { precision: 18, scale: 2 }),
  orderCount: integer("order_count"),
  fbSynced: boolean("fb_synced").notNull().default(false),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // Prevent duplicate main records: one per (account, date) where teamId IS NULL
  uniqueIndex("daily_stats_main_unique").on(t.accountId, t.date).where(sql`${t.teamId} IS NULL`),
  // Prevent duplicate team attribution records: one per (account, date, team)
  uniqueIndex("daily_stats_team_unique").on(t.accountId, t.date, t.teamId).where(sql`${t.teamId} IS NOT NULL`),
]);

export const insertDailyStatSchema = createInsertSchema(dailyStatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyStat = z.infer<typeof insertDailyStatSchema>;
export type DailyStat = typeof dailyStatsTable.$inferSelect;

import { pgTable, serial, timestamp, integer, decimal, text, boolean } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDailyStatSchema = createInsertSchema(dailyStatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyStat = z.infer<typeof insertDailyStatSchema>;
export type DailyStat = typeof dailyStatsTable.$inferSelect;

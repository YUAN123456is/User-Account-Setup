import { pgTable, serial, timestamp, text, integer, decimal, unique } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts";
import { metaTokensTable } from "./meta-tokens";

export const facebookDailySpendTable = pgTable("facebook_daily_spend", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  fbAccountId: text("fb_account_id").notNull(),
  fbAccountName: text("fb_account_name").notNull(),
  spend: decimal("spend", { precision: 18, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  tokenId: integer("token_id").notNull().references(() => metaTokensTable.id),
  matchedAccountId: integer("matched_account_id").references(() => accountsTable.id),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("facebook_daily_spend_date_fb_account_id_unique").on(t.date, t.fbAccountId),
]);

export type FacebookDailySpend = typeof facebookDailySpendTable.$inferSelect;
export type InsertFacebookDailySpend = typeof facebookDailySpendTable.$inferInsert;

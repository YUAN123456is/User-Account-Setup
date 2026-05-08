import { pgTable, serial, timestamp, integer, decimal, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { usersTable } from "./users";

export const rechargeOrdersTable = pgTable("recharge_orders", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  status: text("status", { enum: ["pending", "completed", "rejected"] }).notNull().default("pending"),
  providerId: integer("provider_id").notNull().references(() => usersTable.id),
  pitcherId: integer("pitcher_id").references(() => usersTable.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRechargeOrderSchema = createInsertSchema(rechargeOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRechargeOrder = z.infer<typeof insertRechargeOrderSchema>;
export type RechargeOrder = typeof rechargeOrdersTable.$inferSelect;

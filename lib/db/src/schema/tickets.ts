import { pgTable, serial, timestamp, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  pitcherId: integer("pitcher_id").notNull().references(() => usersTable.id),
  providerId: integer("provider_id").notNull().references(() => usersTable.id),
  type: text("type", { enum: ["new_account", "rebind_bm"] }).notNull(),
  status: text("status", { enum: ["pending", "completed"] }).notNull().default("pending"),
  platform: text("platform"),
  amount: text("amount"),
  targetBm: text("target_bm"),
  account: text("account"),
  remark: text("remark"),
  completedNote: text("completed_note"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;

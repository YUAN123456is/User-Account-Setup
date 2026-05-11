import { pgTable, serial, timestamp, integer, decimal, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

export const teamFeedbackTable = pgTable("team_feedback", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id),
  date: text("date").notNull(),
  leadCount: integer("lead_count").notNull(),
  orderAmount: decimal("order_amount", { precision: 18, scale: 2 }),
  description: text("description").notNull().default(""),
  images: text("images").notNull().default("[]"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTeamFeedbackSchema = createInsertSchema(teamFeedbackTable).omit({ id: true, submittedAt: true });
export type InsertTeamFeedback = z.infer<typeof insertTeamFeedbackSchema>;
export type TeamFeedback = typeof teamFeedbackTable.$inferSelect;

import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Team logos table for storing team logo assignments by league owners
export const teamLogos = pgTable("team_logos", {
  id: serial("id").primaryKey(),
  leagueId: varchar("league_id", { length: 255 }).notNull(),
  teamName: varchar("team_name", { length: 255 }).notNull(),
  logoUrl: text("logo_url").notNull(),
  uploadedBy: varchar("uploaded_by", { length: 255 }).notNull(), // User ID of league owner
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTeamLogoSchema = createInsertSchema(teamLogos).pick({
  leagueId: true,
  teamName: true,
  logoUrl: true,
  uploadedBy: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTeamLogo = z.infer<typeof insertTeamLogoSchema>;
export type TeamLogo = typeof teamLogos.$inferSelect;

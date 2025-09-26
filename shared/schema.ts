import { pgTable, text, serial, integer, boolean, timestamp, varchar, jsonb, uuid } from "drizzle-orm/pg-core";
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

// Players table for storing player information
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  full_name: varchar("full_name", { length: 255 }),
  team: varchar("team", { length: 255 }),
  position: varchar("position", { length: 10 }),
  number: integer("number"),
  league_id: varchar("league_id", { length: 255 }).notNull(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Player stats table for storing individual player performance data
export const playerStats = pgTable("player_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  league_id: varchar("league_id", { length: 255 }).notNull(),
  player_id: uuid("player_id").notNull(), // References players.id
  user_id: varchar("user_id", { length: 255 }),
  game_id: varchar("game_id", { length: 255 }),
  game_date: timestamp("game_date"),
  team: varchar("team", { length: 255 }),
  name: varchar("name", { length: 255 }), // Keep for backward compatibility
  full_name: varchar("full_name", { length: 255 }),
  number: integer("number"),
  position: varchar("position", { length: 10 }),
  starter: boolean("starter").default(false),
  captain: boolean("captain").default(false),
  
  // Basic game info
  home_team: varchar("home_team", { length: 255 }),
  away_team: varchar("away_team", { length: 255 }),
  is_home_player: boolean("is_home_player"),
  
  // Stats with 's' prefix (as used in existing code)
  spoints: integer("spoints").default(0),
  sminutes: varchar("sminutes", { length: 50 }).default("0:00"),
  sfieldgoalsmade: integer("sfieldgoalsmade").default(0),
  sfieldgoalsattempted: integer("sfieldgoalsattempted").default(0),
  sfieldgoalspercentage: integer("sfieldgoalspercentage").default(0),
  sthreepointersmade: integer("sthreepointersmade").default(0),
  sthreepointersattempted: integer("sthreepointersattempted").default(0),
  sthreepointerspercentage: integer("sthreepointerspercentage").default(0),
  stwopointersmade: integer("stwopointersmade").default(0),
  stwopointersattempted: integer("stwopointersattempted").default(0),
  stwopointerspercentage: integer("stwopointerspercentage").default(0),
  sfreethrowsmade: integer("sfreethrowsmade").default(0),
  sfreethrowsattempted: integer("sfreethrowsattempted").default(0),
  sfreethrowspercentage: integer("sfreethrowspercentage").default(0),
  sreboundstotal: integer("sreboundstotal").default(0),
  sreboundsoffensive: integer("sreboundsoffensive").default(0),
  sreboundsdefensive: integer("sreboundsdefensive").default(0),
  sassists: integer("sassists").default(0),
  ssteals: integer("ssteals").default(0),
  sblocks: integer("sblocks").default(0),
  sblocksreceived: integer("sblocksreceived").default(0),
  sturnovers: integer("sturnovers").default(0),
  sfoulspersonal: integer("sfoulspersonal").default(0),
  sfoulstechnical: integer("sfoulstechnical").default(0),
  
  // Efficiency ratings
  eff_1: integer("eff_1").default(0),
  eff_2: integer("eff_2").default(0), 
  eff_3: integer("eff_3").default(0),
  eff_4: integer("eff_4").default(0),
  eff_5: integer("eff_5").default(0),
  eff_6: integer("eff_6").default(0),
  eff_7: integer("eff_7").default(0),
  
  // Alternative field names also used in code
  points: integer("points").default(0),
  rebounds_total: integer("rebounds_total").default(0),
  assists: integer("assists").default(0),
  
  is_public: boolean("is_public").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

// Team stats table for storing aggregated team performance data
export const teamStats = pgTable("team_stats", {
  id: serial("id").primaryKey(),
  leagueId: varchar("league_id", { length: 255 }).notNull(),
  teamName: varchar("team_name", { length: 255 }).notNull(),
  gameId: varchar("game_id", { length: 255 }).notNull(),
  gameDate: timestamp("game_date").notNull(),
  opponent: varchar("opponent", { length: 255 }).notNull(),
  isHome: boolean("is_home").notNull().default(false),
  teamScore: integer("team_score").notNull().default(0),
  opponentScore: integer("opponent_score").notNull().default(0),
  won: boolean("won").notNull().default(false),
  fieldGoalsMade: integer("field_goals_made").default(0),
  fieldGoalsAttempted: integer("field_goals_attempted").default(0),
  threePointsMade: integer("three_points_made").default(0),
  threePointsAttempted: integer("three_points_attempted").default(0),
  freeThrowsMade: integer("free_throws_made").default(0),
  freeThrowsAttempted: integer("free_throws_attempted").default(0),
  totalRebounds: integer("total_rebounds").default(0),
  assists: integer("assists").default(0),
  steals: integer("steals").default(0),
  blocks: integer("blocks").default(0),
  turnovers: integer("turnovers").default(0),
  personalFouls: integer("personal_fouls").default(0),
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

export const insertPlayersSchema = createInsertSchema(players).pick({
  name: true,
  full_name: true,
  team: true,
  position: true,
  number: true,
  league_id: true,
  is_active: true,
});

export const insertPlayerStatsSchema = createInsertSchema(playerStats).pick({
  league_id: true,
  player_id: true,
  user_id: true,
  game_id: true,
  game_date: true,
  team: true,
  name: true,
  full_name: true,
  number: true,
  position: true,
  starter: true,
  captain: true,
  home_team: true,
  away_team: true,
  is_home_player: true,
  spoints: true,
  sminutes: true,
  sfieldgoalsmade: true,
  sfieldgoalsattempted: true,
  sfieldgoalspercentage: true,
  sthreepointersmade: true,
  sthreepointersattempted: true,
  sthreepointerspercentage: true,
  stwopointersmade: true,
  stwopointersattempted: true,
  stwopointerspercentage: true,
  sfreethrowsmade: true,
  sfreethrowsattempted: true,
  sfreethrowspercentage: true,
  sreboundstotal: true,
  sreboundsoffensive: true,
  sreboundsdefensive: true,
  sassists: true,
  ssteals: true,
  sblocks: true,
  sblocksreceived: true,
  sturnovers: true,
  sfoulspersonal: true,
  sfoulstechnical: true,
  eff_1: true,
  eff_2: true,
  eff_3: true,
  eff_4: true,
  eff_5: true,
  eff_6: true,
  eff_7: true,
  points: true,
  rebounds_total: true,
  assists: true,
  is_public: true,
});

export const insertTeamStatsSchema = createInsertSchema(teamStats).pick({
  leagueId: true,
  teamName: true,
  gameId: true,
  gameDate: true,
  opponent: true,
  isHome: true,
  teamScore: true,
  opponentScore: true,
  won: true,
  fieldGoalsMade: true,
  fieldGoalsAttempted: true,
  threePointsMade: true,
  threePointsAttempted: true,
  freeThrowsMade: true,
  freeThrowsAttempted: true,
  totalRebounds: true,
  assists: true,
  steals: true,
  blocks: true,
  turnovers: true,
  personalFouls: true,
});

// Enhanced scouting documents table for Notion-style editor
export const scoutingDocuments = pgTable("scouting_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  content: jsonb("content").notNull(), // TipTap JSON content
  context: jsonb("context"), // League/game/team context data
  ownerId: varchar("owner_id", { length: 255 }).notNull(),
  templateId: varchar("template_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("draft"), // draft, published, archived
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document templates table
export const documentTemplates = pgTable("document_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  content: jsonb("content").notNull(), // TipTap JSON template
  thumbnailUrl: text("thumbnail_url"),
  category: varchar("category", { length: 100 }).default("general"), // scouting, game-recap, pre-game, etc.
  isPublic: boolean("is_public").default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document assets table (for images, PDFs, etc.)
export const documentAssets = pgTable("document_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").references(() => scoutingDocuments.id),
  type: varchar("type", { length: 50 }).notNull(), // image, pdf, video, etc.
  url: text("url").notNull(),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"),
  metadata: jsonb("metadata"), // width, height, duration, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Scouting reports table for the new template system
export const scoutingReports = pgTable("scouting_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  leagueId: uuid("league_id").notNull(),
  playerName: text("player_name").notNull(),
  templateId: text("template_id").notNull(), // e.g. "clean-pro"
  data: jsonb("data").notNull(), // ScoutingReport payload
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScoutingDocumentSchema = createInsertSchema(scoutingDocuments).pick({
  title: true,
  content: true,
  context: true,
  ownerId: true,
  templateId: true,
  status: true,
});

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates).pick({
  name: true,
  description: true,
  content: true,
  thumbnailUrl: true,
  category: true,
  isPublic: true,
  createdBy: true,
});

export const insertDocumentAssetSchema = createInsertSchema(documentAssets).pick({
  documentId: true,
  type: true,
  url: true,
  fileName: true,
  fileSize: true,
  metadata: true,
});

export const insertScoutingReportSchema = createInsertSchema(scoutingReports).pick({
  leagueId: true,
  playerName: true,
  templateId: true,
  data: true,
  createdBy: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTeamLogo = z.infer<typeof insertTeamLogoSchema>;
export type TeamLogo = typeof teamLogos.$inferSelect;
export type InsertPlayerStats = z.infer<typeof insertPlayerStatsSchema>;
export type PlayerStats = typeof playerStats.$inferSelect;
export type InsertTeamStats = z.infer<typeof insertTeamStatsSchema>;
export type TeamStats = typeof teamStats.$inferSelect;

export type ScoutingDocument = typeof scoutingDocuments.$inferSelect;
export type InsertScoutingDocument = z.infer<typeof insertScoutingDocumentSchema>;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type DocumentAsset = typeof documentAssets.$inferSelect;
export type InsertDocumentAsset = z.infer<typeof insertDocumentAssetSchema>;
export type ScoutingReportRecord = typeof scoutingReports.$inferSelect;
export type InsertScoutingReport = z.infer<typeof insertScoutingReportSchema>;

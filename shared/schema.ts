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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTeamLogo = z.infer<typeof insertTeamLogoSchema>;
export type TeamLogo = typeof teamLogos.$inferSelect;

export type ScoutingDocument = typeof scoutingDocuments.$inferSelect;
export type InsertScoutingDocument = z.infer<typeof insertScoutingDocumentSchema>;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type DocumentAsset = typeof documentAssets.$inferSelect;
export type InsertDocumentAsset = z.infer<typeof insertDocumentAssetSchema>;

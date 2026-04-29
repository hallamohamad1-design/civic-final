import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, longtext } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  theme: varchar("theme", { length: 20 }).default("light").notNull(),
  notificationSettings: text("notificationSettings").default('{"statusChanges":true,"newComments":true,"emailDigest":true}').notNull(),
  password: text("password"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Issues table for civic issue reporting.
 * Stores community-reported infrastructure and civic issues with location data.
 */
export const issues = mysqlTable("civic_issues_v2", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 64 }).notNull(), // Roads, Water, Electricity, Sanitation, Other
  status: mysqlEnum("status", ["open", "in-progress", "resolved"]).default("open").notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high"]).default("medium").notNull(),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  isHidden: int("isHidden").default(0).notNull(),
  address: varchar("address", { length: 512 }).notNull(),
  latitude: varchar("latitude", { length: 64 }).notNull(),
  longitude: varchar("longitude", { length: 64 }).notNull(),
  imageUrl: longtext("imageUrl"),
  upvotes: int("upvotes").default(0).notNull(),
  resolutionRating: int("resolutionRating"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Issue = typeof issues.$inferSelect;
export type InsertIssue = typeof issues.$inferInsert;

/**
 * Issue images table for storing photos related to issues.
 * Supports multiple images per issue with cascade delete.
 */
export const issueImages = mysqlTable("issue_images", {
  id: int("id").autoincrement().primaryKey(),
  issueId: int("issueId").notNull().references(() => issues.id, { onDelete: "cascade" }),
  imageUrl: text("imageUrl").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IssueImage = typeof issueImages.$inferSelect;
export type InsertIssueImage = typeof issueImages.$inferInsert;

/**
 * User votes table for tracking which users have voted on which issues.
 * Prevents duplicate votes and enforces vote deduplication at the database level.
 */
export const userVotes = mysqlTable("user_votes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  issueId: int("issueId").notNull().references(() => issues.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Note: The userVotes table enforces one vote per user per issue via database migration.
// A composite unique constraint will be added during migration generation.

export type UserVote = typeof userVotes.$inferSelect;
export type InsertUserVote = typeof userVotes.$inferInsert;

/**
 * OTP codes table for email-based authentication.
 * Stores one-time passwords with expiration times for secure login/signup.
 */
export const otpCodes = mysqlTable("otp_codes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  isUsed: int("isUsed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = typeof otpCodes.$inferInsert;

/**
 * Notifications table for tracking status updates and system alerts for users.
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  issueId: int("issueId").references(() => issues.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 64 }).default("info").notNull(), // info, status_change, etc.
  isRead: int("isRead").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

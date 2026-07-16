import { integer, pgEnum, pgTable, text, timestamp, varchar, boolean, serial } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const statusEnum = pgEnum("status", ["open", "in-progress", "resolved"]);
export const severityEnum = pgEnum("severity", ["low", "medium", "high"]);
export const riskLevelEnum = pgEnum("riskLevel", ["low", "medium", "high", "critical"]);
export const targetTypeEnum = pgEnum("targetType", ["account", "report"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  theme: varchar("theme", { length: 20 }).default("light").notNull(),
  notificationSettings: text("notificationSettings").default('{"statusChanges":true,"newComments":true,"emailDigest":true}').notNull(),
  password: text("password"),
  anonymousReportCount: integer("anonymousReportCount").default(0).notNull(),
  verified: boolean("verified").default(false).notNull(),
  blocked: boolean("blocked").default(false).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const issues = pgTable("civic_issues_v2", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  status: statusEnum("status").default("open").notNull(),
  severity: severityEnum("severity").default("medium").notNull(),
  riskLevel: riskLevelEnum("riskLevel").default("medium").notNull(),
  isHidden: integer("isHidden").default(0).notNull(),
  isAnonymous: integer("isAnonymous").default(0).notNull(),
  anonymousApproved: integer("anonymousApproved").default(0).notNull(),
  address: varchar("address", { length: 512 }).notNull(),
  latitude: varchar("latitude", { length: 64 }).notNull(),
  longitude: varchar("longitude", { length: 64 }).notNull(),
  imageUrl: text("imageUrl"),
  upvotes: integer("upvotes").default(0).notNull(),
  resolutionRating: integer("resolutionRating"),
  severityScore: integer("severity_score"),
  aiSummary: text("ai_summary"),
  detectedHazards: text("detected_hazards"),
  recommendedAction: text("recommended_action"),
  estimatedUrgencyHours: integer("estimated_urgency_hours"),
  aiConfidence: text("ai_confidence"),
  analysisTimestamp: timestamp("analysis_timestamp"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Issue = typeof issues.$inferSelect;
export type InsertIssue = typeof issues.$inferInsert;

export const issueImages = pgTable("issue_images", {
  id: serial("id").primaryKey(),
  issueId: integer("issueId").notNull().references(() => issues.id, { onDelete: "cascade" }),
  imageUrl: text("imageUrl").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IssueImage = typeof issueImages.$inferSelect;
export type InsertIssueImage = typeof issueImages.$inferInsert;

export const userVotes = pgTable("user_votes", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  issueId: integer("issueId").notNull().references(() => issues.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserVote = typeof userVotes.$inferSelect;
export type InsertUserVote = typeof userVotes.$inferInsert;

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  isUsed: integer("isUsed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = typeof otpCodes.$inferInsert;

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  issueId: integer("issueId").references(() => issues.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 64 }).default("info").notNull(),
  isRead: integer("isRead").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  userEmail: varchar('user_email', { length: 255 }),
  action: varchar('action', { length: 100 }).notNull(),
  details: text('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  isUsed: integer("isUsed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export const otpVerifications = pgTable("otp_verifications", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  otp: varchar("otp", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isUsed: boolean("is_used").default(false).notNull(),
});

export type OtpVerification = typeof otpVerifications.$inferSelect;
export type InsertOtpVerification = typeof otpVerifications.$inferInsert;

export const moderationReports = pgTable("moderation_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporterId").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: targetTypeEnum("targetType").notNull(),
  targetId: integer("targetId").notNull(),
  reason: text("reason"),
  reviewed: boolean("reviewed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModerationReport = typeof moderationReports.$inferSelect;
export type InsertModerationReport = typeof moderationReports.$inferInsert;

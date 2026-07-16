CREATE TYPE "public"."riskLevel" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('open', 'in-progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."targetType" AS ENUM('account', 'report');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_email" varchar(255),
	"action" varchar(100) NOT NULL,
	"details" text,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issue_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"issueId" integer NOT NULL,
	"imageUrl" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "civic_issues_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(64) NOT NULL,
	"status" "status" DEFAULT 'open' NOT NULL,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"riskLevel" "riskLevel" DEFAULT 'medium' NOT NULL,
	"isHidden" integer DEFAULT 0 NOT NULL,
	"isAnonymous" integer DEFAULT 0 NOT NULL,
	"anonymousApproved" integer DEFAULT 0 NOT NULL,
	"address" varchar(512) NOT NULL,
	"latitude" varchar(64) NOT NULL,
	"longitude" varchar(64) NOT NULL,
	"imageUrl" text,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"resolutionRating" integer,
	"severity_score" integer,
	"ai_summary" text,
	"detected_hazards" text,
	"recommended_action" text,
	"estimated_urgency_hours" integer,
	"ai_confidence" text,
	"analysis_timestamp" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporterId" integer NOT NULL,
	"targetType" "targetType" NOT NULL,
	"targetId" integer NOT NULL,
	"reason" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"issueId" integer,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(64) DEFAULT 'info' NOT NULL,
	"isRead" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"code" varchar(6) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"isUsed" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"otp" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	CONSTRAINT "otp_verifications_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"isUsed" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "user_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"issueId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"theme" varchar(20) DEFAULT 'light' NOT NULL,
	"notificationSettings" text DEFAULT '{"statusChanges":true,"newComments":true,"emailDigest":true}' NOT NULL,
	"password" text,
	"anonymousReportCount" integer DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
ALTER TABLE "issue_images" ADD CONSTRAINT "issue_images_issueId_civic_issues_v2_id_fk" FOREIGN KEY ("issueId") REFERENCES "public"."civic_issues_v2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "civic_issues_v2" ADD CONSTRAINT "civic_issues_v2_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporterId_users_id_fk" FOREIGN KEY ("reporterId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issueId_civic_issues_v2_id_fk" FOREIGN KEY ("issueId") REFERENCES "public"."civic_issues_v2"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_votes" ADD CONSTRAINT "user_votes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_votes" ADD CONSTRAINT "user_votes_issueId_civic_issues_v2_id_fk" FOREIGN KEY ("issueId") REFERENCES "public"."civic_issues_v2"("id") ON DELETE cascade ON UPDATE no action;
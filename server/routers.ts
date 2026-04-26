import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { sql, eq, gte, desc } from "drizzle-orm";
import { issues, users } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import {
  getIssues,
  getIssueById,
  getIssuesByUser,
  getIssueCount,
  createIssue,
  updateIssue,
  deleteIssue,
  upvoteIssue,
  hasUserVoted,
  addUserVote,
  getUserVotes,
  updateIssueRiskLevel,
  hideIssue,
  unhideIssue,
  getHiddenIssues,
  upsertUser,
  getDb,
} from "./db";
import { createAndSendOtp, verifyOtp } from "./services/otpService";
import { analyzeIssueRisk, shouldMarkAsCritical } from "./services/aiRiskService";
import { sdk } from "./_core/sdk";
import { ONE_YEAR_MS } from "@shared/const";

// Admin procedure - requires admin role
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  issues: router({
    // List all issues with optional pagination
    list: publicProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        }).partial()
      )
      .query(async ({ input }) => {
        return await getIssues(input.limit ?? 50, input.offset ?? 0);
      }),

    // Get a single issue by ID
    getById: publicProcedure
      .input(z.number())
      .query(async ({ input }) => {
        const issue = await getIssueById(input);
        if (!issue) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Issue not found",
          });
        }
        return issue;
      }),

    // Get issues by current user (protected)
    getByUser: protectedProcedure.query(async ({ ctx }) => {
      return await getIssuesByUser(ctx.user.id);
    }),

    // Get total count of issues
    getCount: publicProcedure.query(async () => {
      return await getIssueCount();
    }),

    // Create a new issue (protected)
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1).max(255),
          description: z.string().min(1),
          category: z.string().min(1).max(64),
          severity: z.enum(["low", "medium", "high"]),
          address: z.string().min(1).max(255),
          latitude: z.string().min(1).max(64),
          longitude: z.string().min(1).max(64),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const riskAnalysis = await analyzeIssueRisk(
            input.title,
            input.description,
            input.category,
            input.severity
          );
          
          const isCritical = await shouldMarkAsCritical(
            input.title,
            input.description,
            input.category,
            riskAnalysis.riskLevel
          );

          const issue = await createIssue({
            userId: ctx.user.id,
            title: input.title,
            description: input.description,
            category: input.category,
            severity: input.severity,
            address: input.address,
            latitude: input.latitude,
            longitude: input.longitude,
            riskLevel: riskAnalysis.riskLevel,
            isHidden: isCritical ? 1 : 0,
            status: "open",
            upvotes: 0,
          });
          return issue;
        } catch (error) {
          console.error("Failed to create issue:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create issue",
          });
        }
      }),

    // Update an issue (protected, ownership check)
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).max(255).optional(),
          description: z.string().min(1).optional(),
          category: z.string().min(1).max(64).optional(),
          severity: z.enum(["low", "medium", "high"]).optional(),
          status: z.enum(["open", "in-progress", "resolved"]).optional(),
          address: z.string().min(1).max(255).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input.id);
        if (!issue) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Issue not found",
          });
        }

        if (issue.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to update this issue",
          });
        }

        try {
          const updated = await updateIssue(input.id, {
            title: input.title,
            description: input.description,
            category: input.category,
            severity: input.severity,
            status: input.status,
            address: input.address,
          });
          return updated;
        } catch (error) {
          console.error("Failed to update issue:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update issue",
          });
        }
      }),

    // Delete an issue (protected, ownership check)
    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input);
        if (!issue) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Issue not found",
          });
        }

        if (issue.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to delete this issue",
          });
        }

        try {
          await deleteIssue(input);
          return { success: true };
        } catch (error) {
          console.error("Failed to delete issue:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to delete issue",
          });
        }
      }),

    // Upvote an issue (protected - requires authentication)
    upvote: protectedProcedure
      .input(z.number())
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input);
        if (!issue) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Issue not found",
          });
        }

        try {
          // Check if user has already voted
          const hasVoted = await hasUserVoted(ctx.user.id, input);
          if (hasVoted) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "You have already voted on this issue",
            });
          }

          // Add the vote and update issue
          const updated = await addUserVote(ctx.user.id, input);
          return updated;
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          console.error("Failed to upvote issue:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to upvote issue",
          });
        }
      }),
  }),

  // OTP Authentication Router
  otp: router({
    // Send OTP to email
    sendOtp: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        try {
          const result = await createAndSendOtp(input.email);
          return result;
        } catch (error) {
          console.error("Failed to send OTP:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send OTP",
          });
        }
      }),

    // Verify OTP code
    verifyOtp: publicProcedure
      .input(z.object({ email: z.string().email(), code: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await verifyOtp(input.email, input.code);
          if (!result.success) return result;

          // OTP verified, now log the user in locally
          const openId = `local:${input.email}`;
          const userName = input.email.split("@")[0];
          
          await upsertUser({
            openId,
            name: userName,
            email: input.email,
            loginMethod: "otp",
            lastSignedIn: new Date(),
          });

          // Create session token
          const sessionToken = await sdk.createSessionToken(openId, {
            name: userName,
            expiresInMs: ONE_YEAR_MS,
          });

          // Set cookie
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, { 
            ...cookieOptions, 
            maxAge: ONE_YEAR_MS 
          });

          return { success: true };
        } catch (error) {
          console.error("Failed to verify OTP:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to verify OTP",
          });
        }
      }),
  }),

  // Admin Router
  admin: router({
    // Get hidden issues (admin only)
    getHiddenIssues: adminProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        }).partial()
      )
      .query(async () => {
        return await getHiddenIssues(50, 0);
      }),

    // Hide an issue (admin only)
    hideIssue: adminProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        try {
          const issue = await getIssueById(input);
          if (!issue) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Issue not found",
            });
          }
          const updated = await hideIssue(input);
          return updated;
        } catch (error) {
          console.error("Failed to hide issue:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to hide issue",
          });
        }
      }),

    // Unhide an issue (admin only)
    unhideIssue: adminProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        try {
          const issue = await getIssueById(input);
          if (!issue) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Issue not found",
            });
          }
          const updated = await unhideIssue(input);
          return updated;
        } catch (error) {
          console.error("Failed to unhide issue:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to unhide issue",
          });
        }
      }),

    // Update issue risk level (admin only)
    updateRiskLevel: adminProcedure
      .input(z.object({ issueId: z.number(), riskLevel: z.enum(["low", "medium", "high", "critical"]) }))
      .mutation(async ({ input }) => {
        try {
          const issue = await getIssueById(input.issueId);
          if (!issue) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Issue not found",
            });
          }
          const updated = await updateIssueRiskLevel(input.issueId, input.riskLevel);
          return updated;
        } catch (error) {
          console.error("Failed to update risk level:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update risk level",
          });
        }
      }),

    // Get dashboard stats
    getDashboardStats: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const allIssues = await db.select().from(issues);
      
      const stats = {
        total: allIssues.length,
        solved: allIssues.filter(i => i.status === "resolved").length,
        inProgress: allIssues.filter(i => i.status === "in-progress").length,
        pending: allIssues.filter(i => i.status === "open").length,
      };

      // Group by address for Bar chart
      const densityMap = allIssues.reduce((acc, issue) => {
        const area = issue.address.split(",")[0] || "Unknown"; // Basic grouping
        acc[area] = (acc[area] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const areaDensity = Object.entries(densityMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Pie chart for status breakdown
      const statusBreakdown = [
        { name: "Open", value: stats.pending, fill: "#ef4444" },
        { name: "In Progress", value: stats.inProgress, fill: "#eab308" },
        { name: "Resolved", value: stats.solved, fill: "#22c55e" },
      ];

      // Recent Feed
      const recentFeed = await db
        .select({
          id: issues.id,
          title: issues.title,
          category: issues.category,
          status: issues.status,
          createdAt: issues.createdAt,
          reporterName: users.name,
        })
        .from(issues)
        .leftJoin(users, eq(issues.userId, users.id))
        .orderBy(desc(issues.createdAt))
        .limit(20);

      return {
        stats,
        areaDensity,
        statusBreakdown,
        recentFeed,
      };
    }),

    // Get export data
    getExportData: adminProcedure
      .input(z.object({ filter: z.enum(["daily", "monthly"]) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const now = new Date();
        const pastDate = new Date();
        if (input.filter === "daily") {
          pastDate.setDate(now.getDate() - 1);
        } else {
          pastDate.setMonth(now.getMonth() - 1);
        }

        const data = await db
          .select({
            reporterName: users.name,
            contactInfo: users.email,
            issueCategory: issues.category,
            description: issues.description,
            status: issues.status,
            locationCoordinates: sql<string>`CONCAT(${issues.latitude}, ', ', ${issues.longitude})`,
            timestamp: issues.createdAt,
          })
          .from(issues)
          .leftJoin(users, eq(issues.userId, users.id))
          .where(gte(issues.createdAt, pastDate))
          .orderBy(desc(issues.createdAt));

        return data;
      }),
  }),

  // AI Risk Detection Router
  aiRisk: router({
    // Analyze issue risk using AI
    analyzeIssue: protectedProcedure
      .input(
        z.object({
          title: z.string(),
          description: z.string(),
          category: z.string(),
          severity: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const analysis = await analyzeIssueRisk(
            input.title,
            input.description,
            input.category,
            input.severity
          );
          return analysis;
        } catch (error) {
          console.error("Failed to analyze issue:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to analyze issue risk",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { fireWebhook } from "./services/webhookService";
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
  getAdminAllIssues,
  upsertUser,
  updateUserSettings,
  getUserByEmail,
  getDb,
  rateIssueResolution,
  updateIssueStatus,
  getNotifications,
  markNotificationAsRead,
  clearAllNotifications,
  createNotification,
} from "./db";
import { issues, users } from "../drizzle/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { hashPassword, comparePasswords } from "./_core/password";
import { 
  analyzeIssueRisk, 
  shouldMarkAsCritical,
  detectDuplicateIssue
} from "./services/aiRiskService";
import { sdk } from "./_core/sdk";
import { ONE_YEAR_MS } from "@shared/const";
import { createAndSendOtp, verifyOtp } from "./services/otpService";

// Admin procedure - requires admin role OR fixed admin email bypass
const ADMIN_EMAILS = ["admincivicpulse123@gmail.com"];

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const userEmail = (ctx.user.email || "").trim().toLowerCase();
  const isAdminByRole = ctx.user.role === "admin";
  const isAdminByEmail = ADMIN_EMAILS.includes(userEmail);

  if (!isAdminByRole && !isAdminByEmail) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }

  // If admin by email but DB role is wrong, auto-fix it
  if (isAdminByEmail && !isAdminByRole) {
    console.log(`[Admin] Auto-fixing role for ${userEmail} (was: ${ctx.user.role})`);
    try {
      await upsertUser({
        openId: ctx.user.openId,
        email: userEmail,
        role: "admin",
      });
    } catch (e) {
      console.error("[Admin] Failed to auto-fix role:", e);
    }
  }

  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      const user = opts.ctx.user;
      if (!user) return null;
      // Ensure the fixed admin always gets role: "admin" on the frontend
      const userEmail = (user.email || "").trim().toLowerCase();
      if (ADMIN_EMAILS.includes(userEmail) && user.role !== "admin") {
        return { ...user, role: "admin" as const };
      }
      return user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    updateSettings: protectedProcedure
      .input(z.object({
        language: z.string().optional(),
        theme: z.string().optional(),
        notificationSettings: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return await updateUserSettings(ctx.user.id, input);
      }),

    register: publicProcedure
      .input(z.object({ 
        email: z.string().email(), 
        password: z.string().min(6),
        name: z.string().min(2)
      }))
      .mutation(async ({ input, ctx }) => {
        const normalizedEmail = input.email.trim().toLowerCase();
        const existingUser = await getUserByEmail(normalizedEmail);
        
        // If user exists and ALREADY has a password, then it's a real duplicate
        if (existingUser && existingUser.password) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User with this email already exists",
          });
        }

        const hashedPassword = await hashPassword(input.password);
        const openId = existingUser ? existingUser.openId : `local:${normalizedEmail}`;

        const user = await upsertUser({
          openId,
          email: normalizedEmail,
          name: input.name,
          password: hashedPassword,
          loginMethod: "password",
          lastSignedIn: new Date(),
        });

        // Auto-login after registration
        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { 
          ...cookieOptions, 
          maxAge: ONE_YEAR_MS 
        });

        return { success: true, user };
      }),

    sendOtp: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const normalizedEmail = input.email.trim().toLowerCase();
        return await createAndSendOtp(normalizedEmail);
      }),

    verifyOtp: publicProcedure
      .input(z.object({ email: z.string().email(), code: z.string().length(6) }))
      .mutation(async ({ input }) => {
        const normalizedEmail = input.email.trim().toLowerCase();
        const result = await verifyOtp(normalizedEmail, input.code);
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Invalid OTP",
          });
        }
        return { success: true };
      }),

    login: publicProcedure
      .input(z.object({ 
        email: z.string().email(), 
        password: z.string() 
      }))
      .mutation(async ({ input, ctx }) => {
        const normalizedEmail = input.email.trim().toLowerCase();
        // 1. Fixed password bypass for the main admin
        const isAdminEmail = normalizedEmail === "admincivicpulse123@gmail.com";
        const isMasterPassword = input.password === "admin@123";

        if (isAdminEmail && isMasterPassword) {
           console.log(`[AUTH] Admin bypass used for ${normalizedEmail}`);
           
           let adminUser: any;
           
           try {
             const user = await getUserByEmail(normalizedEmail);
             adminUser = user;
             if (!adminUser || adminUser.role !== "admin") {
               adminUser = await upsertUser({
                 openId: adminUser?.openId || `local:${normalizedEmail}`,
                 email: normalizedEmail,
                 name: adminUser?.name || "Super Admin",
                 role: "admin",
                 loginMethod: "password",
                 lastSignedIn: new Date(),
               });
             }
           } catch (err) {
             console.error("[AUTH] DB lookup failed during admin bypass, proceeding with mock session", err);
             adminUser = {
                openId: `local:${normalizedEmail}`,
                email: normalizedEmail,
                name: "Super Admin",
                role: "admin"
             };
           }

           if (!adminUser || !adminUser.openId) {
             throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to ensure admin user exists" });
           }

           const sessionToken = await sdk.createSessionToken(adminUser!.openId, {
             name: adminUser!.name || undefined,
             expiresInMs: ONE_YEAR_MS,
           });

           const cookieOptions = getSessionCookieOptions(ctx.req);
           ctx.res.cookie(COOKIE_NAME, sessionToken, { 
             ...cookieOptions, 
             maxAge: ONE_YEAR_MS 
           });

           return { success: true, user: adminUser };
        }

        // 2. Normal user DB lookup
        const user = await getUserByEmail(normalizedEmail);

        if (!user || !user.password) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invalid email or password",
          });
        }

        const isValid = await comparePasswords(input.password, user.password);
        if (!isValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || undefined,
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { 
          ...cookieOptions, 
          maxAge: ONE_YEAR_MS 
        });

        return { success: true, user };
      }),
  }),

  issues: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(50), offset: z.number().min(0).default(0) }).partial())
      .query(async ({ input }) => {
        return await getIssues(input.limit ?? 50, input.offset ?? 0);
      }),

    getById: publicProcedure
      .input(z.number())
      .query(async ({ input }) => {
        const issue = await getIssueById(input);
        if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
        return issue;
      }),

    getByUser: protectedProcedure.query(async ({ ctx }) => {
      return await getIssuesByUser(ctx.user.id);
    }),

    getCount: publicProcedure.query(async () => {
      return await getIssueCount();
    }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        description: z.string().min(1),
        category: z.string().min(1).max(64),
        severity: z.enum(["low", "medium", "high"]),
        address: z.string().min(1).max(512),
        latitude: z.string().min(1).max(64),
        longitude: z.string().min(1).max(64),
        imageUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // AI Duplicate Detection with Graceful Fallback
          let riskLevel: "low" | "medium" | "high" | "critical" = "medium";
          let isHidden = 0;

          try {
            const recentIssues = await getIssues(20, 0); // Get recent 20 issues for comparison
            const duplicateAnalysis = await detectDuplicateIssue(input.title, input.description, input.category, recentIssues);
            
            if (duplicateAnalysis.isDuplicate) {
              throw new TRPCError({ 
                code: "CONFLICT", 
                message: `This issue appears to be a duplicate of an existing report (ID: ${duplicateAnalysis.duplicateOfId || 'unknown'}). AI Reasoning: ${duplicateAnalysis.reasoning}` 
              });
            }

            const riskAnalysis = await analyzeIssueRisk(input.title, input.description, input.category, input.severity);
            riskLevel = riskAnalysis.riskLevel;
            const isCritical = await shouldMarkAsCritical(input.title, input.description, input.category, riskLevel);
            isHidden = isCritical ? 1 : 0;
          } catch (aiError: any) {
            console.error("[AI] Analysis failed, proceeding with defaults:", aiError);
            if (aiError instanceof TRPCError) throw aiError;
            // Otherwise, keep default riskLevel and isHidden
          }

          const newIssue = await createIssue({
            userId: ctx.user.id,
            title: input.title,
            description: input.description,
            category: input.category,
            severity: input.severity,
            address: input.address,
            latitude: input.latitude,
            longitude: input.longitude,
            imageUrl: input.imageUrl,
            riskLevel: riskLevel,
            isHidden: isHidden,
          });

          // Fire-and-forget: send to n8n for AI-powered analysis
          if (newIssue) {
            fireWebhook({
              issue_id: newIssue.id,
              user_name: ctx.user.name || "Anonymous",
              user_email: ctx.user.email || "",
              description: input.description,
              image_url: input.imageUrl || "",
              location: input.address,
              timestamp: new Date().toISOString(),
            });
          }

          // Notify Admin
          try {
            const adminUser = await getUserByEmail("admincivicpulse123@gmail.com");
            if (adminUser && newIssue) {
              await createNotification({
                userId: adminUser.id,
                issueId: newIssue.id,
                title: "New Issue Reported",
                message: `New Issue Reported: ${input.category} by ${ctx.user.name || 'User'}`,
                type: "new_issue"
              });
            }
          } catch (notifErr) {
            console.error("[Notification] Failed to notify admin:", notifErr);
          }

          // Trigger N8N Webhook for Email Notification
          try {
            const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
            if (n8nWebhookUrl) {
              await fetch(n8nWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  event: "new_issue_published",
                  targetEmail: "mohamedhosamm81@gmail.com",
                  issue: newIssue,
                  reporter: {
                    id: ctx.user.id,
                    name: ctx.user.name,
                    email: ctx.user.email
                  }
                }),
              });
              console.log("[N8N] Webhook triggered successfully for new issue");
            } else {
              console.warn("[N8N] N8N_WEBHOOK_URL is not set. Cannot send notification.");
            }
          } catch (webhookError) {
            console.error("[N8N] Failed to trigger webhook:", webhookError);
          }

          return newIssue;
        } catch (error: any) {
          console.error("Failed to create issue:", error);
          if (error instanceof TRPCError) throw error;
          let errorMessage = error.message || 'Unknown error';
          // Sanitize: remove large Base64 strings if present in the error message
          if (errorMessage.length > 500) {
            errorMessage = errorMessage.substring(0, 500) + "... (truncated)";
          }
          
          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: `Failed to create issue: ${errorMessage}` 
          });
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().min(1).optional(),
        category: z.string().min(1).max(64).optional(),
        severity: z.enum(["low", "medium", "high"]).optional(),
        status: z.enum(["open", "in-progress", "resolved"]).optional(),
        address: z.string().min(1).max(255).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input.id);
        if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
        if (issue.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Ownership check failed" });
        return await updateIssue(input.id, input);
      }),

    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input);
        if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
        if (issue.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Ownership check failed" });
        await deleteIssue(input);
        return { success: true };
      }),

    rateResolution: protectedProcedure
      .input(z.object({
        id: z.number(),
        rating: z.number().min(1).max(5)
      }))
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input.id);
        if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
        if (issue.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the reporter can rate the resolution" });
        if (issue.status !== "resolved") throw new TRPCError({ code: "BAD_REQUEST", message: "Can only rate resolved issues" });
        if (issue.resolutionRating !== null) throw new TRPCError({ code: "BAD_REQUEST", message: "Issue is already rated" });
        
        return await rateIssueResolution(input.id, input.rating);
      }),

    upvote: protectedProcedure
      .input(z.number())
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input);
        if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
        
        const hasVoted = await hasUserVoted(ctx.user.id, input);
        if (hasVoted) throw new TRPCError({ code: "BAD_REQUEST", message: "Already voted" });
        return await addUserVote(ctx.user.id, input);
      }),
  }),

  admin: router({
    getHiddenIssues: adminProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }).partial())
      .query(async () => await getHiddenIssues(50, 0)),

    getAllIssues: adminProcedure
      .input(z.object({ status: z.string().optional(), riskLevel: z.string().optional() }).optional())
      .query(async ({ input }) => await getAdminAllIssues(input)),

    updateStatus: adminProcedure
      .input(z.object({ issueId: z.number(), status: z.enum(["open", "in-progress", "resolved"]) }))
      .mutation(async ({ input }) => await updateIssueStatus(input.issueId, input.status)),

    hideIssue: adminProcedure
      .input(z.number())
      .mutation(async ({ input }) => await hideIssue(input)),

    unhideIssue: adminProcedure
      .input(z.number())
      .mutation(async ({ input }) => await unhideIssue(input)),

    updateRiskLevel: adminProcedure
      .input(z.object({ issueId: z.number(), riskLevel: z.enum(["low", "medium", "high", "critical"]) }))
      .mutation(async ({ input }) => await updateIssueRiskLevel(input.issueId, input.riskLevel)),

    listAll: adminProcedure
      .input(z.object({ status: z.string().optional(), riskLevel: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return await getAdminAllIssues(input);
      }),

    getStats: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;

      try {
        // Total issues
        const [totalResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(issues);
        const totalIssues = totalResult?.count ?? 0;

        // By status
        const statusCounts = await db
          .select({ status: issues.status, count: sql<number>`COUNT(*)` })
          .from(issues)
          .groupBy(issues.status);

        const byStatus: Record<string, number> = {};
        statusCounts.forEach((r: any) => { byStatus[r.status] = r.count; });

        // By risk level
        const riskCounts = await db
          .select({ riskLevel: issues.riskLevel, count: sql<number>`COUNT(*)` })
          .from(issues)
          .groupBy(issues.riskLevel);

        const byRisk: Record<string, number> = {};
        riskCounts.forEach((r: any) => { byRisk[r.riskLevel] = r.count; });

        // Today's issues
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [todayResult] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(issues)
          .where(gte(issues.createdAt, today));
        const todayIssues = todayResult?.count ?? 0;

        // Total users
        const [usersResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
        const totalUsers = usersResult?.count ?? 0;

        // Admin count
        const [adminResult] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(users)
          .where(eq(users.role, "admin"));
        const adminCount = adminResult?.count ?? 0;

        return {
          totalIssues,
          todayIssues,
          totalUsers,
          adminCount,
          byStatus,
          byRisk,
        };
      } catch (error) {
        console.error("[Admin Stats] Error:", error);
        return null;
      }
    }),
  }),

  aiRisk: router({
    analyzeIssue: protectedProcedure
      .input(z.object({ title: z.string(), description: z.string(), category: z.string(), severity: z.string() }))
      .mutation(async ({ input }) => await analyzeIssueRisk(input.title, input.description, input.category, input.severity)),
  }),
  maps: router({
    reverseGeocode: publicProcedure
      .input(z.object({ lat: z.number(), lng: z.number() }))
      .query(async ({ input }) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        try {
          // Use geocode.maps.co as a free, more reliable alternative to official Nominatim
          const response = await fetch(
            `https://geocode.maps.co/reverse?lat=${input.lat}&lon=${input.lng}&format=json`,
            {
              signal: controller.signal,
            }
          );
          clearTimeout(timeoutId);
          
          if (!response.ok) throw new Error(`Geocoding service returned ${response.status}`);
          const data = await response.json();
          return { address: data.display_name || "Unknown Location" };
        } catch (error: any) {
          clearTimeout(timeoutId);
          console.error("[Geocoding Error]", error.name === 'AbortError' ? 'Timeout' : error.message);
          return { address: "Location identified by coordinates (Service busy)" };
        }
      }),
    forwardGeocode: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(
            `https://geocode.maps.co/search?q=${encodeURIComponent(input.query)}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error("Search service unavailable");
          const data = await response.json();
          return data.map((item: any) => ({
            display_name: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }));
        } catch (error) {
          clearTimeout(timeoutId);
          console.error("[Forward Geocoding Error]", error);
          return [];
        }
      }),
  }),
  notifications: router({
    list: protectedProcedure
      .query(async ({ ctx }) => await getNotifications(ctx.user.id)),
    markAsRead: protectedProcedure
      .input(z.number())
      .mutation(async ({ input }) => await markNotificationAsRead(input)),
    clearAll: protectedProcedure
      .mutation(async ({ ctx }) => await clearAllNotifications(ctx.user.id)),
  }),
});

export type AppRouter = typeof appRouter;

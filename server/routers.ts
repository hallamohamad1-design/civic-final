import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { fireWebhook } from "./services/webhookService";
import { logAction } from "./audit";
import { auditLogs } from "../drizzle/schema";
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
  getAnonymousReportCountForUser,
  getPendingAnonymousIssues,
  approveAnonymousIssue,
  rejectAnonymousIssue,
  createOtpCode,
  verifyOtpCode,
} from "./db";
import { issues, users } from "../drizzle/schema";
import { eq, sql, and, gte, notInArray } from "drizzle-orm";
import { hashPassword, comparePasswords } from "./_core/password";
import { 
  analyzeIssueRisk, 
  shouldMarkAsCritical,
  detectDuplicateIssue
} from "./services/aiRiskService";
import { sdk } from "./_core/sdk";
import { ONE_YEAR_MS } from "@shared/const";
import { createAndSendOtp, verifyOtp } from "./services/otpService";
import { markOtpAsUsed, createPasswordResetToken, getPasswordResetToken, markPasswordResetTokenUsed, getOtpForEmail, updateUserPassword, setUserVerified, blockUserByOpenId, insertModerationReport, getFlaggedItems, dismissModerationReports, deleteModerationReportsForTarget, countPendingFlaggedItems, hasReporterAlreadyReported } from "./db";
import { sendPasswordResetEmail, sendPasswordResetOtpEmail } from "../lib/mail";
import crypto from "crypto";

// Rate limiter for password reset OTP requests (max 3 per 15 minutes per email)
const passwordResetRateLimit = new Map<string, number[]>();

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

// In-memory store for resend-OTP rate limiting (email -> array of timestamps)
const resendRateLimit = new Map<string, number[]>();

// In-memory geocode cache and Nominatim throttle (1 req/sec policy)
const geocodeCache = new Map<string, string>();
let lastNominatimCall = 0;

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
      // Audit: fire-and-forget — do not await so it never delays the response
      void logAction(ctx.req, 'LOGOUT', 'User logged out', ctx.user?.id, ctx.user?.email ?? undefined);
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
        password: z.string().min(8),
        name: z.string().min(2),
        otp: z.string().length(6),
      }))
      .mutation(async ({ input, ctx }) => {
        const normalizedEmail = input.email.trim().toLowerCase();

        // 1. Re-verify the OTP is still valid before touching the user record.
        //    This is a read-only check — we only consume it after success.
        const otpCheck = await verifyOtp(normalizedEmail, input.otp);
        if (!otpCheck.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: otpCheck.error || "Invalid or expired OTP",
          });
        }

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
          verified: true, // OTP was verified — mark account as verified immediately
        });

        // Explicitly set verified=true with a targeted UPDATE so it can never
        // be silently overwritten by upsertUser's role-assignment logic.
        await setUserVerified(openId);

        // 2. Sign the session token — this is the step that requires JWT_SECRET.
        //    Only consume the OTP after this succeeds.
        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { 
          ...cookieOptions, 
          maxAge: ONE_YEAR_MS 
        });

        // 3. Only now — after user created and session signed — consume the OTP
        //    so a retry is still possible if anything above failed.
        await markOtpAsUsed(normalizedEmail, input.otp);

        return { success: true, user };
      }),

    sendOtp: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const normalizedEmail = input.email.trim().toLowerCase();
        return await createAndSendOtp(normalizedEmail);
      }),

    // Resend OTP — reuses createAndSendOtp which deletes the old code first,
    // so only the latest code is ever valid.
    // Rate limit: max 5 resends per email per 15 minutes (in-memory).
    resendOtp: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const normalizedEmail = input.email.trim().toLowerCase();

        // Validate that a signup is actually in progress for this email
        // (i.e. a pending OTP exists). Prevents resend being used for arbitrary emails.
        const pending = await getOtpForEmail(normalizedEmail);
        if (!pending) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No pending verification found for this email. Please start the signup process again.",
          });
        }

        // In-memory rate limit: max 5 resends per email per 15 minutes
        const now = Date.now();
        const WINDOW_MS = 15 * 60 * 1000;
        const MAX_RESENDS = 5;
        const entry = resendRateLimit.get(normalizedEmail);
        if (entry) {
          // Prune timestamps outside the window
          const recent = entry.filter(ts => now - ts < WINDOW_MS);
          if (recent.length >= MAX_RESENDS) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "Too many resend attempts. Please wait 15 minutes before trying again.",
            });
          }
          recent.push(now);
          resendRateLimit.set(normalizedEmail, recent);
        } else {
          resendRateLimit.set(normalizedEmail, [now]);
        }

        // createAndSendOtp deletes old OTP first, so old codes stop working immediately
        const result = await createAndSendOtp(normalizedEmail);
        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error || "Failed to resend OTP. Please try again.",
          });
        }
        return { success: true };
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

    // ── Forgot / Reset Password ───────────────────────────────────────────────

    requestPasswordResetOtp: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const normalizedEmail = input.email.trim().toLowerCase();
        const now = Date.now();
        const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
        const MAX_REQUESTS = 3;

        // Check rate limit
        const requests = passwordResetRateLimit.get(normalizedEmail) || [];
        const recentRequests = requests.filter(ts => now - ts < WINDOW_MS);
        
        if (recentRequests.length >= MAX_REQUESTS) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many password reset attempts. Please try again later.",
          });
        }

        // Add current request timestamp
        recentRequests.push(now);
        passwordResetRateLimit.set(normalizedEmail, recentRequests);

        // Always return generic success — never reveal whether the email exists.
        try {
          const user = await getUserByEmail(normalizedEmail);
          if (user) {
            console.log(`[Password Reset OTP] User found (id=${user.id}), generating OTP...`);
            
            // Generate 6-digit OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            // Store OTP (replaces any existing one for this email)
            await createOtpCode(normalizedEmail, otp, expiresAt);

            console.log(`[Password Reset OTP] Sending OTP to ${normalizedEmail}`);
            try {
              await sendPasswordResetOtpEmail(normalizedEmail, otp);
              console.log(`[Password Reset OTP] ✅ Email sent successfully to ${normalizedEmail}`);
            } catch (emailErr: any) {
              console.error(
                `[Password Reset OTP] ❌ Email send FAILED for ${normalizedEmail}`,
                "\n  Error name:", emailErr?.name,
                "\n  Error message:", emailErr?.message,
                "\n  Error code:", emailErr?.code,
              );
              // Still return generic success — don't leak delivery failure
            }
          } else {
            console.log(`[Password Reset OTP] No user found for ${normalizedEmail} — returning generic success`);
          }
        } catch (err) {
          console.error("[Password Reset OTP] Unexpected error:", err);
          // Still return success to avoid leaking info
        }

        return { success: true, message: "If that email exists, we've sent a verification code." };
      }),

    verifyPasswordResetOtp: publicProcedure
      .input(z.object({
        email: z.string().email(),
        otp: z.string().length(6, "OTP must be 6 digits"),
      }))
      .mutation(async ({ input }) => {
        const normalizedEmail = input.email.trim().toLowerCase();
        
        // Validate code format
        if (!/^\d+$/.test(input.otp)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid OTP format. Must be 6 digits.",
          });
        }

        // Verify OTP from DB
        const isValid = await verifyOtpCode(normalizedEmail, input.otp);

        if (!isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired OTP. Please request a new one.",
          });
        }

        // Generate short-lived JWT token for password reset (5 minutes)
        const resetToken = crypto.randomBytes(32).toString("hex");
        const tokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Store the reset token in memory (in production, use Redis or database)
        // For now, we'll use a simple Map - in production, this should be in Redis/DB
        const resetTokenData = {
          email: normalizedEmail,
          otp: input.otp,
          expiresAt: tokenExpiresAt,
        };
        
        // Store in a simple in-memory map (replace with Redis/DB in production)
        (global as any).passwordResetTokens = (global as any).passwordResetTokens || new Map();
        (global as any).passwordResetTokens.set(resetToken, resetTokenData);

        console.log(`[Password Reset OTP] ✅ OTP verified for ${normalizedEmail}, reset token generated`);

        return { 
          success: true, 
          resetToken,
          expiresAt: tokenExpiresAt.toISOString(),
        };
      }),

    resetPasswordWithToken: publicProcedure
      .input(z.object({
        resetToken: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }))
      .mutation(async ({ input }) => {
        const resetTokens = (global as any).passwordResetTokens || new Map();
        const tokenData = resetTokens.get(input.resetToken);

        if (!tokenData) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired reset token. Please request a new OTP.",
          });
        }

        if (Date.now() > new Date(tokenData.expiresAt).getTime()) {
          resetTokens.delete(input.resetToken);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Reset token has expired. Please request a new OTP.",
          });
        }

        const user = await getUserByEmail(tokenData.email);
        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User account not found.",
          });
        }

        // Verify OTP is still valid and not used
        const isValid = await verifyOtpCode(tokenData.email, tokenData.otp);
        if (!isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OTP has expired or been used. Please request a new one.",
          });
        }

        // Hash new password
        const hashedPassword = await hashPassword(input.newPassword);

        // Update password
        await updateUserPassword(user.openId, hashedPassword);

        // Mark OTP as used
        await markOtpAsUsed(tokenData.email, tokenData.otp);

        // Delete the reset token
        resetTokens.delete(input.resetToken);

        console.log(`[Password Reset OTP] Password updated successfully for ${tokenData.email}`);
        return { success: true, message: "Password updated successfully. You can now sign in." };
      }),

    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const normalizedEmail = input.email.trim().toLowerCase();

        // Always return generic success — never reveal whether the email exists.
        try {
          // Diagnostic: log whether DB is available
          const dbCheck = await getDb();
          console.log(`[Password Reset] DB available: ${!!dbCheck}, looking up: ${normalizedEmail}`);

          const user = await getUserByEmail(normalizedEmail);
          if (user) {
            console.log(`[Password Reset] User found (id=${user.id}), generating token...`);
            // Generate a cryptographically random 32-byte token
            const rawToken = crypto.randomBytes(32).toString("hex");
            // Store only the SHA-256 hash
            const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

            await createPasswordResetToken(normalizedEmail, tokenHash, expiresAt);

            // Build the reset URL — use FRONTEND_URL env var or fall back to localhost
            const baseUrl = process.env.FRONTEND_URL?.replace(/\/$/, "") || "http://localhost:3000";
            const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

            console.log(`[Password Reset] Sending reset link to ${normalizedEmail}, URL: ${resetUrl}`);
            try {
              await sendPasswordResetEmail(normalizedEmail, resetUrl);
              console.log(`[Password Reset] ✅ Email sent successfully to ${normalizedEmail}`);
            } catch (emailErr: any) {
              console.error(
                `[Password Reset] ❌ Email send FAILED for ${normalizedEmail}`,
                "\n  Error name:", emailErr?.name,
                "\n  Error message:", emailErr?.message,
                "\n  Error code:", emailErr?.code,
                "\n  Full error:", emailErr,
              );
              // Still return generic success — don't leak delivery failure
            }
          } else {
            console.log(`[Password Reset] No user found in DB for ${normalizedEmail} — returning generic success (DB connected: ${!!dbCheck})`);
          }
        } catch (err) {
          console.error("[Password Reset] Unexpected error:", err);
          // Still return success to avoid leaking info
        }

        return { success: true, message: "If that email exists, we've sent a reset link." };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        token: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }))
      .mutation(async ({ input }) => {
        // Hash the incoming raw token to compare against the stored hash
        const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");

        const record = await getPasswordResetToken(tokenHash);

        if (!record) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired reset link. Please request a new one.",
          });
        }

        if (record.isUsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This reset link has already been used. Please request a new one.",
          });
        }

        if (Date.now() > new Date(record.expiresAt).getTime()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This reset link has expired. Please request a new one.",
          });
        }

        const user = await getUserByEmail(record.email);
        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User account not found.",
          });
        }

        // Hash new password using the same method as auth.register
        const hashedPassword = await hashPassword(input.newPassword);

        // Update ONLY the password field — use a targeted UPDATE so we never
        // accidentally overwrite verified, role, or any other field.
        await updateUserPassword(user.openId, hashedPassword);

        // Only mark the token used AFTER the password update succeeded
        await markPasswordResetTokenUsed(tokenHash);

        console.log(`[Password Reset] Password updated successfully for ${record.email}`);
        return { success: true, message: "Password updated successfully. You can now sign in." };
      }),

    login: publicProcedure
      .input(z.object({ 
        email: z.string().email(), 
        password: z.string().min(8)
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
          await logAction(ctx.req, 'LOGIN_FAILED', 'Failed login attempt: ' + input.email);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        if (user.verified === false) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Please verify your email before logging in.",
          });
        }

        if ((user as any).blocked === true || (user as any).blocked === 1) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Your account has been suspended. Please contact support.",
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

        void logAction(ctx.req, 'LOGIN', 'User logged in: ' + input.email, user.id, user.email ?? undefined);
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

    getAnonymousCount: protectedProcedure.query(async ({ ctx }) => {
      const count = await getAnonymousReportCountForUser(ctx.user.id);
      return { count, remaining: Math.max(0, 5 - count) };
    }),

    getCount: publicProcedure.query(async () => {
      return await getIssueCount();
    }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(5).max(100),
        description: z.string().min(10).max(1000),
        category: z.enum(["Roads", "Water", "Electricity", "Sanitation", "Other"]),
        severity: z.enum(["low", "medium", "high"]),
        address: z.string().min(5),
        latitude: z.string(),
        longitude: z.string(),
        imageUrl: z.string().optional(),
        isAnonymous: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Enforce anonymous report limit (max 5 per user)
          if (input.isAnonymous) {
            const anonCount = await getAnonymousReportCountForUser(ctx.user.id);
            if (anonCount >= 5) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "You have reached the maximum of 5 anonymous reports.",
              });
            }
          }
          let finalAddress = input.address;
          
          // Auto reverse-geocode on backend if the address looks like coordinates or is generic
          const isCoordinates = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(finalAddress.trim());
          const isGeneric = finalAddress.includes("Unknown Location") || finalAddress.includes("Location identified by coordinates");
          
          if (isCoordinates || isGeneric || finalAddress.trim() === "") {
            try {
              const lat = parseFloat(input.latitude);
              const lng = parseFloat(input.longitude);
              if (!isNaN(lat) && !isNaN(lng)) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                const response = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                  {
                    headers: {
                      "User-Agent": "CivicPulse/1.0 (admincivicpulse123@gmail.com)",
                      "Accept-Language": "en"
                    },
                    signal: controller.signal,
                  }
                );
                clearTimeout(timeoutId);
                if (response.ok) {
                  const data = await response.json();
                  if (data.display_name) {
                    finalAddress = data.display_name.substring(0, 500);
                  }
                }
              }
            } catch (geocodeErr) {
              console.error("[Backend Geocoding Error]", geocodeErr);
            }
          }

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
            address: finalAddress,
            latitude: input.latitude,
            longitude: input.longitude,
            imageUrl: input.imageUrl,
            riskLevel: riskLevel,
            isHidden: isHidden,
            isAnonymous: input.isAnonymous ? 1 : 0,
            anonymousApproved: input.isAnonymous ? 0 : 1,
          });

          // Fire-and-forget: send to n8n for AI-powered analysis
          if (newIssue) {
            fireWebhook({
              issue_id: newIssue.id,
              user_name: ctx.user.name || "Anonymous",
              user_email: ctx.user.email || "",
              description: input.description,
              image_url: input.imageUrl || "",
              location: finalAddress,
              timestamp: new Date().toISOString(),
            });

            // Fire-and-forget: notify civicpulse-report n8n workflow
            fetch("https://mariemsaleh.app.n8n.cloud/webhook/civicpulse-report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                report_id:    String(newIssue.id),
                user_id:      String(ctx.user.id),
                user_email:   ctx.user.email || "",
                title:        input.title,
                description:  input.description,
                location:     finalAddress,
                image_url:    input.imageUrl || "",
                submitted_at: new Date().toISOString(),
              }),
              signal: AbortSignal.timeout(15000),
            })
              .then((res) => {
                if (res.ok) {
                  console.log(`[CivicPulse Webhook] ✓ Report #${newIssue.id} sent (${res.status})`);
                } else {
                  console.error(`[CivicPulse Webhook] ✗ Returned ${res.status} for report #${newIssue.id}`);
                }
              })
              .catch((err) => {
                console.error(`[CivicPulse Webhook] ✗ Failed for report #${newIssue.id}:`, err.message || err);
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

          // Audit log — fire-and-forget
          void logAction(ctx.req, 'ISSUE_CREATED', 'Title: ' + input.title, ctx.user.id, ctx.user.email ?? undefined);

          return newIssue;
        } catch (error: any) {
          // Log full error to server console for debugging
          console.error("[ISSUES:CREATE] Detailed Error:", error);
          
          if (error instanceof TRPCError) throw error;
          
          // Extract a cleaner error message for the user
          let errorMessage = error.sqlMessage || error.message || 'Unknown error';
          
          // Drizzle/mysql2 error messages are usually: "Failed query: [SQL] params: [PARAMS] - [REASON]"
          // We only want the [REASON] part if it exists
          if (errorMessage.includes(" - ")) {
            const parts = errorMessage.split(" - ");
            errorMessage = parts[parts.length - 1]; // The actual error reason is usually at the end
          }
          
          // If it still looks like a query, try to find the very last sentence
          if (errorMessage.includes("Failed query:")) {
             const lines = errorMessage.split("\n");
             errorMessage = lines[lines.length - 1];
          }

          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: `Database Error: ${errorMessage}` 
          });
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(5).max(100).optional(),
        description: z.string().min(10).max(1000).optional(),
        category: z.enum(["Roads", "Water", "Electricity", "Sanitation", "Other"]).optional(),
        severity: z.enum(["low", "medium", "high"]).optional(),
        status: z.enum(["open", "in-progress", "resolved"]).optional(),
        address: z.string().min(5).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input.id);
        if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
        if (issue.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Ownership check failed" });
        const updated = await updateIssue(input.id, input);
        // Audit log — fire-and-forget
        void logAction(ctx.req, 'ISSUE_UPDATED', 'Issue ID: ' + input.id, ctx.user.id, ctx.user.email ?? undefined);
        return updated;
      }),

    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input, ctx }) => {
        const issue = await getIssueById(input);
        if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
        if (issue.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Ownership check failed" });
        await deleteIssue(input);
        // Audit log — fire-and-forget
        void logAction(ctx.req, 'ISSUE_DELETED', 'Issue ID: ' + input, ctx.user.id, ctx.user.email ?? undefined);
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

    deleteAllExcept: adminProcedure
      .input(z.object({ keepTitles: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        // Find all issues NOT in the keep list
        const toDelete = await db.select({ id: issues.id }).from(issues).where(
          notInArray(issues.title, input.keepTitles)
        );
        const idsToDelete = toDelete.map((r: any) => r.id);
        if (idsToDelete.length === 0) return { deleted: 0 };
        for (const id of idsToDelete) {
          await deleteIssue(id);
        }
        return { deleted: idsToDelete.length };
      }),

    getPendingAnonymous: adminProcedure
      .query(async () => await getPendingAnonymousIssues()),

    approveAnonymous: adminProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        const issue = await approveAnonymousIssue(input);
        return issue;
      }),

    rejectAnonymous: adminProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        return await rejectAnonymousIssue(input);
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

    listAuditLogs: adminProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        return await db
          .select()
          .from(auditLogs)
          .orderBy(auditLogs.createdAt)
          .then((rows: any[]) => rows.reverse()); // newest first
      }),
  }),

  aiRisk: router({
    analyzeIssue: protectedProcedure
      .input(z.object({
        title: z.string().min(5).max(100),
        description: z.string().min(10).max(1000),
        category: z.enum(["Roads", "Water", "Electricity", "Sanitation", "Other"]),
        severity: z.enum(["low", "medium", "high"])
      }))
      .mutation(async ({ input }) => await analyzeIssueRisk(input.title, input.description, input.category, input.severity)),
  }),

  // ── Content Moderation ────────────────────────────────────────────────────
  moderation: router({

    // Submit a report against an account or a civic report
    submitReport: protectedProcedure
      .input(z.object({
        targetType: z.enum(["account", "report"]),
        targetId: z.number().int().positive(),
        reason: z.string().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const reporterId = ctx.user.id;

        // Prevent self-reporting
        if (input.targetType === "account" && input.targetId === reporterId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot report yourself." });
        }

        const { isDuplicate, totalCount } = await insertModerationReport(
          reporterId,
          input.targetType,
          input.targetId,
          input.reason ?? null,
        );

        if (isDuplicate) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You have already reported this item.",
          });
        }

        // If this insert just crossed the threshold, notify all admins
        if (totalCount === 3) {
          const adminEmails = ["admincivicpulse123@gmail.com"];
          for (const email of adminEmails) {
            const admin = await getUserByEmail(email);
            if (admin) {
              const label = input.targetType === "account" ? `account #${input.targetId}` : `report #${input.targetId}`;
              await createNotification({
                userId: admin.id,
                issueId: input.targetType === "report" ? input.targetId : null as any,
                title: "⚠️ Content Flagged for Review",
                message: `${label} has received ${totalCount} moderation reports and needs review.`,
                type: "moderation_flag",
              });
            }
          }
        }

        return { success: true };
      }),

    // Admin: get all flagged items above threshold
    getFlaggedItems: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "admin" && !["admincivicpulse123@gmail.com"].includes(ctx.user.email ?? "")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
        }
        return await getFlaggedItems();
      }),

    // Admin: count of pending flags (for badge)
    getPendingFlagCount: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "admin" && !["admincivicpulse123@gmail.com"].includes(ctx.user.email ?? "")) {
          return { count: 0 };
        }
        const count = await countPendingFlaggedItems();
        return { count };
      }),

    // Admin: block a user account
    blockAccount: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && !["admincivicpulse123@gmail.com"].includes(ctx.user.email ?? "")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable." });
        const [targetUser] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        await blockUserByOpenId(targetUser.openId);
        await dismissModerationReports("account", input.userId);
        void logAction(ctx.req, "ACCOUNT_BLOCKED", `User ${input.userId} blocked by admin`, ctx.user.id, ctx.user.email ?? undefined);
        return { success: true };
      }),

    // Admin: delete a civic report
    deleteReport: protectedProcedure
      .input(z.object({ reportId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && !["admincivicpulse123@gmail.com"].includes(ctx.user.email ?? "")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
        }
        // Clean up moderation reports first
        await deleteModerationReportsForTarget("report", input.reportId);
        await deleteIssue(input.reportId);
        void logAction(ctx.req, "REPORT_DELETED_MODERATION", `Report ${input.reportId} deleted via moderation`, ctx.user.id, ctx.user.email ?? undefined);
        return { success: true };
      }),

    // Admin: dismiss flag without taking action
    dismissFlag: protectedProcedure
      .input(z.object({
        targetType: z.enum(["account", "report"]),
        targetId: z.number().int().positive(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && !["admincivicpulse123@gmail.com"].includes(ctx.user.email ?? "")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
        }
        await dismissModerationReports(input.targetType, input.targetId);
        return { success: true };
      }),
  }),
  maps: router({
    reverseGeocode: publicProcedure
      .input(z.object({ lat: z.number(), lng: z.number() }))
      .query(async ({ input }) => {
        // Round to 4 decimal places for cache key (~11m precision — good enough)
        const cacheKey = `${input.lat.toFixed(4)},${input.lng.toFixed(4)}`;
        const cached = geocodeCache.get(cacheKey);
        if (cached) return { address: cached };

        // Use Google Geocoding API if key is available
        const googleApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
        
        if (googleApiKey) {
          try {
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${input.lat},${input.lng}&key=${googleApiKey}`
            );
            const data = await response.json();
            if (data.status === "OK" && data.results.length > 0) {
              const address = data.results[0].formatted_address || "Unknown Location";
              geocodeCache.set(cacheKey, address);
              return { address };
            }
            console.warn("[Geocoding] Google API returned:", data.status);
          } catch (error: any) {
            console.error("[Geocoding] Google API error:", error.message);
          }
        }

        // Fallback to Nominatim if Google fails or no key
        const now = Date.now();
        const wait = lastNominatimCall + 1100 - now;
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastNominatimCall = Date.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${input.lat}&lon=${input.lng}&format=json`,
            {
              headers: {
                "User-Agent": "CivicPulse/1.0 (admincivicpulse123@gmail.com)",
                "Accept-Language": "en",
              },
              signal: controller.signal,
            }
          );
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`Geocoding service returned ${response.status}`);
          const data = await response.json();
          const address = data.display_name || "Unknown Location";
          geocodeCache.set(cacheKey, address);
          return { address };
        } catch (error: any) {
          clearTimeout(timeoutId);
          console.error("[Geocoding Error]", error.name === "AbortError" ? "Timeout" : error.message);
          return { address: "Location identified by coordinates (Service busy)" };
        }
      }),

    forwardGeocode: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        const cacheKey = `fwd:${input.query.toLowerCase().trim()}`;
        const cached = geocodeCache.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const now = Date.now();
        const wait = lastNominatimCall + 1100 - now;
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastNominatimCall = Date.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input.query)}&format=json`,
            {
              headers: {
                "User-Agent": "CivicPulse/1.0 (admincivicpulse123@gmail.com)",
                "Accept-Language": "en",
              },
              signal: controller.signal,
            }
          );
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error("Search service unavailable");
          const data = await response.json();
          const results = data.map((item: any) => ({
            display_name: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }));
          geocodeCache.set(cacheKey, JSON.stringify(results));
          return results;
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

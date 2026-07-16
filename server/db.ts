import { eq, sql, and, lt, desc } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { InsertUser, users, issues, InsertIssue, issueImages, userVotes, otpCodes, notifications, InsertNotification, passwordResetTokens, moderationReports } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;
let _isInitializing = false;

const inMemoryStore = {
  users: [] as any[],
  issues: [] as any[],
  issueImages: [] as any[],
  userVotes: [] as any[],
  notifications: [] as any[],
  otps: [] as any[],
};

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;
  if (_isInitializing) {
    // Wait for initialization to complete
    await new Promise(r => setTimeout(r, 2000));
    return _db;
  }

  _isInitializing = true;
  try {
    const dbUrl = process.env.DATABASE_URL.trim();
    _client = postgres(dbUrl, { max: 5, idle_timeout: 20 });
    _db = drizzle(_client);
    console.log(`[Database] Connected to PostgreSQL successfully.`);
  } catch (error: any) {
    console.error("[Database] Setup failed:", error.message || error);
    console.error("[Database] ⚠️  FALLING BACK TO IN-MEMORY STORE — data will be lost on restart!");
    _db = null;
    _client = null;
  } finally {
    _isInitializing = false;
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<any> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    const normEmail = user.email ? user.email.trim().toLowerCase() : null;
    let existing = inMemoryStore.users.find(u => u.openId === user.openId);
    if (!existing && normEmail) {
      existing = inMemoryStore.users.find(u => u.email === normEmail);
    }
    if (existing) {
      Object.assign(existing, user);
      if (normEmail) existing.email = normEmail;
      existing.lastSignedIn = user.lastSignedIn ?? existing.lastSignedIn ?? new Date();
      return existing;
    } else {
      const newUser = {
        id: inMemoryStore.users.length + 1,
        ...user,
        email: normEmail,
        verified: user.verified ?? false,
        role: user.role ?? 'user',
        anonymousReportCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryStore.users.push(newUser);
      return newUser;
    }
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "password"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized as any;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    if (user.verified !== undefined) {
      values.verified = user.verified;
      updateSet.verified = user.verified;
    }
    const adminEmails = [
      "hallamohamad1@gmail.com",
      "admincivicpulse123@gmail.com",
    ];

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId || (user.email && adminEmails.includes(user.email.toLowerCase()))) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else {
      values.role = 'user';
      updateSet.role = 'user';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users)
      .values(values as any)
      .onConflictDoUpdate({
        target: users.openId,
        set: updateSet,
      });

    const result = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
    return result[0];
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    return inMemoryStore.users.find((u) => u.openId === openId);
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] ⚠️  getUserByEmail called with no DB — using in-memory fallback");
    return inMemoryStore.users.find((u) => u.email === email.trim().toLowerCase());
  }
  const result = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserSettings(userId: number, data: { language?: string; theme?: string; notificationSettings?: string }) {
  const db = await getDb();
  if (!db) {
    const user = inMemoryStore.users.find(u => u.id === userId);
    if (!user) throw new Error("User not found");
    Object.assign(user, data);
    return user;
  }

  try {
    await db.update(users).set(data).where(eq(users.id, userId));
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return result[0];
  } catch (error) {
    console.error("[Database] Failed to update user settings:", error);
    throw error;
  }
}

export async function getIssues(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(issues)
      .where(and(eq(issues.isHidden, 0), eq(issues.anonymousApproved, 1)))
      .orderBy(issues.createdAt).limit(limit).offset(offset);
  } catch (error) {
    console.error("[Database] Failed to get issues:", error);
    return [];
  }
}

export async function getAdminAllIssues(filters?: { status?: string; riskLevel?: string }) {
  const db = await getDb();
  if (!db) return [];
  try {
    let query = db.select({
      id: issues.id,
      title: issues.title,
      description: issues.description,
      category: issues.category,
      status: issues.status,
      severity: issues.severity,
      riskLevel: issues.riskLevel,
      isHidden: issues.isHidden,
      address: issues.address,
      latitude: issues.latitude,
      longitude: issues.longitude,
      imageUrl: issues.imageUrl,
      upvotes: issues.upvotes,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    }).from(issues).leftJoin(users, eq(issues.userId, users.id));

    const whereConditions = [];
    if (filters?.status) {
      whereConditions.push(eq(issues.status, filters.status as any));
    }
    if (filters?.riskLevel) {
      whereConditions.push(eq(issues.riskLevel, filters.riskLevel as any));
    }

    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions)) as any;
    }

    return await query.orderBy(desc(issues.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get admin issues:", error);
    return [];
  }
}

export async function getIssueById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db.select().from(issues).where(eq(issues.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get issue by id:", error);
    return undefined;
  }
}

export async function getIssuesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(issues).where(eq(issues.userId, userId)).orderBy(issues.createdAt);
  } catch (error) {
    console.error("[Database] Failed to get user issues:", error);
    return [];
  }
}

export async function getIssueCount() {
  const db = await getDb();
  if (!db) return 0;
  try {
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(issues);
    return Number(result[0]?.count ?? 0);
  } catch (error) {
    console.error("[Database] Failed to get issue count:", error);
    return 0;
  }
}

export async function createIssue(data: InsertIssue) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const user = await db.select().from(users).where(eq(users.id, data.userId!)).limit(1);
    if (user.length === 0) {
      throw new Error(`User with ID ${data.userId} not found in database.`);
    }

    const cleanData: any = { ...data };
    if (!cleanData.imageUrl) delete cleanData.imageUrl;

    const result = await db.insert(issues).values(cleanData).returning({ id: issues.id });
    return await getIssueById(result[0].id);
  } catch (error: any) {
    console.error("[Database] Failed to create issue:", error);
    const pgError = error.message || JSON.stringify(error);
    throw new Error(`Database Error: ${pgError}`);
  }
}

export async function updateIssue(id: number, data: Partial<InsertIssue>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.update(issues).set(data).where(eq(issues.id, id));
    return await getIssueById(id);
  } catch (error) {
    console.error("[Database] Failed to update issue:", error);
    throw error;
  }
}

export async function rateIssueResolution(id: number, rating: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.update(issues).set({ resolutionRating: rating }).where(eq(issues.id, id));
    return await getIssueById(id);
  } catch (error) {
    console.error("[Database] Failed to rate issue:", error);
    throw error;
  }
}

export async function deleteIssue(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.delete(issues).where(eq(issues.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete issue:", error);
    throw error;
  }
}

export async function upvoteIssue(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.update(issues).set({ upvotes: sql`${issues.upvotes} + 1` }).where(eq(issues.id, id));
    return await getIssueById(id);
  } catch (error) {
    console.error("[Database] Failed to upvote issue:", error);
    throw error;
  }
}

export async function getIssueImages(issueId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(issueImages).where(eq(issueImages.issueId, issueId));
  } catch (error) {
    console.error("[Database] Failed to get issue images:", error);
    return [];
  }
}

export async function addIssueImage(issueId: number, imageUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    return await db.insert(issueImages).values({ issueId, imageUrl });
  } catch (error) {
    console.error("[Database] Failed to add issue image:", error);
    throw error;
  }
}

export async function hasUserVoted(userId: number, issueId: number) {
  const db = await getDb();
  if (!db) return false;
  try {
    const result = await db.select().from(userVotes).where(and(eq(userVotes.userId, userId), eq(userVotes.issueId, issueId))).limit(1);
    return result.length > 0;
  } catch (error) {
    console.error("[Database] Failed to check vote:", error);
    return false;
  }
}

export async function addUserVote(userId: number, issueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    const existing = await hasUserVoted(userId, issueId);
    if (existing) throw new Error("User has already voted on this issue");
    await db.insert(userVotes).values({ userId, issueId });
    await db.update(issues).set({ upvotes: sql`${issues.upvotes} + 1` }).where(eq(issues.id, issueId));
    return await getIssueById(issueId);
  } catch (error) {
    console.error("[Database] Failed to add vote:", error);
    throw error;
  }
}

export async function getUserVotes(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(userVotes).where(eq(userVotes.userId, userId));
  } catch (error) {
    console.error("[Database] Failed to get user votes:", error);
    return [];
  }
}

export async function updateIssueStatus(issueId: number, status: "open" | "in-progress" | "resolved") {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.update(issues).set({ status, updatedAt: new Date() }).where(eq(issues.id, issueId));
    const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (issue) {
      const statusLabels = {
        "open": "Open",
        "in-progress": "In Progress",
        "resolved": "Resolved"
      };
      await createNotification({
        userId: issue.userId,
        issueId: issue.id,
        title: "Issue Status Updated",
        message: `The status of your issue "${issue.title}" has been updated to ${statusLabels[status]}.`,
        type: "status_change"
      });
    }
    return true;
  } catch (error) {
    console.error("[Database] Failed to update issue status:", error);
    return false;
  }
}

export async function createNotification(notification: InsertNotification) {
  const db = await getDb();
  if (!db) return null;
  try {
    const [result] = await db.insert(notifications).values(notification).returning();
    return result;
  } catch (error) {
    console.error("[Database] Failed to create notification:", error);
    return false;
  }
}

export async function getNotifications(userId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(sql`${notifications.createdAt} DESC`)
      .limit(limit);
  } catch (error) {
    console.error("[Database] Failed to get notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead(id: number) {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.update(notifications).set({ isRead: 1 }).where(eq(notifications.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to mark notification as read:", error);
    return false;
  }
}

export async function clearAllNotifications(userId: number) {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.delete(notifications).where(eq(notifications.userId, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to clear notifications:", error);
    return false;
  }
}

export async function updateIssueRiskLevel(id: number, riskLevel: "low" | "medium" | "high" | "critical") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.update(issues).set({ riskLevel }).where(eq(issues.id, id));
    return await getIssueById(id);
  } catch (error) {
    console.error("[Database] Failed to update risk level:", error);
    throw error;
  }
}

export async function hideIssue(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.update(issues).set({ isHidden: 1 }).where(eq(issues.id, id));
    return await getIssueById(id);
  } catch (error) {
    console.error("[Database] Failed to hide issue:", error);
    throw error;
  }
}

export async function unhideIssue(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.update(issues).set({ isHidden: 0 }).where(eq(issues.id, id));
    return await getIssueById(id);
  } catch (error) {
    console.error("[Database] Failed to unhide issue:", error);
    throw error;
  }
}

export async function getHiddenIssues(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(issues).where(eq(issues.isHidden, 1)).orderBy(issues.createdAt).limit(limit).offset(offset);
  } catch (error) {
    console.error("[Database] Failed to get hidden issues:", error);
    return [];
  }
}

export async function deleteOldOtps(email: string) {
  const db = await getDb();
  if (!db) {
    inMemoryStore.otps = inMemoryStore.otps.filter(o => o.email !== email.trim().toLowerCase());
    return;
  }
  try {
    await db.delete(otpCodes).where(eq(otpCodes.email, email));
  } catch (error) {
    console.error("[Database] Failed to delete old OTPs:", error);
  }
}

export async function createOtpCode(email: string, code: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) {
    const normEmail = email.trim().toLowerCase();
    await deleteOldOtps(normEmail);
    const newOtp = {
      id: inMemoryStore.otps.length + 1,
      email: normEmail,
      code,
      expiresAt,
      isUsed: 0,
      createdAt: new Date(),
    };
    inMemoryStore.otps.push(newOtp);
    return [newOtp];
  }

  try {
    await deleteOldOtps(email);
    const result = await db.insert(otpCodes).values({ email, code, expiresAt }).returning();
    return result;
  } catch (error) {
    console.error("[Database] Failed to create OTP code:", error);
    throw error;
  }
}

export async function verifyOtpCode(email: string, code: string) {
  const db = await getDb();
  if (!db) {
    const normEmail = email.trim().toLowerCase();
    const otpRecord = inMemoryStore.otps.find(o => o.email === normEmail && o.code === code);
    if (!otpRecord) return false;
    if (otpRecord.isUsed) return false;
    const expiryTime = new Date(otpRecord.expiresAt).getTime();
    const currentTime = Date.now();
    if (currentTime > (expiryTime + 60000)) return false;
    return true;
  }

  try {
    console.log(`[DB] Verifying OTP for: ${email}, Code: ${code}`);

    const result = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.email, email), eq(otpCodes.code, code)))
      .limit(1);
    
    if (result.length === 0) {
      console.log(`[OTP VERIFY] No record found for ${email} with code ${code}`);
      return false;
    }
    
    const otpRecord = result[0];
    
    if (otpRecord.isUsed) {
      console.log(`[OTP VERIFY] Code ${code} for ${email} has already been used.`);
      return false;
    }

    const expiryTime = new Date(otpRecord.expiresAt).getTime();
    const currentTime = Date.now();
    
    console.log(`[DB OTP] Expiry: ${new Date(expiryTime).toISOString()}`);
    console.log(`[DB OTP] Now: ${new Date(currentTime).toISOString()}`);
    
    if (currentTime > (expiryTime + 60000)) {
      console.log(`[OTP VERIFY] Expired. Current: ${new Date(currentTime).toISOString()}, Expiry: ${new Date(expiryTime).toISOString()}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("[Database] Failed to verify OTP:", error);
    return false;
  }
}

export async function markOtpAsUsed(email: string, code: string) {
  const db = await getDb();
  if (!db) {
    const normEmail = email.trim().toLowerCase();
    const otpRecord = inMemoryStore.otps.find(o => o.email === normEmail && o.code === code);
    if (otpRecord) {
      otpRecord.isUsed = 1;
    }
    return;
  }

  try {
    await db
      .update(otpCodes)
      .set({ isUsed: 1 })
      .where(and(eq(otpCodes.email, email), eq(otpCodes.code, code)));
  } catch (error) {
    console.error("[Database] Failed to mark OTP as used:", error);
    throw error;
  }
}

export async function getAnonymousReportCountForUser(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(issues)
      .where(and(eq(issues.userId, userId), eq(issues.isAnonymous, 1)));
    return Number(result[0]?.count ?? 0);
  } catch (error) {
    console.error("[Database] Failed to get anonymous report count:", error);
    return 0;
  }
}

export async function getPendingAnonymousIssues() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select({
        id: issues.id,
        title: issues.title,
        description: issues.description,
        category: issues.category,
        status: issues.status,
        severity: issues.severity,
        riskLevel: issues.riskLevel,
        isHidden: issues.isHidden,
        isAnonymous: issues.isAnonymous,
        anonymousApproved: issues.anonymousApproved,
        address: issues.address,
        latitude: issues.latitude,
        longitude: issues.longitude,
        imageUrl: issues.imageUrl,
        upvotes: issues.upvotes,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(issues)
      .leftJoin(users, eq(issues.userId, users.id))
      .where(and(eq(issues.isAnonymous, 1), eq(issues.anonymousApproved, 0)))
      .orderBy(issues.createdAt);
  } catch (error) {
    console.error("[Database] Failed to get pending anonymous issues:", error);
    return [];
  }
}

export async function approveAnonymousIssue(issueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.update(issues).set({ anonymousApproved: 1 }).where(eq(issues.id, issueId));
    return await getIssueById(issueId);
  } catch (error) {
    console.error("[Database] Failed to approve anonymous issue:", error);
    throw error;
  }
}

export async function rejectAnonymousIssue(issueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    const issue = await getIssueById(issueId);
    if (issue) {
      await db
        .update(users)
        .set({ anonymousReportCount: sql`GREATEST(0, ${users.anonymousReportCount} - 1)` })
        .where(eq(users.id, issue.userId));
    }
    await db.delete(issues).where(eq(issues.id, issueId));
    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to reject anonymous issue:", error);
    throw error;
  }
}

const pwdResetInMemory: Array<{
  id: number; email: string; tokenHash: string;
  expiresAt: Date; isUsed: number; createdAt: Date;
}> = [];

export async function createPasswordResetToken(
  email: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  const normEmail = email.trim().toLowerCase();
  const db = await getDb();
  if (!db) {
    const idx = pwdResetInMemory.findIndex(r => r.email === normEmail);
    if (idx !== -1) pwdResetInMemory.splice(idx, 1);
    pwdResetInMemory.push({
      id: pwdResetInMemory.length + 1,
      email: normEmail, tokenHash, expiresAt, isUsed: 0, createdAt: new Date(),
    });
    return;
  }
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, normEmail));
  await db.insert(passwordResetTokens).values({ email: normEmail, tokenHash, expiresAt });
}

export async function getPasswordResetToken(tokenHash: string) {
  const db = await getDb();
  if (!db) {
    return pwdResetInMemory.find(r => r.tokenHash === tokenHash) ?? null;
  }
  const result = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function markPasswordResetTokenUsed(tokenHash: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    const r = pwdResetInMemory.find(r => r.tokenHash === tokenHash);
    if (r) r.isUsed = 1;
    return;
  }
  await db
    .update(passwordResetTokens)
    .set({ isUsed: 1 })
    .where(eq(passwordResetTokens.tokenHash, tokenHash));
}

export async function getOtpForEmail(email: string) {
  const normEmail = email.trim().toLowerCase();
  const db = await getDb();
  if (!db) {
    return inMemoryStore.otps.find(o => o.email === normEmail && !o.isUsed) ?? null;
  }
  try {
    const result = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.email, normEmail), eq(otpCodes.isUsed, 0)))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get OTP for email:", error);
    return null;
  }
}

export async function updateUserPassword(openId: string, hashedPassword: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    const u = inMemoryStore.users.find(u => u.openId === openId);
    if (u) u.password = hashedPassword;
    return;
  }
  await db.update(users).set({ password: hashedPassword }).where(eq(users.openId, openId));
}

export async function setUserVerified(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    const u = inMemoryStore.users.find(u => u.openId === openId);
    if (u) u.verified = true;
    return;
  }
  await db.update(users).set({ verified: true }).where(eq(users.openId, openId));
}

const MODERATION_THRESHOLD = 3;

export async function blockUserByOpenId(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    const u = inMemoryStore.users.find(u => u.openId === openId);
    if (u) (u as any).blocked = true;
    return;
  }
  await db.update(users).set({ blocked: true } as any).where(eq(users.openId, openId));
}

export async function insertModerationReport(
  reporterId: number,
  targetType: "account" | "report",
  targetId: number,
  reason: string | null,
): Promise<{ isDuplicate: boolean; totalCount: number }> {
  const db = await getDb();
  if (!db) {
    return { isDuplicate: false, totalCount: 1 };
  }
  try {
    await db.insert(moderationReports).values({
      reporterId,
      targetType,
      targetId,
      reason,
    } as any);
  } catch (err: any) {
    if (err.code === '23505') { // Postgres duplicate key error code
      return { isDuplicate: true, totalCount: 0 };
    }
    throw err;
  }
  const [rows] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(moderationReports)
    .where(
      and(
        eq((moderationReports as any).targetType, targetType),
        eq((moderationReports as any).targetId, targetId),
        eq((moderationReports as any).reviewed, false),
      ),
    );
  return { isDuplicate: false, totalCount: Number(rows?.count ?? 0) };
}

export async function getFlaggedItems() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(
    sql`
      SELECT
        mr."targetType",
        mr."targetId",
        COUNT(*) AS "reportCount",
        MAX(mr."createdAt") AS "lastReportedAt",
        u.id AS "userId", u.name AS "userName", u.email AS "userEmail", u.blocked AS "userBlocked",
        ci.title AS "issueTitle", ci.description AS "issueDescription", ci.status AS "issueStatus"
      FROM moderation_reports mr
      LEFT JOIN users u ON mr."targetType"::text = 'account' AND u.id = mr."targetId"
      LEFT JOIN civic_issues_v2 ci ON mr."targetType"::text = 'report' AND ci.id = mr."targetId"
      WHERE mr.reviewed = false
      GROUP BY mr."targetType", mr."targetId",
               u.id, u.name, u.email, u.blocked,
               ci.title, ci.description, ci.status
      HAVING COUNT(*) >= ${MODERATION_THRESHOLD}
      ORDER BY COUNT(*) DESC
    `
  );
  return rows;
}

export async function dismissModerationReports(
  targetType: "account" | "report",
  targetId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(moderationReports)
    .set({ reviewed: true } as any)
    .where(
      and(
        eq((moderationReports as any).targetType, targetType),
        eq((moderationReports as any).targetId, targetId),
      ),
    );
}

export async function deleteModerationReportsForTarget(
  targetType: "account" | "report",
  targetId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(moderationReports)
    .where(
      and(
        eq((moderationReports as any).targetType, targetType),
        eq((moderationReports as any).targetId, targetId),
      ),
    );
}

export async function countPendingFlaggedItems(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.execute(
    sql`
      SELECT COUNT(*) AS cnt FROM (
        SELECT mr."targetType", mr."targetId"
        FROM moderation_reports mr
        WHERE mr.reviewed = false
        GROUP BY mr."targetType", mr."targetId"
        HAVING COUNT(*) >= ${MODERATION_THRESHOLD}
      ) AS sub
    `
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function hasReporterAlreadyReported(
  reporterId: number,
  targetType: "account" | "report",
  targetId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select()
    .from(moderationReports)
    .where(
      and(
        eq((moderationReports as any).reporterId, reporterId),
        eq((moderationReports as any).targetType, targetType),
        eq((moderationReports as any).targetId, targetId),
      ),
    )
    .limit(1);
  return result.length > 0;
}

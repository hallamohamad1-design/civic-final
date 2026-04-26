import { eq, sql, and, lt } from "drizzle-orm";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, issues, InsertIssue, issueImages, userVotes, otpCodes } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const dbUrl = process.env.DATABASE_URL.trim();
      const url = new URL(dbUrl);
      
      const config: mysql.PoolOptions = {
        host: url.hostname,
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1).split('?')[0] || undefined,
        port: parseInt(url.port) || 3306,
        ssl: (dbUrl.includes("tidbcloud.com") || dbUrl.includes("ssl")) ? {
          rejectUnauthorized: true
        } : undefined,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 10,
        idleTimeout: 60000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      };

      _pool = mysql.createPool(config);
      
      // Handle pool errors to prevent app crashes
      (_pool as any).on('error', (err: any) => {
        console.error('[Database Pool Error]', err.message || err);
        _db = null;
        _pool = null;
      });

      _db = drizzle(_pool as any) as any;
      
      // Test the connection with a timeout
      await Promise.race([
        _pool.query("SELECT 1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 5000))
      ]);
      
      console.log(`[Database] Connected to ${url.hostname} successfully.`);
    } catch (error: any) {
      console.error("[Database] Setup failed:", error.message || error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId || user.email === 'zahraaabozead@gmail.com') {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Issue query helpers

export async function getIssues(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get issues: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(issues)
      .where(eq(issues.isHidden, 0))
      .orderBy(issues.createdAt)
      .limit(limit)
      .offset(offset);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get issues:", error);
    return [];
  }
}

export async function getIssueById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get issue: database not available");
    return undefined;
  }

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
  if (!db) {
    console.warn("[Database] Cannot get user issues: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(issues)
      .where(eq(issues.userId, userId))
      .orderBy(issues.createdAt);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get user issues:", error);
    return [];
  }
}

export async function getIssueCount() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get issue count: database not available");
    return 0;
  }

  try {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(issues);
    return result[0]?.count ?? 0;
  } catch (error) {
    console.error("[Database] Failed to get issue count:", error);
    return 0;
  }
}

export async function createIssue(data: InsertIssue) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    const result = await db.insert(issues).values(data);
    // Return the created issue by fetching it
    const insertedId = result[0].insertId;
    return await getIssueById(Number(insertedId));
  } catch (error) {
    console.error("[Database] Failed to create issue:", error);
    throw error;
  }
}

export async function updateIssue(id: number, data: Partial<InsertIssue>) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.update(issues).set(data).where(eq(issues.id, id));
    return await getIssueById(id);
  } catch (error) {
    console.error("[Database] Failed to update issue:", error);
    throw error;
  }
}

export async function deleteIssue(id: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

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
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db
      .update(issues)
      .set({ upvotes: sql`${issues.upvotes} + 1` })
      .where(eq(issues.id, id));
    return await getIssueById(id);
  } catch (error) {
    console.error("[Database] Failed to upvote issue:", error);
    throw error;
  }
}

export async function getIssueImages(issueId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get issue images: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(issueImages)
      .where(eq(issueImages.issueId, issueId));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get issue images:", error);
    return [];
  }
}

export async function addIssueImage(issueId: number, imageUrl: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    const result = await db.insert(issueImages).values({ issueId, imageUrl });
    return result;
  } catch (error) {
    console.error("[Database] Failed to add issue image:", error);
    throw error;
  }
}

// User votes query helpers

export async function hasUserVoted(userId: number, issueId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot check vote: database not available");
    return false;
  }

  try {
    const result = await db
      .select()
      .from(userVotes)
      .where(and(eq(userVotes.userId, userId), eq(userVotes.issueId, issueId)))
      .limit(1);
    return result.length > 0;
  } catch (error) {
    console.error("[Database] Failed to check vote:", error);
    return false;
  }
}

export async function addUserVote(userId: number, issueId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    // Check if vote already exists
    const existing = await hasUserVoted(userId, issueId);
    if (existing) {
      throw new Error("User has already voted on this issue");
    }

    // Add the vote
    await db.insert(userVotes).values({ userId, issueId });

    // Increment the upvotes count
    await db
      .update(issues)
      .set({ upvotes: sql`${issues.upvotes} + 1` })
      .where(eq(issues.id, issueId));

    return await getIssueById(issueId);
  } catch (error) {
    console.error("[Database] Failed to add vote:", error);
    throw error;
  }
}

export async function getUserVotes(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user votes: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(userVotes)
      .where(eq(userVotes.userId, userId));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get user votes:", error);
    return [];
  }
}

// OTP query helpers

export async function createOtpCode(email: string, code: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    const result = await db.insert(otpCodes).values({ email, code, expiresAt });
    return result;
  } catch (error) {
    console.error("[Database] Failed to create OTP code:", error);
    throw error;
  }
}

export async function verifyOtpCode(email: string, code: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot verify OTP: database not available");
    return false;
  }

  try {
    const result = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.email, email), eq(otpCodes.code, code), eq(otpCodes.isUsed, 0)))
      .limit(1);
    
    if (result.length === 0) return false;
    
    // Check if OTP is expired
    const otpRecord = result[0];
    if (new Date() > new Date(otpRecord.expiresAt)) {
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
    throw new Error("Database not available");
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

export async function cleanupExpiredOtps() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot cleanup OTPs: database not available");
    return;
  }

  try {
    await db.delete(otpCodes).where(lt(otpCodes.expiresAt, new Date()));
  } catch (error) {
    console.error("[Database] Failed to cleanup expired OTPs:", error);
  }
}

// AI Risk Detection helpers

export async function updateIssueRiskLevel(id: number, riskLevel: "low" | "medium" | "high" | "critical") {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

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
  if (!db) {
    throw new Error("Database not available");
  }

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
  if (!db) {
    throw new Error("Database not available");
  }

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
  if (!db) {
    console.warn("[Database] Cannot get hidden issues: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(issues)
      .where(eq(issues.isHidden, 1))
      .orderBy(issues.createdAt)
      .limit(limit)
      .offset(offset);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get hidden issues:", error);
    return [];
  }
}

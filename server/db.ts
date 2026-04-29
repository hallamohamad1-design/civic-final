import { eq, sql, and, lt, desc } from "drizzle-orm";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, issues, InsertIssue, issueImages, userVotes } from "../drizzle/schema";
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

      // AUTO-MIGRATION CHECK: Add missing columns if they don't exist
      try {
        console.log("[Database] Running auto-migration check...");
        const [usersColumns] = await _pool.query("SHOW COLUMNS FROM users");
        const userColNames = (usersColumns as any[]).map(c => c.Field);
        
        if (!userColNames.includes("language")) {
          await _pool.query("ALTER TABLE users ADD COLUMN language VARCHAR(10) DEFAULT 'en' NOT NULL");
          console.log("[Database] Added 'language' column.");
        }
        if (!userColNames.includes("theme")) {
          await _pool.query("ALTER TABLE users ADD COLUMN theme VARCHAR(20) DEFAULT 'light' NOT NULL");
          console.log("[Database] Added 'theme' column.");
        }
        if (!userColNames.includes("notificationSettings")) {
          await _pool.query("ALTER TABLE users ADD COLUMN notificationSettings TEXT");
          // Initialize with default JSON
          await _pool.query("UPDATE users SET notificationSettings = '{\"statusChanges\":true,\"newComments\":true,\"emailDigest\":true}' WHERE notificationSettings IS NULL");
          console.log("[Database] Added 'notificationSettings' column.");
        }
        if (!userColNames.includes("password")) {
          await _pool.query("ALTER TABLE users ADD COLUMN password TEXT");
          console.log("[Database] Added 'password' column.");
        }

        const [issuesColumns] = await _pool.query("SHOW COLUMNS FROM issues");
        const issueColNames = (issuesColumns as any[]).map(c => c.Field);
        if (!issueColNames.includes("riskLevel")) {
          await _pool.query("ALTER TABLE issues ADD COLUMN riskLevel ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' NOT NULL");
          console.log("[Database] Added 'riskLevel' column to issues.");
        }
        if (!issueColNames.includes("isHidden")) {
          await _pool.query("ALTER TABLE issues ADD COLUMN isHidden INT DEFAULT 0 NOT NULL");
          console.log("[Database] Added 'isHidden' column to issues.");
        }
      } catch (migrateError) {
        console.error("[Database] Auto-migration check failed:", migrateError);
      }

    } catch (error: any) {
      console.error("[Database] Setup failed:", error.message || error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<any> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
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
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserSettings(userId: number, data: { language?: string; theme?: string; notificationSettings?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.update(users).set(data).where(eq(users.id, userId));
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return result[0];
  } catch (error) {
    console.error("[Database] Failed to update user settings:", error);
    throw error;
  }
}

// Issue query helpers
export async function getIssues(limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(issues).where(eq(issues.isHidden, 0)).orderBy(issues.createdAt).limit(limit).offset(offset);
  } catch (error) {
    console.error("[Database] Failed to get issues:", error);
    return [];
  }
}

export async function getAdminAllIssues() {
  const db = await getDb();
  if (!db) return [];
  try {
    const result = await db.select({
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
    }).from(issues).leftJoin(users, eq(issues.userId, users.id)).orderBy(desc(issues.createdAt));
    return result;
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
    return result[0]?.count ?? 0;
  } catch (error) {
    console.error("[Database] Failed to get issue count:", error);
    return 0;
  }
}

export async function createIssue(data: InsertIssue) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    const result = await db.insert(issues).values(data);
    const insertedId = result[0].insertId;
    return await getIssueById(Number(insertedId));
  } catch (error) {
    console.error("[Database] Failed to create issue:", error);
    throw error;
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

// AI Risk Detection helpers
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

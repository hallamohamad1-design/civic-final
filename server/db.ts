import { eq, sql, and, lt, desc } from "drizzle-orm";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, issues, InsertIssue, issueImages, userVotes, otpCodes, notifications, InsertNotification } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const dbUrl = process.env.DATABASE_URL.trim();
      
      // Use mysql.createPool directly with the connection string if possible, 
      // or provide a more robust parsing logic.
      _pool = mysql.createPool({
        uri: dbUrl,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 10,
        idleTimeout: 60000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        charset: "utf8mb4",
        ssl: (dbUrl.includes("tidbcloud.com") || dbUrl.includes("ssl")) ? {
          rejectUnauthorized: true
        } : undefined,
      });
      
      // Handle pool errors to prevent app crashes
      (_pool as any).on('error', (err: any) => {
        console.error('[Database Pool Error]', err.message || err);
        _db = null;
        _pool = null;
      });

      _db = drizzle(_pool as any) as any;
      
      console.log(`[Database] Connected to MySQL successfully.`);
      
      // OPTIMIZATION: Try to increase max_allowed_packet for this session to handle large images
      try {
        await _pool.query("SET SESSION max_allowed_packet = 104857600"); // 100MB
        console.log("[Database] Increased session max_allowed_packet to 100MB");
      } catch (e) {
        console.warn("[Database] Could not increase max_allowed_packet, large images might fail.");
      }

      // AUTO-MIGRATION CHECK: Add missing columns or update lengths if they don't exist
      try {
        console.log("[Database] Running auto-migration check...");
        // Ensure the new table exists with the correct structure
        await _pool.query(`
          CREATE TABLE IF NOT EXISTS civic_issues_v2 (
            id INT AUTO_INCREMENT PRIMARY KEY,
            userId INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            category VARCHAR(64) NOT NULL,
            status ENUM('open', 'in-progress', 'resolved') DEFAULT 'open' NOT NULL,
            severity ENUM('low', 'medium', 'high') DEFAULT 'medium' NOT NULL,
            riskLevel ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' NOT NULL,
            isHidden INT DEFAULT 0 NOT NULL,
            address VARCHAR(512) NOT NULL,
            latitude VARCHAR(64) NOT NULL,
            longitude VARCHAR(64) NOT NULL,
            imageUrl LONGTEXT,
            upvotes INT DEFAULT 0 NOT NULL,
            resolutionRating INT DEFAULT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
          )
        `);

        const [issuesColumns] = await _pool.query("SHOW COLUMNS FROM civic_issues_v2");
        const issuesColDetails = (issuesColumns as any[]);
        const issueColNames = issuesColDetails.map(c => c.Field);
        
        // Helper to add column if missing
        const ensureColumn = async (name: string, definition: string) => {
          if (!issueColNames.includes(name)) {
            console.log(`[Database] Adding missing column 'civic_issues_v2.${name}'...`);
            await _pool!.query(`ALTER TABLE civic_issues_v2 ADD COLUMN ${name} ${definition}`);
          }
        };

        // Ensure address length
        const addressCol = issuesColDetails.find(c => c.Field === 'address');
        if (addressCol && addressCol.Type.includes('varchar(255)')) {
          await _pool.query("ALTER TABLE civic_issues_v2 MODIFY COLUMN address VARCHAR(512) NOT NULL");
        }

        // ONE-TIME DATA MIGRATION: Copy from old 'issues' table if it exists
        try {
          const [oldTableCheck]: any = await _pool.query("SHOW TABLES LIKE 'issues'");
          if (oldTableCheck.length > 0) {
            console.log("[Database] Legacy 'issues' table found. Checking for data to migrate...");
            const [oldData]: any = await _pool.query("SELECT * FROM issues");
            if (oldData.length > 0) {
              console.log(`[Database] Migrating ${oldData.length} records to civic_issues_v2...`);
              for (const row of oldData) {
                // Check if already exists in new table to avoid duplicates
                const [exists]: any = await _pool.query("SELECT id FROM civic_issues_v2 WHERE id = ?", [row.id]);
                if (exists.length === 0) {
                  const cols = Object.keys(row).join(", ");
                  const placeholders = Object.keys(row).map(() => "?").join(", ");
                  const vals = Object.values(row);
                  await _pool.query(`INSERT INTO civic_issues_v2 (${cols}) VALUES (${placeholders})`, vals);
                }
              }
              console.log("[Database] Migration completed successfully.");
              // Optional: rename old table to keep as backup
              await _pool.query("RENAME TABLE issues TO issues_backup_" + Date.now());
            }
          }
        } catch (migrationError) {
          console.error("[Database] Migration failed (likely already done or tables mismatch):", migrationError);
        }

        // Ensure imageUrl type
        const imageUrlCol = issuesColDetails.find(c => c.Field === 'imageUrl');
        if (imageUrlCol && !imageUrlCol.Type.includes('longtext')) {
          await _pool.query("ALTER TABLE civic_issues_v2 MODIFY COLUMN imageUrl LONGTEXT");
        }

        // Users auto-migration
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

        // Add all potential missing columns
        await ensureColumn("status", "ENUM('open', 'in-progress', 'resolved') DEFAULT 'open' NOT NULL");
        await ensureColumn("severity", "ENUM('low', 'medium', 'high') DEFAULT 'medium' NOT NULL");
        await ensureColumn("riskLevel", "ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' NOT NULL");
        await ensureColumn("isHidden", "INT DEFAULT 0 NOT NULL");
        await ensureColumn("upvotes", "INT DEFAULT 0 NOT NULL");
        await ensureColumn("resolutionRating", "INT DEFAULT NULL");
        
        // AI columns
        await ensureColumn("severity_score", "INT");
        await ensureColumn("ai_summary", "TEXT");
        await ensureColumn("detected_hazards", "TEXT");
        await ensureColumn("recommended_action", "TEXT");
        await ensureColumn("estimated_urgency_hours", "INT");
        await ensureColumn("ai_confidence", "TEXT");
        await ensureColumn("analysis_timestamp", "TIMESTAMP NULL");

        // Create otp_codes table if it doesn't exist
        await _pool.query(`
          CREATE TABLE IF NOT EXISTS otp_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(320) NOT NULL,
            code VARCHAR(6) NOT NULL,
            expiresAt TIMESTAMP NOT NULL,
            isUsed INT DEFAULT 0 NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
          )
        `);
        console.log("[Database] Ensured 'otp_codes' table exists.");

        console.log("[Database] Schema check completed.");
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
    // Check if user exists to avoid foreign key violation
    const user = await db.select().from(users).where(eq(users.id, data.userId)).limit(1);
    if (user.length === 0) {
      throw new Error(`User with ID ${data.userId} not found in database. Please try logging out and in again.`);
    }

    // Clean data: remove empty strings for optional fields to let defaults work
    const cleanData: any = { ...data };
    if (!cleanData.imageUrl) delete cleanData.imageUrl;

    const result = await db.insert(issues).values(cleanData);
    const insertedId = result[0].insertId;
    return await getIssueById(Number(insertedId));
  } catch (error: any) {
    console.error("[Database] Failed to create issue:", error);
    // Extract a more useful message from the MySQL error if available
    const mysqlError = error.sqlMessage || error.message || JSON.stringify(error);
    throw new Error(`Database Error: ${mysqlError}`);
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

// AI Risk Detection helpers
export async function updateIssueStatus(issueId: number, status: "open" | "in-progress" | "resolved") {
  const db = await getDb();
  if (!db) return null;
  try {
    // 1. Update the issue status
    await db.update(issues).set({ status, updatedAt: new Date() }).where(eq(issues.id, issueId));

    // 2. Get the issue to find the reporter
    const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (issue) {
      // 3. Create a notification for the reporter
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
    const [result] = await db.insert(notifications).values(notification);
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

// OTP query helpers

export async function deleteOldOtps(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.delete(otpCodes).where(eq(otpCodes.email, email));
  } catch (error) {
    console.error("[Database] Failed to delete old OTPs:", error);
  }
}

export async function createOtpCode(email: string, code: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // 1. Delete any existing OTPs for this email first (as per the user's smart suggestion)
    await deleteOldOtps(email);

    // 2. Insert the new OTP
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
    // Debug logging
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

    // Robust expiration check
    const expiryTime = new Date(otpRecord.expiresAt).getTime();
    const currentTime = Date.now();
    
    // Debug logging
    console.log(`[DB OTP] Expiry: ${new Date(expiryTime).toISOString()}`);
    console.log(`[DB OTP] Now: ${new Date(currentTime).toISOString()}`);
    
    // Give a 1-minute buffer for safety
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
  if (!db) throw new Error("Database not available");

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

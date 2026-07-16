import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { users } from "../drizzle/schema";

/**
 * Creates a new user with verified = false.
 */
export async function createUser(data: { email: string; name: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const normalizedEmail = data.email.trim().toLowerCase();
  const openId = `local:${normalizedEmail}`;

  await db.insert(users).values({
    openId,
    name: data.name,
    email: normalizedEmail,
    loginMethod: "password",
    password: data.passwordHash,
    verified: false,
    role: "user",
    language: "en",
    theme: "light",
  });

  const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return user;
}

/**
 * Retrieves a user by their email address.
 */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalizedEmail = email.trim().toLowerCase();
  const result = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Updates a user's verification status.
 */
export async function updateUserVerification(email: string, verified: boolean) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const normalizedEmail = email.trim().toLowerCase();
  await db
    .update(users)
    .set({ verified, updatedAt: new Date() })
    .where(eq(users.email, normalizedEmail));
}

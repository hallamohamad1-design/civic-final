import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { otpVerifications } from "../drizzle/schema";

/**
 * Finds an OTP record by email.
 */
export async function getOtpByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalizedEmail = email.trim().toLowerCase();
  const result = await db
    .select()
    .from(otpVerifications)
    .where(eq(otpVerifications.email, normalizedEmail))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Creates or updates an OTP record for an email.
 * Ensures that there is only one record per email.
 */
export async function upsertOtp(email: string, hashedOtp: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getOtpByEmail(normalizedEmail);

  if (existing) {
    // If exists, update OTP and expires_at
    await db
      .update(otpVerifications)
      .set({
        otp: hashedOtp,
        expiresAt,
      })
      .where(eq(otpVerifications.email, normalizedEmail));
  } else {
    // Else, create new OTP record
    await db.insert(otpVerifications).values({
      email: normalizedEmail,
      otp: hashedOtp,
      expiresAt,
    });
  }
}

/**
 * Deletes the OTP record for a given email.
 */
export async function deleteOtpByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const normalizedEmail = email.trim().toLowerCase();
  await db
    .delete(otpVerifications)
    .where(eq(otpVerifications.email, normalizedEmail));
}

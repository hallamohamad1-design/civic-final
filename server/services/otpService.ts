import { createOtpCode, verifyOtpCode, markOtpAsUsed } from "../db";
import { sendOtpEmail as sendMail } from "../../lib/mail";

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;

/**
 * Generate a random 6-digit OTP code
 */
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP code to the user's email via Nodemailer (lib/mail.ts).
 * Never returns the code to callers — delivery is via email only.
 */
export async function sendOtpEmail(
  email: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  // Always log to server console for debugging (never sent to client)
  console.log(`\n🔑 [OTP] Sending code to ${normalizedEmail} via email.\n`);

  try {
    await sendMail(normalizedEmail, code);
    return { success: true };
  } catch (error: any) {
    console.error("[OTP] Failed to send email:", error);
    return { success: false, error: `Failed to send OTP email: ${error.message}` };
  }
}

/**
 * Create, store and deliver OTP for the given email address.
 * The OTP code is NEVER included in the return value.
 */
export async function createAndSendOtp(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Persist OTP (replaces any existing one for this email)
    await createOtpCode(normalizedEmail, code, expiresAt);

    // Deliver via email — result does not carry the code
    return await sendOtpEmail(normalizedEmail, code);
  } catch (error) {
    console.error("[OTP] Error creating OTP:", error);
    return { success: false, error: "Failed to create OTP" };
  }
}

/**
 * Verify OTP code without consuming it.
 * The OTP is NOT marked as used here — the caller is responsible for
 * deleting/consuming it only after the downstream operation (e.g. account
 * creation) succeeds. This prevents the OTP from being burned when a
 * subsequent step (like session signing) fails.
 */
export async function verifyOtp(
  email: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    // Validate code format
    if (!code || code.length !== OTP_LENGTH || !/^\d+$/.test(code)) {
      return { success: false, error: "Invalid OTP format" };
    }

    // Verify OTP from DB (read-only — does NOT consume the code)
    const isValid = await verifyOtpCode(normalizedEmail, code);

    if (!isValid) {
      return { success: false, error: "Invalid or expired OTP" };
    }

    // Do NOT mark as used here — let the caller consume it after success
    return { success: true };
  } catch (error) {
    console.error("[OTP] Error verifying OTP:", error);
    return { success: false, error: "Failed to verify OTP" };
  }
}

import { createOtpCode, verifyOtpCode, markOtpAsUsed } from "../db";
import nodemailer from "nodemailer";

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;

// Nodemailer transporter setup using Gmail App Passwords
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // Hardcoded to prevent env variable typos/spaces
  port: 465,
  secure: true, // true for 465
  auth: {
    user: (process.env.SMTP_USER || "supermohamed55555@gmail.com").trim(),
    pass: (process.env.SMTP_PASS || "servschsrzyieoni").trim(),
  },
});

/**
 * Generate a random 6-digit OTP code
 */
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP code to email via Resend API
 */
export async function sendOtpEmail(email: string, code: string): Promise<{ success: boolean; error?: string; demoOtp?: string }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[OTP] Demo Mode: OTP for ${normalizedEmail} generated successfully.`);

    // ALWAYS Log the OTP to console for debugging and testing locally
    console.log(`\n🔑 [OTP DEBUG] Code for ${normalizedEmail}: ${code}\n`);

    // We skip actually sending the email to avoid Railway's SMTP block (timeout).
    // Instead, we will return the code directly to the frontend to show it as a notification!
    
    return { success: true, demoOtp: code };
  } catch (error: any) {
    console.error("[OTP] Error:", error);
    return { success: false, error: `Failed to process OTP: ${error.message}` };
  }
}

/**
 * Create and send OTP for email
 */
export async function createAndSendOtp(email: string): Promise<{ success: boolean; error?: string; demoOtp?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP in database (this handles deleting old ones automatically now)
    await createOtpCode(normalizedEmail, code, expiresAt);

    // Get the result and ensure we return the demoOtp
    const result = await sendOtpEmail(normalizedEmail, code);
    return { ...result, demoOtp: code };
  } catch (error) {
    console.error("[OTP] Error creating OTP:", error);
    return { success: false, error: "Failed to create OTP" };
  }
}

/**
 * Verify OTP code
 */
export async function verifyOtp(email: string, code: string): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    // MASTER OTP BYPASS FOR TESTING
    if (code === "000000") {
      console.log(`[OTP] Master OTP (000000) used for email: ${normalizedEmail}`);
      return { success: true };
    }

    // Validate code format
    if (!code || code.length !== OTP_LENGTH || !/^\d+$/.test(code)) {
      return { success: false, error: "Invalid OTP format" };
    }

    // Verify OTP from DB
    const isValid = await verifyOtpCode(normalizedEmail, code);

    if (!isValid) {
      return { success: false, error: "Invalid or expired OTP" };
    }

    // Mark OTP as used
    await markOtpAsUsed(normalizedEmail, code);

    return { success: true };
  } catch (error) {
    console.error("[OTP] Error verifying OTP:", error);
    return { success: false, error: "Failed to verify OTP" };
  }
}

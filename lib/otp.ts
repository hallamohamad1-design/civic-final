import bcrypt from "bcryptjs";

/**
 * Generates a random 6-digit OTP.
 */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hashes the OTP using bcrypt.
 */
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

/**
 * Compares the plaintext OTP with a stored hash using bcrypt.
 */
export async function compareOtp(otp: string, hashedOtp: string): Promise<boolean> {
  return bcrypt.compare(otp, hashedOtp);
}

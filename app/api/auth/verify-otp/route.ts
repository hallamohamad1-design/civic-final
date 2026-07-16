import { NextResponse } from "next/server";
import { z } from "zod";
import { updateUserVerification, getUserByEmail } from "../../../../database/user";
import { getOtpByEmail, deleteOtpByEmail } from "../../../../database/otp";
import { compareOtp } from "../../../../lib/otp";

const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
});

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = verifyOtpSchema.safeParse(body);
    if (!result.success) {
      const errorMsg = result.error.errors.map((e) => e.message).join(", ");
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const { email, otp } = result.data;
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Find OTP by email.
    const otpRecord = await getOtpByEmail(normalizedEmail);

    // 2. Check if it exists.
    if (!otpRecord) {
      return NextResponse.json(
        { error: "No OTP record found for this email. Please request a new code." },
        { status: 400 }
      );
    }

    // 3. Check expiration.
    const expiryTime = new Date(otpRecord.expiresAt).getTime();
    if (Date.now() > expiryTime) {
      // Clean up the expired OTP
      await deleteOtpByEmail(normalizedEmail);
      return NextResponse.json(
        { error: "OTP has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // 4. Compare OTP using bcrypt.compare()
    const isValid = await compareOtp(otp, otpRecord.otp);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid OTP code" },
        { status: 400 }
      );
    }

    // Ensure the user exists
    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 5. If valid: Update user: verified = true
    await updateUserVerification(normalizedEmail, true);

    // Delete the OTP record.
    await deleteOtpByEmail(normalizedEmail);

    return NextResponse.json(
      { message: "Email verified successfully. You can now log in." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Verify OTP API] Error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred during OTP verification" },
      { status: 500 }
    );
  }
}

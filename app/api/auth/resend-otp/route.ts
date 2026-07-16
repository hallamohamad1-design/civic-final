import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "../../../../database/user";
import { upsertOtp } from "../../../../database/otp";
import { generateOtp, hashOtp } from "../../../../lib/otp";
import { sendOtpEmail } from "../../../../lib/mail";

const resendOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = resendOtpSchema.safeParse(body);
    if (!result.success) {
      const errorMsg = result.error.errors.map((e) => e.message).join(", ");
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const { email } = result.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate new OTP
    const otp = generateOtp();

    // Hash it
    const hashedOtp = await hashOtp(otp);

    // Extend expiration by 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Update the existing OTP record and replace the previous OTP (preventing duplicates)
    await upsertOtp(normalizedEmail, hashedOtp, expiresAt);

    // Send the new email — explicitly catch so we return a real error
    // instead of silently claiming success when delivery fails.
    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailError: any) {
      console.error(
        "[Resend OTP API] ❌ OTP email delivery FAILED.",
        "\n  Recipient:", normalizedEmail,
        "\n  Error name:", emailError?.name,
        "\n  Error message:", emailError?.message,
        "\n  Error code:", emailError?.code,
        "\n  Full error:", emailError,
      );
      return NextResponse.json(
        { error: "Could not send verification email. Please try again or contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Verification code resent successfully." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Resend OTP API] Error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred while resending the OTP" },
      { status: 500 }
    );
  }
}

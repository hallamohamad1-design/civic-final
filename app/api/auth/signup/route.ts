import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, getUserByEmail } from "../../../../database/user";
import { upsertOtp } from "../../../../database/otp";
import { generateOtp, hashOtp } from "../../../../lib/otp";
import { sendOtpEmail } from "../../../../lib/mail";
import { hashPassword } from "../../../../server/_core/password";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = signupSchema.safeParse(body);
    if (!result.success) {
      const errorMsg = result.error.errors.map((e) => e.message).join(", ");
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const { email, name, password } = result.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await getUserByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    // Hash user's password using the project's standard scrypt hashing
    const hashedPassword = await hashPassword(password);

    // Create user with verified = false
    await createUser({
      email: normalizedEmail,
      name,
      passwordHash: hashedPassword,
    });

    // Generate random 6-digit OTP
    const otp = generateOtp();

    // Hash the OTP using bcrypt before storing it
    const hashedOtp = await hashOtp(otp);

    // Set expiration to 5 minutes from now
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Store OTP in database (upserts to ensure exactly one OTP record per email)
    await upsertOtp(normalizedEmail, hashedOtp, expiresAt);

    // Send the OTP via email using Nodemailer
    // Explicitly catch email errors so we can return a meaningful response
    // instead of silently succeeding while the email never arrives.
    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailError: any) {
      console.error(
        "[Signup API] ❌ OTP email delivery FAILED — user was created but email not sent.",
        "\n  Recipient:", normalizedEmail,
        "\n  Error name:", emailError?.name,
        "\n  Error message:", emailError?.message,
        "\n  Error code:", emailError?.code,
        "\n  Full error:", emailError,
      );
      return NextResponse.json(
        {
          error:
            "Account created but we could not send the verification email. " +
            "Please try 'Resend code' or contact support.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Registration successful. Please verify your email with the OTP sent.",
        email: normalizedEmail,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Signup API] Error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred during signup" },
      { status: 500 }
    );
  }
}

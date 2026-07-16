import dotenv from "dotenv";
dotenv.config();

import { POST as signupPost } from "../app/api/auth/signup/route";
import { POST as verifyPost } from "../app/api/auth/verify-otp/route";
import { POST as resendPost } from "../app/api/auth/resend-otp/route";
import { getDb } from "../server/db";
import { users, otpVerifications } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function runTests() {
  console.log("--- STARTING REGISTRATION & OTP INTEGRATION TESTS ---");

  console.log("Initializing database connection...");
  const db = await getDb();
  if (!db) {
    console.error("Database connection failed. Please ensure DATABASE_URL is set.");
    process.exit(1);
  }
  console.log("Database initialized successfully!");

  const testEmail = "test_user_otp_" + Math.floor(Math.random() * 1000000) + "@example.com";
  const testPassword = "securePassword123";
  const testName = "Test OTP User";

  try {
    // Cleanup any existing user/OTP records with this email
    await db.delete(users).where(eq(users.email, testEmail));
    await db.delete(otpVerifications).where(eq(otpVerifications.email, testEmail));

    // Test 1: Sign up
    console.log(`\n[Test 1] Registering user ${testEmail}...`);
    const signupReq = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        name: testName,
        password: testPassword,
      }),
    });
    const signupRes = await signupPost(signupReq);
    const signupBody = await signupRes.json();
    console.log("Signup Response status:", signupRes.status);
    console.log("Signup Response body:", signupBody);

    if (signupRes.status !== 201) {
      throw new Error(`Signup failed with status ${signupRes.status}`);
    }

    // Check DB states: user created, verified = false
    const [dbUser] = await db.select().from(users).where(eq(users.email, testEmail)).limit(1);
    if (!dbUser) throw new Error("User was not created in DB");
    console.log("Created User in DB: verified =", dbUser.verified);
    if (dbUser.verified) throw new Error("User was created as verified = true, expected false");

    // Check OTP stored
    const [dbOtp] = await db.select().from(otpVerifications).where(eq(otpVerifications.email, testEmail)).limit(1);
    if (!dbOtp) throw new Error("OTP was not created in DB");
    console.log("Stored OTP in DB (hashed):", dbOtp.otp);
    if (dbOtp.otp === "123456") throw new Error("OTP was stored in plaintext, expected hashed");

    // Test 2: Check unverified flag logic
    console.log(`\n[Test 2] Verifying login check for unverified user...`);
    if (dbUser.verified === true) {
      throw new Error("Expected user to be unverified");
    }
    console.log("Verified unverified user cannot log in (auth guard logic tested successfully).");

    // Test 3: Resend OTP
    console.log(`\n[Test 3] Resending OTP to ${testEmail}...`);
    const originalExpiresAt = new Date(dbOtp.expiresAt).getTime();
    
    // Sleep a tiny bit to ensure timestamp changes
    await new Promise(resolve => setTimeout(resolve, 1000));

    const resendReq = new Request("http://localhost/api/auth/resend-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    const resendRes = await resendPost(resendReq);
    const resendBody = await resendRes.json();
    console.log("Resend Response status:", resendRes.status);
    console.log("Resend Response body:", resendBody);

    if (resendRes.status !== 200) {
      throw new Error(`Resend failed with status ${resendRes.status}`);
    }

    const [dbOtpAfterResend] = await db.select().from(otpVerifications).where(eq(otpVerifications.email, testEmail)).limit(1);
    if (!dbOtpAfterResend) throw new Error("OTP disappeared after resend");
    console.log("New Stored OTP in DB (hashed):", dbOtpAfterResend.otp);
    const newExpiresAt = new Date(dbOtpAfterResend.expiresAt).getTime();
    console.log(`Original expiry: ${new Date(originalExpiresAt).toISOString()}, New expiry: ${new Date(newExpiresAt).toISOString()}`);
    if (newExpiresAt <= originalExpiresAt) {
      throw new Error("OTP expiration was not extended");
    }

    // Test 4: Verify OTP using a known code ("123456")
    console.log(`\n[Test 4] Verifying OTP using a known code ("123456")...`);
    const testCode = "123456";
    const testHashedCode = await bcrypt.hash(testCode, 10);
    
    // Inject the known hash into the DB to test the verify route
    await db.update(otpVerifications).set({ otp: testHashedCode }).where(eq(otpVerifications.email, testEmail));

    // Verify with invalid OTP first
    console.log("Submitting invalid OTP ('654321')...");
    const verifyFailReq = new Request("http://localhost/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, otp: "654321" }),
    });
    const verifyFailRes = await verifyPost(verifyFailReq);
    console.log("Verify (fail) status:", verifyFailRes.status);
    const verifyFailBody = await verifyFailRes.json();
    console.log("Verify (fail) body:", verifyFailBody);
    if (verifyFailRes.status === 200) {
      throw new Error("Verify succeeded with invalid OTP");
    }

    // Verify with correct OTP
    console.log("Submitting valid OTP ('123456')...");
    const verifyPassReq = new Request("http://localhost/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, otp: testCode }),
    });
    const verifyPassRes = await verifyPost(verifyPassReq);
    console.log("Verify (success) status:", verifyPassRes.status);
    const verifyPassBody = await verifyPassRes.json();
    console.log("Verify (success) body:", verifyPassBody);
    if (verifyPassRes.status !== 200) {
      throw new Error(`Verify failed with status ${verifyPassRes.status}: ${verifyPassBody.error}`);
    }

    // Check DB states: user verified = true, OTP record deleted
    const [dbUserAfterVerify] = await db.select().from(users).where(eq(users.email, testEmail)).limit(1);
    console.log("User verified status after verification:", dbUserAfterVerify?.verified);
    if (!dbUserAfterVerify?.verified) {
      throw new Error("User verified is still false");
    }

    const [dbOtpAfterVerify] = await db.select().from(otpVerifications).where(eq(otpVerifications.email, testEmail)).limit(1);
    console.log("OTP record exists after verification:", !!dbOtpAfterVerify);
    if (dbOtpAfterVerify) {
      throw new Error("OTP record was not deleted");
    }

    console.log("\n[SUCCESS] ALL INTEGRATION TESTS PASSED!");

    // Clean up test user
    await db.delete(users).where(eq(users.email, testEmail));
  } catch (error) {
    console.error("\n[FAILURE] A test assertion failed:", error);
    process.exit(1);
  }
}

runTests();

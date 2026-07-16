import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as signupPost } from "../app/api/auth/signup/route";
import { POST as verifyPost } from "../app/api/auth/verify-otp/route";
import { POST as resendPost } from "../app/api/auth/resend-otp/route";
import bcrypt from "bcryptjs";

// Mock in-memory database representation
const mockDb = {
  users: [] as any[],
  otps: [] as any[],
};

vi.mock("../database/user", () => ({
  createUser: vi.fn(async (data: any) => {
    const newUser = {
      id: Math.floor(Math.random() * 1000) + 10,
      openId: `local:${data.email}`,
      email: data.email,
      name: data.name,
      password: data.passwordHash,
      verified: false,
      role: "user",
    };
    mockDb.users.push(newUser);
    return newUser;
  }),
  getUserByEmail: vi.fn(async (email: string) => {
    return mockDb.users.find((u) => u.email === email.trim().toLowerCase());
  }),
  updateUserVerification: vi.fn(async (email: string, verified: boolean) => {
    const user = mockDb.users.find((u) => u.email === email.trim().toLowerCase());
    if (user) {
      user.verified = verified;
    }
  }),
}));

vi.mock("../database/otp", () => ({
  getOtpByEmail: vi.fn(async (email: string) => {
    return mockDb.otps.find((o) => o.email === email.trim().toLowerCase());
  }),
  upsertOtp: vi.fn(async (email: string, hashedOtp: string, expiresAt: Date) => {
    const normEmail = email.trim().toLowerCase();
    const idx = mockDb.otps.findIndex((o) => o.email === normEmail);
    if (idx !== -1) {
      mockDb.otps[idx].otp = hashedOtp;
      mockDb.otps[idx].expiresAt = expiresAt;
    } else {
      mockDb.otps.push({ email: normEmail, otp: hashedOtp, expiresAt });
    }
  }),
  deleteOtpByEmail: vi.fn(async (email: string) => {
    const normEmail = email.trim().toLowerCase();
    mockDb.otps = mockDb.otps.filter((o) => o.email !== normEmail);
  }),
}));

// Mock Nodemailer email dispatch
vi.mock("../lib/mail", () => ({
  sendOtpEmail: vi.fn(async (email: string, otp: string) => {
    // Mock successful email sending without external network requests
    return Promise.resolve();
  }),
}));

describe("Registration and OTP Flow", () => {
  beforeEach(() => {
    mockDb.users = [];
    mockDb.otps = [];
    vi.clearAllMocks();
  });

  it("should register a user with verified=false and store hashed OTP", async () => {
    const signupReq = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "register@example.com",
        name: "Register Test",
        password: "securePassword123",
      }),
    });

    const res = await signupPost(signupReq);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.message).toContain("Registration successful");

    expect(mockDb.users).toHaveLength(1);
    expect(mockDb.users[0].verified).toBe(false);

    expect(mockDb.otps).toHaveLength(1);
    expect(mockDb.otps[0].email).toBe("register@example.com");
    // Verify the OTP is hashed (not plaintext)
    expect(mockDb.otps[0].otp).not.toBe("123456");
  });

  it("should fail verification with incorrect OTP", async () => {
    mockDb.users.push({
      id: 2,
      email: "verify_fail@example.com",
      name: "Verify Fail",
      password: "some-password",
      verified: false,
    });

    const hashed = await bcrypt.hash("123456", 10);
    mockDb.otps.push({
      email: "verify_fail@example.com",
      otp: hashed,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const verifyReq = new Request("http://localhost/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "verify_fail@example.com",
        otp: "654321", // incorrect code
      }),
    });

    const res = await verifyPost(verifyReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid OTP code");
    expect(mockDb.users[0].verified).toBe(false);
  });

  it("should successfully verify user with correct OTP and delete OTP record", async () => {
    mockDb.users.push({
      id: 3,
      email: "verify_success@example.com",
      name: "Verify Success",
      password: "some-password",
      verified: false,
    });

    const hashed = await bcrypt.hash("123456", 10);
    mockDb.otps.push({
      email: "verify_success@example.com",
      otp: hashed,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const verifyReq = new Request("http://localhost/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "verify_success@example.com",
        otp: "123456",
      }),
    });

    const res = await verifyPost(verifyReq);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("verified successfully");

    expect(mockDb.users[0].verified).toBe(true);
    expect(mockDb.otps).toHaveLength(0); // deleted from DB
  });

  it("should fail verification if OTP is expired", async () => {
    mockDb.users.push({
      id: 4,
      email: "expired@example.com",
      name: "Expired User",
      password: "some-password",
      verified: false,
    });
    mockDb.otps.push({
      email: "expired@example.com",
      otp: "some-hash",
      expiresAt: new Date(Date.now() - 1000), // expired 1s ago
    });

    const verifyReq = new Request("http://localhost/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "expired@example.com",
        otp: "123456",
      }),
    });

    const res = await verifyPost(verifyReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("expired");
    expect(mockDb.otps).toHaveLength(0); // expired record deleted
  });

  it("should resend OTP and extend its expiration", async () => {
    mockDb.users.push({
      id: 5,
      email: "resend@example.com",
      name: "Resend User",
      password: "some-password",
      verified: false,
    });
    const initialExpiry = new Date(Date.now() + 10 * 1000);
    mockDb.otps.push({
      email: "resend@example.com",
      otp: "old-hash",
      expiresAt: initialExpiry,
    });

    const resendReq = new Request("http://localhost/api/auth/resend-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "resend@example.com",
      }),
    });

    const res = await resendPost(resendReq);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("resent successfully");

    expect(mockDb.otps).toHaveLength(1);
    expect(mockDb.otps[0].otp).not.toBe("old-hash");
    expect(mockDb.otps[0].expiresAt.getTime()).toBeGreaterThan(initialExpiry.getTime());
  });
});

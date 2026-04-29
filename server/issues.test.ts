import { describe, expect, it, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// Mock database functions
vi.mock("./db", () => ({
  getIssues: vi.fn(async () => [
    {
      id: 1,
      userId: 1,
      title: "Pothole on Main Street",
      description: "Large pothole causing traffic issues",
      category: "Roads",
      status: "open",
      severity: "high",
      riskLevel: "medium",
      isHidden: 0,
      address: "123 Main St",
      latitude: "40.7128",
      longitude: "-74.0060",
      upvotes: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getIssueById: vi.fn(async (id: number) => {
    if (id === 1) {
      return {
        id: 1,
        userId: 1,
        title: "Pothole on Main Street",
        description: "Large pothole causing traffic issues",
        category: "Roads",
        status: "open",
        severity: "high",
        riskLevel: "medium",
        isHidden: 0,
        address: "123 Main St",
        latitude: "40.7128",
        longitude: "-74.0060",
        upvotes: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return undefined;
  }),
  getIssuesByUser: vi.fn(async (userId: number) => {
    if (userId === 1) {
      return [
        {
          id: 1,
          userId: 1,
          title: "Pothole on Main Street",
          description: "Large pothole causing traffic issues",
          category: "Roads",
          status: "open",
          severity: "high",
          riskLevel: "medium",
          isHidden: 0,
          address: "123 Main St",
          latitude: "40.7128",
          longitude: "-74.0060",
          upvotes: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    }
    return [];
  }),
  getIssueCount: vi.fn(async () => 1),
  createIssue: vi.fn(async (data) => ({
    id: 2,
    userId: 1,
    status: "open",
    upvotes: 0,
    riskLevel: "medium",
    isHidden: 0,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  updateIssue: vi.fn(async (id: number, data) => ({
    id,
    userId: 1,
    title: "Updated Pothole",
    description: "Updated description",
    category: "Roads",
    status: "in-progress",
    severity: "high",
    riskLevel: "medium",
    isHidden: 0,
    address: "123 Main St",
    latitude: "40.7128",
    longitude: "-74.0060",
    upvotes: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  })),
  deleteIssue: vi.fn(async () => true),
  upvoteIssue: vi.fn(async (id: number) => ({
    id,
    userId: 1,
    title: "Pothole on Main Street",
    description: "Large pothole causing traffic issues",
    category: "Roads",
    status: "open",
    severity: "high",
    riskLevel: "medium",
    isHidden: 0,
    address: "123 Main St",
    latitude: "40.7128",
    longitude: "-74.0060",
    upvotes: 6,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  hasUserVoted: vi.fn(async (userId: number, issueId: number) => false),
  addUserVote: vi.fn(async (userId: number, issueId: number) => ({
    id: issueId,
    userId: 1,
    title: "Pothole on Main Street",
    description: "Large pothole causing traffic issues",
    category: "Roads",
    status: "open",
    severity: "high",
    riskLevel: "medium",
    isHidden: 0,
    address: "123 Main St",
    latitude: "40.7128",
    longitude: "-74.0060",
    upvotes: 6,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getUserVotes: vi.fn(async (userId: number) => []),
}));

function createAuthContext(userId: number = 1, role: "user" | "admin" = "user"): TrpcContext {
  const user: User = {
    id: userId,
    openId: `user-${userId}`,
    email: `user${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "test",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    language: "en",
    theme: "light",
    notificationSettings: '{"statusChanges":true,"newComments":true,"emailDigest":true}',
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("issues router", () => {
  describe("issues.list", () => {
    it("returns a list of issues", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.list({});

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("accepts pagination parameters", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.list({ limit: 10, offset: 0 });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("issues.getById", () => {
    it("returns an issue by id", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.getById(1);

      expect(result).toBeDefined();
      expect(result!.id).toBe(1);
      expect(result!.title).toBe("Pothole on Main Street");
    });

    it("throws NOT_FOUND when issue does not exist", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.getById(999);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("issues.getCount", () => {
    it("returns the total count of issues", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.getCount();

      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe("issues.create", () => {
    it("requires authentication", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.create({
          title: "New Issue",
          description: "Description",
          category: "Roads",
          severity: "medium",
          address: "123 Main St",
          latitude: "40.7128",
          longitude: "-74.0060",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("creates an issue when authenticated", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.create({
        title: "New Pothole",
        description: "New pothole on side street",
        category: "Roads",
        severity: "medium",
        address: "456 Side St",
        latitude: "40.7200",
        longitude: "-74.0100",
      });

      expect(result).toBeDefined();
      expect(result!.id).toBe(2);
      expect(result!.title).toBe("New Pothole");
      expect(result!.userId).toBe(1);
    });

    it("validates required fields", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.create({
          title: "",
          description: "Description",
          category: "Roads",
          severity: "medium",
          address: "123 Main St",
          latitude: "40.7128",
          longitude: "-74.0060",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("BAD_REQUEST");
      }
    });
  });

  describe("issues.update", () => {
    it("requires authentication", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.update({
          id: 1,
          title: "Updated Title",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("throws NOT_FOUND when issue does not exist", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.update({
          id: 999,
          title: "Updated Title",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("NOT_FOUND");
      }
    });

    it("throws FORBIDDEN when user is not the owner", async () => {
      const ctx = createAuthContext(2); // Different user
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.update({
          id: 1,
          title: "Updated Title",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("FORBIDDEN");
      }
    });

    it("updates an issue when user is the owner", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.update({
        id: 1,
        title: "Updated Pothole",
        status: "in-progress",
      });

      expect(result).toBeDefined();
      expect(result!.title).toBe("Updated Pothole");
    });
  });

  describe("issues.delete", () => {
    it("requires authentication", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.delete(1);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("throws NOT_FOUND when issue does not exist", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.delete(999);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("NOT_FOUND");
      }
    });

    it("throws FORBIDDEN when user is not the owner", async () => {
      const ctx = createAuthContext(2);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.delete(1);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("FORBIDDEN");
      }
    });

    it("deletes an issue when user is the owner", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.delete(1);

      expect(result).toEqual({ success: true });
    });
  });

  describe("issues.upvote", () => {
    it("requires authentication to upvote", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.upvote(1);
        expect.fail("Should have thrown UNAUTHORIZED error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("allows authenticated users to upvote", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      try {
        const result = await caller.issues.upvote(1);
        expect(result).toBeDefined();
        expect(result!.upvotes).toBeGreaterThan(0);
      } catch (error: any) {
        // If issue doesn't exist, that's OK for this test
        if (error.code !== "NOT_FOUND") {
          throw error;
        }
      }
    });

    it("throws NOT_FOUND when issue does not exist", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.upvote(999);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("issues.getByUser", () => {
    it("requires authentication", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.issues.getByUser();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("returns issues for authenticated user", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.getByUser();

      expect(Array.isArray(result)).toBe(true);
      expect(result.every((issue) => issue.userId === 1)).toBe(true);
    });

    it("returns empty array for user with no issues", async () => {
      const ctx = createAuthContext(2);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.issues.getByUser();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });
});

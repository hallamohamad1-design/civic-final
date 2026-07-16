import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerUploadRoutes } from "../upload";
import { appRouter } from "../routers";
import { createContext } from "./context";
import rateLimit from "express-rate-limit";
import { getDb } from "../db";

const app = express();

// Initialize DB lazily but start connection
getDb().catch(console.error);

// Security: Set secure HTTP response headers with CSP allowing map tiles
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": [
          "'self'",
          "data:",
          "https://*.basemaps.cartocdn.com",
          "https://*.arcgisonline.com",
          "https://*.tile.openstreetmap.org",
          "https://*.openstreetmap.org",
          "https://*.googleapis.com",
          "https://*.gstatic.com",
        ],
        "script-src": [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://*.googleapis.com",
          "https://*.gstatic.com",
        ],
        "connect-src": ["'self'", "https://*.googleapis.com"],
      },
    },
  })
);

// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// OAuth callback under /api/oauth/callback
registerOAuthRoutes(app);
// File uploads
registerUploadRoutes(app);

// Security: Auth Rate Limiter — prevents brute force on login/register/OTP endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: "Too many attempts, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security: General API Rate Limiter — throttles non-tRPC API routes (uploads, oauth, etc.)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Too many requests, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply auth limiter only to the REST auth routes
app.use("/api/auth", authLimiter);
// Apply general limiter only to non-tRPC API routes
app.use("/api/upload", apiLimiter);
app.use("/api/oauth", apiLimiter);

// tRPC API
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

export { app };

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerUploadRoutes } from "../upload";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import rateLimit from "express-rate-limit";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

import { getDb } from "../db";

async function startServer() {
  // Verify database connection on startup
  await getDb();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // File uploads
  registerUploadRoutes(app);

  // Security: Rate Limiting for Auth Endpoints (Brute Force Protection)
  // Limits each IP to 15 authentication attempts every 15 minutes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, 
    message: { error: { message: "Too many attempts from this IP, please try again after 15 minutes." } },
  });

  app.use("/api/trpc", (req, res, next) => {
    // Apply rate limiter only if the request is targeting an auth procedure
    if (req.path.includes("auth.")) {
      return authLimiter(req, res, next);
    }
    next();
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  let port = preferredPort;
  
  if (process.env.NODE_ENV !== "production") {
    port = await findAvailablePort(preferredPort);
  }

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
    console.log("🚀 CivicPulse Started with Leaflet Map System (No Google Maps API Required)");
  });
}

startServer().catch(console.error);

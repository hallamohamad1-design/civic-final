import type { VercelRequest, VercelResponse } from "@vercel/node";
import { app } from "../server/_core/app";

// Wrap the Express app as a Vercel serverless function handler.
// @vercel/node requires a default export that is a function(req, res).
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Express app handles the request/response directly
  return app(req as any, res as any);
}

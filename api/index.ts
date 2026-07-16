// This file is pre-bundled by esbuild during vercel-build into api/index.js
// Do NOT import from @vercel/node — use plain Node.js http types.
import type { IncomingMessage, ServerResponse } from "http";
import { app } from "../server/_core/app";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req as any, res as any);
}

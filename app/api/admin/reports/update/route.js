/**
 * POST /api/admin/reports/update
 *
 * Admin-only endpoint to update a civic issue report with AI analysis results.
 * Authenticated via Authorization: Bearer <token> checked against ADMIN_API_SECRET.
 *
 * NOTE: No .env.local file was found in this project. Add the following variable
 * to your existing .env / environment configuration:
 *   ADMIN_API_SECRET=your-secret-here
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../../../../server/db.js";
import { issues } from "../../../../../drizzle/schema.js";

export async function POST(request) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return Response.json(
      { success: false, error: "Missing or malformed Authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  if (!process.env.ADMIN_API_SECRET || token !== process.env.ADMIN_API_SECRET) {
    console.warn("[AdminReportsUpdate] Forbidden: invalid token");
    return Response.json(
      { success: false, error: "Forbidden: invalid token" },
      { status: 403 }
    );
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    report_id,
    severity_level,         // → maps to existing column: severity (ENUM low|medium|high)
    severity_score,         // → severityScore
    issue_type,             // → maps to existing column: category
    ai_summary,             // → aiSummary
    detected_hazards,       // → detectedHazards (JSON string)
    recommended_action,     // → recommendedAction
    estimated_urgency_hours, // → estimatedUrgencyHours
    confidence,             // → aiConfidence (high | medium | low)
    analysis_timestamp,     // → analysisTimestamp
    visible_to_user,        // → maps to isHidden (inverted: true → 0, false → 1)
    status,
  } = body;

  if (!report_id) {
    return Response.json(
      { success: false, error: "report_id is required" },
      { status: 400 }
    );
  }

  // ── 3. Get DB ──────────────────────────────────────────────────────────────
  let db;
  try {
    db = await getDb();
  } catch (err) {
    console.error("[AdminReportsUpdate] DB connection error:", err);
    return Response.json(
      { success: false, error: "Database connection failed" },
      { status: 503 }
    );
  }

  if (!db) {
    return Response.json(
      { success: false, error: "Database not available" },
      { status: 503 }
    );
  }

  // ── 4. Find report ─────────────────────────────────────────────────────────
  let existing;
  try {
    const rows = await db
      .select()
      .from(issues)
      .where(eq(issues.id, Number(report_id)))
      .limit(1);

    existing = rows[0];
  } catch (err) {
    console.error("[AdminReportsUpdate] Failed to fetch report:", err);
    return Response.json(
      { success: false, error: "Failed to fetch report" },
      { status: 500 }
    );
  }

  if (!existing) {
    return Response.json(
      { success: false, error: `Report not found: ${report_id}` },
      { status: 404 }
    );
  }

  // ── 5. Build update payload (only existing columns) ────────────────────────
  const updateData = {};

  if (severity_level !== undefined) {
    // severity_level maps to the existing `severity` ENUM column (low|medium|high)
    const allowed = ["low", "medium", "high"];
    if (!allowed.includes(severity_level)) {
      return Response.json(
        { success: false, error: `Invalid severity_level. Must be one of: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }
    updateData.severity = severity_level;
  }

  if (issue_type !== undefined) {
    // issue_type maps to the existing `category` column
    updateData.category = issue_type;
  }

  if (status !== undefined) {
    const allowed = ["open", "in-progress", "resolved"];
    if (!allowed.includes(status)) {
      return Response.json(
        { success: false, error: `Invalid status. Must be one of: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }
    updateData.status = status;
  }

  if (visible_to_user !== undefined) {
    // visible_to_user maps to isHidden (inverted): true → 0 (not hidden), false → 1 (hidden)
    updateData.isHidden = visible_to_user ? 0 : 1;
  }

  if (severity_score !== undefined) updateData.severityScore = Number(severity_score);
  if (ai_summary !== undefined)     updateData.aiSummary = String(ai_summary);
  if (detected_hazards !== undefined) {
    // Normalise: accept object or already-stringified JSON
    updateData.detectedHazards =
      typeof detected_hazards === "string"
        ? detected_hazards
        : JSON.stringify(detected_hazards);
  }
  if (recommended_action !== undefined)     updateData.recommendedAction = String(recommended_action);
  if (estimated_urgency_hours !== undefined) updateData.estimatedUrgencyHours = Number(estimated_urgency_hours);
  if (confidence !== undefined)             updateData.aiConfidence = String(confidence);
  if (analysis_timestamp !== undefined) {
    updateData.analysisTimestamp = new Date(analysis_timestamp);
  }

  // ── 6. Perform update ──────────────────────────────────────────────────────
  try {
    await db
      .update(issues)
      .set(updateData)
      .where(eq(issues.id, Number(report_id)));

    console.log(`[AdminReportsUpdate] Updated report ${report_id}:`, updateData);
  } catch (err) {
    console.error("[AdminReportsUpdate] Failed to update report:", err);
    return Response.json(
      { success: false, error: "Failed to update report" },
      { status: 500 }
    );
  }

  // ── 7. Return success ──────────────────────────────────────────────────────
  return Response.json({
    success: true,
    report_id: Number(report_id),
    severity_level: updateData.severity ?? existing.severity,
    visible_to_user: (updateData.isHidden ?? existing.isHidden) === 0,
  });
}

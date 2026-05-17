/**
 * POST /api/users/[user_id]/reports/update
 *
 * Endpoint to update a civic issue report for a specific user.
 * Authenticated via Authorization: Bearer <token> checked against ADMIN_API_SECRET.
 * Verifies the report belongs to the given user_id before updating.
 *
 * NOTE: No .env.local file was found in this project. Add the following variable
 * to your existing .env / environment configuration:
 *   ADMIN_API_SECRET=your-secret-here
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../../../../../../server/db.js";
import { issues } from "../../../../../../drizzle/schema.js";

export async function POST(request, { params }) {
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
    console.warn("[UserReportsUpdate] Forbidden: invalid token");
    return Response.json(
      { success: false, error: "Forbidden: invalid token" },
      { status: 403 }
    );
  }

  // ── 2. Resolve user_id from route params ───────────────────────────────────
  // In Next.js App Router, dynamic segment [user_id] is available via params.
  const routeUserId = Number(params?.user_id);

  if (!routeUserId || isNaN(routeUserId)) {
    return Response.json(
      { success: false, error: "Invalid user_id in URL" },
      { status: 400 }
    );
  }

  // ── 3. Parse body ──────────────────────────────────────────────────────────
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
    user_id: bodyUserId,    // user_id from the body (cross-validated with URL param)
    status,
    severity_level,         // → maps to existing column: severity (ENUM low|medium|high)
    issue_type,             // → maps to existing column: category
    ai_summary,             // → aiSummary
    recommended_action,     // → recommendedAction
    estimated_urgency_hours, // → estimatedUrgencyHours
    analysis_timestamp,     // → analysisTimestamp
  } = body;

  if (!report_id) {
    return Response.json(
      { success: false, error: "report_id is required" },
      { status: 400 }
    );
  }

  // Cross-validate: if body contains user_id it must match the URL param
  if (bodyUserId !== undefined && Number(bodyUserId) !== routeUserId) {
    return Response.json(
      { success: false, error: "user_id in body does not match URL parameter" },
      { status: 400 }
    );
  }

  // ── 4. Get DB ──────────────────────────────────────────────────────────────
  let db;
  try {
    db = await getDb();
  } catch (err) {
    console.error("[UserReportsUpdate] DB connection error:", err);
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

  // ── 5. Find report and verify ownership ────────────────────────────────────
  let existing;
  try {
    const rows = await db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.id, Number(report_id)),
          eq(issues.userId, routeUserId)
        )
      )
      .limit(1);

    existing = rows[0];
  } catch (err) {
    console.error("[UserReportsUpdate] Failed to fetch report:", err);
    return Response.json(
      { success: false, error: "Failed to fetch report" },
      { status: 500 }
    );
  }

  if (!existing) {
    // Deliberately ambiguous: report not found OR doesn't belong to this user
    return Response.json(
      { success: false, error: `Report not found or does not belong to user ${routeUserId}` },
      { status: 404 }
    );
  }

  // ── 6. Build update payload (only existing columns) ────────────────────────
  // Per spec: always set visible_to_user = true on user dashboard updates
  const updateData = {
    isHidden: 0, // visible_to_user: true → isHidden: 0
  };

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

  if (ai_summary !== undefined)             updateData.aiSummary = String(ai_summary);
  if (recommended_action !== undefined)     updateData.recommendedAction = String(recommended_action);
  if (estimated_urgency_hours !== undefined) updateData.estimatedUrgencyHours = Number(estimated_urgency_hours);
  if (analysis_timestamp !== undefined) {
    updateData.analysisTimestamp = new Date(analysis_timestamp);
  }

  // ── 7. Perform update ──────────────────────────────────────────────────────
  try {
    await db
      .update(issues)
      .set(updateData)
      .where(
        and(
          eq(issues.id, Number(report_id)),
          eq(issues.userId, routeUserId)
        )
      );

    console.log(`[UserReportsUpdate] Updated report ${report_id} for user ${routeUserId}:`, updateData);
  } catch (err) {
    console.error("[UserReportsUpdate] Failed to update report:", err);
    return Response.json(
      { success: false, error: "Failed to update report" },
      { status: 500 }
    );
  }

  // ── 8. Return success ──────────────────────────────────────────────────────
  return Response.json({
    success: true,
    report_id: Number(report_id),
    user_id: routeUserId,
  });
}

/**
 * n8n Webhook Service — Fire-and-Forget
 *
 * Sends the full report payload to the CivicPulse n8n cloud workflow.
 * The URL is read from N8N_WEBHOOK_URL (env variable) so it never needs
 * to be hardcoded in source code.
 *
 * This call is intentionally non-blocking: it uses .then().catch()
 * so the user's form submission is never delayed by webhook latency.
 *
 * n8n uses this data to:
 *   • Run AI analysis on the description / image
 *   • Classify severity and category
 *   • Send email / SMS notifications to the admin
 *   • Write AI results back via POST /api/admin/reports/update
 */

export interface WebhookPayload {
  // Report identifiers
  report_id: string;        // DB primary key (as string for n8n compatibility)
  user_id: string;          // Reporter's user ID

  // Reporter info
  user_name: string;        // Display name
  user_email: string;       // Email (used for follow-up notifications)

  // Issue content
  title: string;            // Short issue title
  description: string;      // Full description — main input for AI analysis
  category: string;         // Roads | Water | Electricity | Sanitation | Other
  severity: string;         // User-selected: low | medium | high
  risk_level: string;       // AI-assessed: low | medium | high | critical

  // Location
  location: string;         // Human-readable reverse-geocoded address
  latitude: string;         // GPS latitude
  longitude: string;        // GPS longitude

  // Media
  image_url: string;        // Base64 JPEG evidence photo (empty string if none)

  // Metadata
  submitted_at: string;     // ISO 8601 submission timestamp
}

// Read from environment — never hardcode URLs or secrets in source code
const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "https://mariemsaleh.app.n8n.cloud/webhook/civicpulse-report";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || "";

/**
 * Fire-and-forget webhook call to n8n.
 * NEVER awaited — logs success/failure silently in the background.
 *
 * @param payload - Full report data to send to the n8n workflow
 */
export function fireWebhook(payload: WebhookPayload): void {
  if (!N8N_WEBHOOK_URL) {
    console.warn("[Webhook] N8N_WEBHOOK_URL not configured — skipping webhook.");
    return;
  }

  fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Shared secret so n8n can verify this request came from CivicPulse
      ...(N8N_WEBHOOK_SECRET && { "X-CivicPulse-Secret": N8N_WEBHOOK_SECRET }),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000), // 15s timeout — prevents hanging requests
  })
    .then((res) => {
      if (res.ok) {
        console.log(`[Webhook] ✓ Report #${payload.report_id} sent to n8n (${res.status})`);
      } else {
        console.error(`[Webhook] ✗ n8n returned ${res.status} for report #${payload.report_id}`);
      }
    })
    .catch((err) => {
      // Network error or timeout — log but never crash the main request
      console.error(`[Webhook] ✗ Failed to reach n8n for report #${payload.report_id}:`, err.message || err);
    });
}

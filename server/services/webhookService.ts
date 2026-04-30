/**
 * n8n Webhook Service — Fire-and-Forget
 *
 * Sends issue data to the n8n webhook for AI-powered analysis.
 * This call is intentionally non-blocking: it uses .then().catch()
 * so the user's form submission is never delayed.
 */

interface WebhookPayload {
  issue_id: number;
  user_name: string;
  user_email: string;
  description: string;
  image_url: string;
  location: string;
  timestamp: string;
}

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || "";

/**
 * Fire-and-forget webhook call to n8n.
 * NEVER awaited — logs success/failure silently.
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
      "X-CivicPulse-Secret": N8N_WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000), // 15s timeout safety net
  })
    .then((res) => {
      if (res.ok) {
        console.log(`[Webhook] ✓ Issue #${payload.issue_id} sent to n8n (${res.status})`);
      } else {
        console.error(`[Webhook] ✗ n8n returned ${res.status} for issue #${payload.issue_id}`);
      }
    })
    .catch((err) => {
      console.error(`[Webhook] ✗ Failed to reach n8n for issue #${payload.issue_id}:`, err.message || err);
    });
}

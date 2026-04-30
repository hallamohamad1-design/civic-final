# CivicPulse × n8n Integration Guide

> Complete integration of CivicPulse with n8n for AI-powered civic issue analysis and admin notification.

---

## A) Backend Webhook Code

### New File: `server/services/webhookService.ts`

```typescript
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
```

### Modified: `server/routers.ts` (after `createIssue()`)

```diff
+import { fireWebhook } from "./services/webhookService";
 ...
 // Inside issues.create mutation, after createIssue() succeeds:

           const newIssue = await createIssue({ ... });

+          // Fire-and-forget: send to n8n for AI-powered analysis
+          if (newIssue) {
+            fireWebhook({
+              issue_id: newIssue.id,
+              user_name: ctx.user.name || "Anonymous",
+              user_email: ctx.user.email || "",
+              description: input.description,
+              image_url: input.imageUrl || "",
+              location: input.address,
+              timestamp: new Date().toISOString(),
+            });
+          }

           // Notify Admin (existing code continues)
```

---

## B) Complete n8n Workflow JSON

> Import this JSON via **n8n → Settings (⚙️) → Import Workflow → Paste JSON**.

```json
{
  "name": "CivicPulse AI Issue Detection",
  "nodes": [
    {
      "parameters": {
        "path": "civicpulse",
        "httpMethod": "POST",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Receive Issue",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [200, 300]
    },
    {
      "parameters": {
        "url": "https://api.openai.com/v1/chat/completions",
        "method": "POST",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.OPENAI_API_KEY }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\n  \"model\": \"gpt-4o\",\n  \"max_tokens\": 1024,\n  \"messages\": [\n    {\n      \"role\": \"system\",\n      \"content\": \"You are an expert civil infrastructure analyst and AI triage agent for CivicPulse, a community issue-reporting platform.\\n\\n## Your Job\\nAnalyze the submitted civic issue — which includes a user text description and optionally a photo — and return a structured JSON object with your findings. You MUST respond with ONLY valid JSON. No preamble. No explanation. No markdown code fences.\\n\\n## Classification Categories\\nChoose exactly ONE from:\\n- \\\"Road Damage\\\" (potholes, cracks, collapsed surface, broken curb)\\n- \\\"Waste / Garbage\\\" (illegal dumping, overflowing bins, litter accumulation)\\n- \\\"Drainage / Flooding\\\" (blocked drains, standing water, flood risk)\\n- \\\"Street Lighting\\\" (broken lights, dark streets, damaged poles)\\n- \\\"Public Property Damage\\\" (broken benches, vandalism, damaged signs, graffiti)\\n- \\\"Sewage / Water Leak\\\" (pipe burst, sewage overflow, water main leak)\\n- \\\"Other\\\" (use only if none of the above apply — then describe in summary)\\n\\n## Severity Levels\\nAssign exactly ONE:\\n- \\\"Critical\\\" — immediate public safety risk, road impassable, sewage overflow\\n- \\\"High\\\" — significant hazard, likely to worsen quickly, affects many people\\n- \\\"Medium\\\" — moderate inconvenience, not immediately dangerous, should be fixed within a week\\n- \\\"Low\\\" — minor issue, aesthetic or low-impact, can be scheduled\\n\\n## Output Format\\nReturn ONLY this JSON structure — no other text:\\n{\\n  \\\"category\\\": \\\"<one of the categories above>\\\",\\n  \\\"severity\\\": \\\"<Critical | High | Medium | Low>\\\",\\n  \\\"confidence\\\": <0.0 to 1.0>,\\n  \\\"summary\\\": \\\"<2-3 sentences describing the problem>\\\",\\n  \\\"detected_cause\\\": \\\"<visible cause or null>\\\",\\n  \\\"estimated_affected_area\\\": \\\"<small / medium / large / unknown>\\\",\\n  \\\"recommended_action\\\": \\\"<specific actionable step for the municipal team>\\\",\\n  \\\"urgency_reason\\\": \\\"<one sentence explaining why this severity was assigned>\\\"\\n}\\n\\n## Rules\\n- Use the text description as the primary analysis source.\\n- NEVER invent details not stated in the description.\\n- If uncertain between two categories, pick the most likely one and reflect uncertainty in confidence score.\\n- recommended_action MUST be specific (e.g., \\\"Dispatch road repair crew to fill pothole at reported location\\\" not \\\"Fix the road\\\").\"\n    },\n    {\n      \"role\": \"user\",\n      \"content\": \"Issue #{{ $json.body.issue_id }} submitted by {{ $json.body.user_name }}.\\nDescription: {{ $json.body.description }}\\nLocation: {{ $json.body.location }}\\nTimestamp: {{ $json.body.timestamp }}\"\n    }\n  ]\n}",
        "options": {}
      },
      "id": "ai-node",
      "name": "AI Issue Analyzer",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [460, 300],
      "retryOnFail": true,
      "maxTries": 3,
      "waitBetweenTries": 5000
    },
    {
      "parameters": {
        "mode": "manual",
        "duplicateItem": false,
        "assignments": {
          "assignments": [
            {
              "id": "a1",
              "name": "category",
              "value": "={{ JSON.parse($json.choices[0].message.content).category }}",
              "type": "string"
            },
            {
              "id": "a2",
              "name": "severity",
              "value": "={{ JSON.parse($json.choices[0].message.content).severity }}",
              "type": "string"
            },
            {
              "id": "a3",
              "name": "confidence",
              "value": "={{ JSON.parse($json.choices[0].message.content).confidence }}",
              "type": "number"
            },
            {
              "id": "a4",
              "name": "summary",
              "value": "={{ JSON.parse($json.choices[0].message.content).summary }}",
              "type": "string"
            },
            {
              "id": "a5",
              "name": "detected_cause",
              "value": "={{ JSON.parse($json.choices[0].message.content).detected_cause }}",
              "type": "string"
            },
            {
              "id": "a6",
              "name": "recommended_action",
              "value": "={{ JSON.parse($json.choices[0].message.content).recommended_action }}",
              "type": "string"
            },
            {
              "id": "a7",
              "name": "urgency_reason",
              "value": "={{ JSON.parse($json.choices[0].message.content).urgency_reason }}",
              "type": "string"
            },
            {
              "id": "a8",
              "name": "issue_id",
              "value": "={{ $('Receive Issue').item.json.body.issue_id }}",
              "type": "string"
            },
            {
              "id": "a9",
              "name": "user_name",
              "value": "={{ $('Receive Issue').item.json.body.user_name }}",
              "type": "string"
            },
            {
              "id": "a10",
              "name": "user_email",
              "value": "={{ $('Receive Issue').item.json.body.user_email }}",
              "type": "string"
            },
            {
              "id": "a11",
              "name": "description",
              "value": "={{ $('Receive Issue').item.json.body.description }}",
              "type": "string"
            },
            {
              "id": "a12",
              "name": "location",
              "value": "={{ $('Receive Issue').item.json.body.location }}",
              "type": "string"
            }
          ]
        },
        "options": {}
      },
      "id": "parse-node",
      "name": "Parse AI Result",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [720, 300]
    },
    {
      "parameters": {
        "toEmail": "admincivicpulse123@gmail.com",
        "subject": "=[CivicPulse Alert] {{ $json.severity }} – {{ $json.category }} – Issue #{{ $json.issue_id }}",
        "emailType": "html",
        "html": "=<div style=\"font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 12px;\">\n  <div style=\"background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;\">\n    <h1 style=\"color: #ffffff; margin: 0; font-size: 24px;\">🚨 CivicPulse Issue Alert</h1>\n    <p style=\"color: #a0aec0; margin: 8px 0 0;\">AI-Powered Civic Issue Analysis</p>\n  </div>\n  <div style=\"background: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0;\">\n    <div style=\"background: #fff5f5; border-left: 4px solid #fc8181; padding: 16px; border-radius: 8px; margin-bottom: 16px;\">\n      <p style=\"margin: 0;\"><strong>🔴 Severity:</strong> <span style=\"color: #e53e3e; font-weight: bold;\">{{ $json.severity }}</span></p>\n      <p style=\"margin: 4px 0 0;\"><strong>📋 Category:</strong> {{ $json.category }}</p>\n      <p style=\"margin: 4px 0 0;\"><strong>🎯 Confidence:</strong> {{ $json.confidence }}</p>\n    </div>\n    <h3 style=\"color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;\">AI Analysis Summary</h3>\n    <p>{{ $json.summary }}</p>\n    <p><strong>🔍 Detected Cause:</strong> {{ $json.detected_cause }}</p>\n    <p><strong>⚡ Recommended Action:</strong> {{ $json.recommended_action }}</p>\n    <p><strong>⏰ Urgency Reason:</strong> {{ $json.urgency_reason }}</p>\n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;\">\n    <h3 style=\"color: #2d3748; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;\">Original Submission</h3>\n    <p><strong>👤 User:</strong> {{ $json.user_name }} ({{ $json.user_email }})</p>\n    <p><strong>📝 Description:</strong> {{ $json.description }}</p>\n    <p><strong>📍 Location:</strong> {{ $json.location }}</p>\n    <p><strong>🔢 Issue ID:</strong> #{{ $json.issue_id }}</p>\n    <div style=\"text-align: center; margin-top: 24px;\">\n      <a href=\"https://civic-final-production.up.railway.app/admin\" style=\"display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;\">Open Admin Dashboard</a>\n    </div>\n  </div>\n</div>",
        "options": {}
      },
      "id": "email-node",
      "name": "Notify Admin",
      "type": "n8n-nodes-base.gmail",
      "typeVersion": 2.1,
      "position": [980, 300],
      "credentials": {
        "gmailOAuth2": {
          "id": "GMAIL_CREDENTIAL_ID",
          "name": "Gmail Account"
        }
      }
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={ \"status\": \"received\", \"issue_id\": \"{{ $('Receive Issue').item.json.body.issue_id }}\", \"message\": \"AI analysis complete\" }",
        "options": {
          "responseCode": 200,
          "responseHeaders": {
            "entries": [
              {
                "name": "Content-Type",
                "value": "application/json"
              }
            ]
          }
        }
      },
      "id": "respond-node",
      "name": "Respond OK",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1240, 300]
    }
  ],
  "connections": {
    "Receive Issue": {
      "main": [
        [
          {
            "node": "AI Issue Analyzer",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "AI Issue Analyzer": {
      "main": [
        [
          {
            "node": "Parse AI Result",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Parse AI Result": {
      "main": [
        [
          {
            "node": "Notify Admin",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Notify Admin": {
      "main": [
        [
          {
            "node": "Respond OK",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1"
  }
}
```

---

## C) Step-by-Step Setup Instructions

### Step 1: Import the Workflow into n8n

1. Open your n8n instance: `https://mohamedhossamhamster.app.n8n.cloud`
2. Click the **"+"** button to create a new workflow
3. Click the **three dots menu (⋯)** → **Import from JSON**
4. Paste the entire JSON from Section B above
5. Click **Import**
6. You should see 5 nodes connected in a pipeline:
   ```
   Receive Issue → AI Issue Analyzer → Parse AI Result → Notify Admin → Respond OK
   ```

### Step 2: Set Environment Variables in n8n

Go to **Settings → Variables** and add:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | Your OpenAI API key (starts with `sk-...`) |
| `ADMIN_EMAIL` | `admincivicpulse123@gmail.com` |

### Step 3: Set Up Gmail OAuth2 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **Create a project** (or use existing)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Set:
   - **Application type**: Web application
   - **Authorized redirect URI**: `https://mohamedhossamhamster.app.n8n.cloud/rest/oauth2-credential/callback`
6. Copy the **Client ID** and **Client Secret**
7. In n8n, click the **Notify Admin** node
8. Under **Credentials**, click **Create new** → **Gmail OAuth2**
9. Paste the Client ID and Client Secret
10. Click **Sign in with Google** and authorize

> **Alternative**: If Gmail OAuth is complex, you can replace the Gmail node with the **Email Send (SMTP)** node using any SMTP server.

### Step 4: Get the Webhook URL

1. Click on the **Receive Issue** (Webhook) node
2. You'll see two URLs:
   - **Test URL**: `https://mohamedhossamhamster.app.n8n.cloud/webhook-test/civicpulse`
   - **Production URL**: `https://mohamedhossamhamster.app.n8n.cloud/webhook/civicpulse`
3. Use the **Production URL** as your `N8N_WEBHOOK_URL` environment variable

### Step 5: Test the Workflow

1. Click **Test Workflow** in n8n (this activates the test webhook endpoint)
2. Send a test POST request:

```bash
curl -X POST https://mohamedhossamhamster.app.n8n.cloud/webhook-test/civicpulse \
  -H "Content-Type: application/json" \
  -H "X-CivicPulse-Secret: your-webhook-secret-here" \
  -d '{
    "issue_id": 1,
    "user_name": "Test User",
    "user_email": "test@example.com",
    "description": "Large pothole on Main Street causing traffic issues and vehicle damage",
    "image_url": "",
    "location": "123 Main St, Baghdad, Iraq",
    "timestamp": "2026-04-30T15:00:00Z"
  }'
```

3. Verify:
   - ✅ AI Issue Analyzer returns a valid JSON response
   - ✅ Parse AI Result correctly extracts all fields
   - ✅ Admin receives a formatted email
   - ✅ Webhook returns 200 OK

### Step 6: Activate the Workflow

1. Toggle the **Active** switch in the top-right corner of the workflow editor
2. The production webhook URL is now live

### Step 7: Configure CivicPulse Backend

Add these to your Railway/deployment environment variables:

```
N8N_WEBHOOK_URL=https://mohamedhossamhamster.app.n8n.cloud/webhook/civicpulse
N8N_WEBHOOK_SECRET=your-random-secret-here
```

---

## D) Environment Variables Reference

### CivicPulse Backend (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `N8N_WEBHOOK_URL` | n8n webhook production URL | `https://mohamedhossamhamster.app.n8n.cloud/webhook/civicpulse` |
| `N8N_WEBHOOK_SECRET` | Shared secret for webhook auth | `civicpulse-2026-your-secret` |

### n8n Instance (Settings → Variables)

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o | `sk-proj-...` |
| `ADMIN_EMAIL` | Admin notification email | `admincivicpulse123@gmail.com` |

---

## Architecture Flow

```
User submits issue
       │
       ▼
┌──────────────────────┐
│  CivicPulse Backend  │
│  (issues.create)     │
│                      │
│  1. Save to MySQL    │
│  2. AI Risk Analysis │
│  3. Notify (DB)      │
│  4. fireWebhook() ──────── fire-and-forget ────┐
│  5. Return to user   │                         │
└──────────────────────┘                         │
                                                 ▼
                                    ┌─────────────────────┐
                                    │   n8n Workflow       │
                                    │                     │
                                    │  1. Receive Issue   │
                                    │  2. GPT-4o Analyze  │
                                    │  3. Parse Result    │
                                    │  4. Email Admin     │
                                    │  5. Respond OK      │
                                    └─────────────────────┘
```

---

## AI Agent System Prompt

The following prompt is embedded in the AI Issue Analyzer node. It instructs GPT-4o to classify civic issues:

<details>
<summary>Click to expand full system prompt</summary>

```
You are an expert civil infrastructure analyst and AI triage agent for CivicPulse, a community issue-reporting platform.

## Your Job
Analyze the submitted civic issue — which includes a user text description and optionally a photo — and return a structured JSON object with your findings. You MUST respond with ONLY valid JSON. No preamble. No explanation. No markdown code fences.

## Classification Categories
Choose exactly ONE from:
- "Road Damage" (potholes, cracks, collapsed surface, broken curb)
- "Waste / Garbage" (illegal dumping, overflowing bins, litter accumulation)
- "Drainage / Flooding" (blocked drains, standing water, flood risk)
- "Street Lighting" (broken lights, dark streets, damaged poles)
- "Public Property Damage" (broken benches, vandalism, damaged signs, graffiti)
- "Sewage / Water Leak" (pipe burst, sewage overflow, water main leak)
- "Other" (use only if none of the above apply — then describe in summary)

## Severity Levels
Assign exactly ONE:
- "Critical" — immediate public safety risk, road impassable, sewage overflow
- "High" — significant hazard, likely to worsen quickly, affects many people
- "Medium" — moderate inconvenience, not immediately dangerous, should be fixed within a week
- "Low" — minor issue, aesthetic or low-impact, can be scheduled

## Output Format
Return ONLY this JSON structure — no other text:
{
  "category": "<one of the categories above>",
  "severity": "<Critical | High | Medium | Low>",
  "confidence": <0.0 to 1.0>,
  "summary": "<2-3 sentences describing the problem>",
  "detected_cause": "<visible cause or null>",
  "estimated_affected_area": "<small / medium / large / unknown>",
  "recommended_action": "<specific actionable step for the municipal team>",
  "urgency_reason": "<one sentence explaining why this severity was assigned>"
}

## Rules
- Use the text description as the primary analysis source.
- NEVER invent details not stated in the description.
- If uncertain between two categories, pick the most likely one and reflect uncertainty in confidence score.
- recommended_action MUST be specific (e.g., "Dispatch road repair crew to fill pothole at reported location" not "Fix the road").
```

</details>

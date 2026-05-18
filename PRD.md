# CivicPulse — Product Requirements Document (PRD)

> **Version**: 1.0  
> **Date**: April 30, 2026  
> **Project**: CivicPulse — Community Civic Issue Reporting Platform  
> **Repository**: [github.com/hallamohamad1-design/civic-final](https://github.com/hallamohamad1-design/civic-final)

---

## 1. Executive Summary

**CivicPulse** is a full-stack, community-driven web platform that empowers residents to **report**, **browse**, **upvote**, and **track** local infrastructure and civic issues in real-time. The application combines an interactive map-based interface with AI-powered risk detection and an automated n8n workflow pipeline to deliver a comprehensive civic engagement solution.

### Vision
Bridge the gap between citizens and local authorities by providing a transparent, real-time platform for civic issue management — from pothole reports to critical infrastructure failures.

### Target Users
| Persona | Description |
|---------|-------------|
| **Residents** | Citizens who discover and report local infrastructure problems |
| **Community Members** | Users who browse, upvote, and engage with reported issues |
| **Municipal Admins** | City officials who triage, manage, and resolve reported issues |

---

## 2. Product Goals & Success Metrics

### Primary Goals
1. **Simplify civic reporting** — Enable residents to submit issues in under 2 minutes with location, photos, and descriptions.
2. **Increase transparency** — Provide real-time status tracking (open → in-progress → resolved) on an interactive map.
3. **Prioritize community needs** — Use community upvoting and AI risk detection to surface the most critical issues.
4. **Empower administrators** — Deliver a dedicated admin dashboard with analytics, issue management, and user oversight.

### Key Performance Indicators (KPIs)
| Metric | Target |
|--------|--------|
| Issue submission completion rate | > 85% |
| Average time to first admin response | < 24 hours |
| Community engagement (upvotes per issue) | > 3 average |
| Issue resolution rate | > 70% within 30 days |
| Platform uptime | 99.5% |

---

## 3. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend Framework** | React + TypeScript | 19.x |
| **Styling** | Tailwind CSS + shadcn/ui | 4.x |
| **Routing** | Wouter | 3.x |
| **Animations** | Framer Motion | 12.x |
| **Maps** | Leaflet + React-Leaflet | 1.9 / 5.0 |
| **State / Data** | TanStack React Query | 5.x |
| **Backend** | Express.js + Node.js | 4.x |
| **RPC Framework** | tRPC (end-to-end type-safe) | 11.x |
| **Database** | MySQL / TiDB | — |
| **ORM** | Drizzle ORM | 0.44.x |
| **Authentication** | OAuth (Manus) + OTP Email | — |
| **AI Integration** | AI Risk Detection + n8n Workflow | — |
| **File Storage** | AWS S3 | — |
| **Email** | Nodemailer / Resend | — |
| **Testing** | Vitest | 2.x |
| **Build** | Vite + esbuild | 7.x |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React SPA)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │   Home   │ │   Map    │ │  Submit  │ │  Admin Dashboard  │  │
│  │   Page   │ │   Page   │ │  Issue   │ │  (Role-Gated)     │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │Dashboard │ │  Detail  │ │ Settings │ │   Auth (SignIn/Up) │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    tRPC Client (Type-Safe)                      │
├─────────────────────────────────────────────────────────────────┤
│                   EXPRESS SERVER (Node.js)                      │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────────────┐ │
│  │ Issues Router │ │ Auth Router   │ │ Admin Router           │ │
│  │ (CRUD + Vote) │ │ (OAuth + OTP) │ │ (Manage + Analytics)   │ │
│  └──────────────┘ └───────────────┘ └────────────────────────┘ │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────────────┐ │
│  │ AI Service   │ │ S3 Storage    │ │ Email Service          │ │
│  │ (Risk Detect)│ │ (Image Upload)│ │ (OTP + Notifications)  │ │
│  └──────────────┘ └───────────────┘ └────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│         Drizzle ORM → MySQL/TiDB Database                      │
├─────────────────────────────────────────────────────────────────┤
│         n8n Workflow Engine (AI Issue Processing)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Database Schema

### 5.1 Users Table (`users`)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, Auto-increment | Unique user identifier |
| `openId` | VARCHAR(64) | Unique, NOT NULL | OAuth provider identifier |
| `name` | TEXT | — | Display name |
| `email` | VARCHAR(320) | — | Email address |
| `password` | TEXT | — | Hashed password (OTP flow) |
| `loginMethod` | VARCHAR(64) | — | Auth method used |
| `role` | ENUM(`user`, `admin`) | Default: `user` | Role-based access |
| `language` | VARCHAR(10) | Default: `en` | UI language preference |
| `theme` | VARCHAR(20) | Default: `light` | Theme preference |
| `notificationSettings` | TEXT | JSON string | Notification preferences |
| `createdAt` | TIMESTAMP | Auto | Account creation time |
| `updatedAt` | TIMESTAMP | Auto-update | Last modification time |
| `lastSignedIn` | TIMESTAMP | Auto | Last login time |

### 5.2 Issues Table (`civic_issues_v2`)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, Auto-increment | Issue identifier |
| `userId` | INT | FK → `users.id` | Reporter's user ID |
| `title` | VARCHAR(255) | NOT NULL | Issue headline |
| `description` | TEXT | NOT NULL | Detailed description |
| `category` | VARCHAR(64) | NOT NULL | Roads / Water / Electricity / Sanitation / Other |
| `status` | ENUM | Default: `open` | `open` · `in-progress` · `resolved` |
| `severity` | ENUM | Default: `medium` | `low` · `medium` · `high` |
| `riskLevel` | ENUM | Default: `medium` | AI-assigned: `low` · `medium` · `high` · `critical` |
| `isHidden` | INT | Default: `0` | Visibility flag (admin-only for critical) |
| `address` | VARCHAR(512) | NOT NULL | Street address |
| `latitude` | VARCHAR(64) | NOT NULL | GPS latitude |
| `longitude` | VARCHAR(64) | NOT NULL | GPS longitude |
| `imageUrl` | LONGTEXT | — | Uploaded image URL(s) |
| `upvotes` | INT | Default: `0` | Community vote count |
| `resolutionRating` | INT | — | User satisfaction rating |
| `createdAt` | TIMESTAMP | Auto | Submission time |
| `updatedAt` | TIMESTAMP | Auto-update | Last update time |

### 5.3 Issue Images (`issue_images`)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK | Image identifier |
| `issueId` | INT | FK → `issues.id`, CASCADE | Parent issue |
| `imageUrl` | TEXT | NOT NULL | S3 image URL |
| `createdAt` | TIMESTAMP | Auto | Upload time |

### 5.4 User Votes (`user_votes`)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK | Vote identifier |
| `userId` | INT | FK → `users.id`, CASCADE | Voter |
| `issueId` | INT | FK → `issues.id`, CASCADE | Voted issue |
| `createdAt` | TIMESTAMP | Auto | Vote time |

> Composite unique constraint on (`userId`, `issueId`) prevents duplicate votes.

### 5.5 OTP Codes (`otp_codes`)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK | OTP identifier |
| `email` | VARCHAR(320) | NOT NULL | Target email |
| `code` | VARCHAR(6) | NOT NULL | 6-digit OTP |
| `expiresAt` | TIMESTAMP | NOT NULL | Expiry (10 min) |
| `isUsed` | INT | Default: `0` | Usage flag |
| `createdAt` | TIMESTAMP | Auto | Generation time |

### 5.6 Notifications (`notifications`)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK | Notification identifier |
| `userId` | INT | FK → `users.id`, CASCADE | Recipient |
| `issueId` | INT | FK → `issues.id`, SET NULL | Related issue |
| `title` | VARCHAR(255) | NOT NULL | Notification title |
| `message` | TEXT | NOT NULL | Notification body |
| `type` | VARCHAR(64) | Default: `info` | info / status_change |
| `isRead` | INT | Default: `0` | Read status |
| `createdAt` | TIMESTAMP | Auto | Creation time |

---

## 6. Feature Requirements

### 6.1 Authentication & Authorization

#### FR-AUTH-01: OAuth Authentication
- Users authenticate via Manus OAuth provider.
- On successful login, a JWT session is created and stored as an HTTP-only cookie.
- Session includes user ID, role, and profile data.

#### FR-AUTH-02: OTP Email Authentication
- Users can sign up using email + 6-digit OTP code.
- OTP codes expire after **10 minutes**.
- Used codes are marked and cannot be reused.

#### FR-AUTH-03: Role-Based Access Control
| Role | Permissions |
|------|------------|
| **Public** | Browse issues, view map, upvote (with constraints) |
| **User** | All public + submit issues, manage own issues, access dashboard |
| **Admin** | All user + admin dashboard, manage all issues, manage users, view analytics, access hidden issues |

---

### 6.2 Issue Reporting & Management

#### FR-ISSUE-01: Submit Issue
- **Access**: Authenticated users only.
- **Fields**: Title, description, category, severity, address, map coordinates, photo upload.
- **Location**: Click-to-select on interactive map OR browser geolocation auto-detect.
- **Image Upload**: Photos stored on AWS S3 via presigned URLs.
- **Validation**: All required fields enforced via Zod schemas.

#### FR-ISSUE-02: Browse Issues
- **List View**: Paginated issue list with title, status badge, category, severity, upvote count.
- **Map View**: Interactive Leaflet map with color-coded markers:
  - 🔵 **Blue** → Open
  - 🟡 **Amber** → In-Progress
  - 🟢 **Green** → Resolved

#### FR-ISSUE-03: Filter & Search
- Filter by **status**: open, in-progress, resolved
- Filter by **category**: Roads, Water, Electricity, Sanitation, Other
- Filter by **severity**: low, medium, high
- Location-based search

#### FR-ISSUE-04: Issue Detail View
- Full issue information with images, location map, timestamps
- Upvote button with count
- Edit/delete (owner only)
- Status history timeline

#### FR-ISSUE-05: Update & Delete
- **Update**: Issue owner can edit title, description, category, severity, status.
- **Delete**: Issue owner can delete their own issues (cascade deletes images and votes).
- **Admin Override**: Admins can update/delete any issue.

#### FR-ISSUE-06: Community Upvoting
- Authenticated users can upvote issues to prioritize them.
- **Vote deduplication**: Each user can vote only once per issue (enforced via `user_votes` table).
- Vote count displayed on issue cards and detail views.

---

### 6.3 AI-Powered Risk Detection

#### FR-AI-01: Risk Classification
- Issues are classified into risk levels: **Low**, **Medium**, **High**, **Critical**.
- Risk level is stored in the `riskLevel` column on the issues table.

#### FR-AI-02: AI Issue Analysis (n8n Workflow)
The platform integrates with an **n8n automation workflow** for AI-powered issue processing:

```
Webhook → Validate Input → Prepare Image → AI Analysis (GPT-4o) → Format Result → Email Admin → Respond OK
```

**Workflow Steps**:
1. **Receive Submission**: Webhook endpoint receives issue data via POST.
2. **Validate Input**: Checks that description is non-empty.
3. **Prepare Image**: Converts uploaded image to base64 for AI processing.
4. **AI Analysis**: GPT-4o vision model analyzes the image for:
   - Objects detected
   - Scene description
   - Issues or risks identified
   - Summary report
5. **Format Result**: Compiles user report + AI analysis into a structured report.
6. **Email Notification**: Sends alert email to admin with the full report.
7. **Acknowledge**: Returns success response to the caller.

#### FR-AI-03: Critical Issue Visibility
- Issues with **critical** risk level are hidden from non-admin users (`isHidden = 1`).
- Only admins can view and manage critical/hidden issues.

---

### 6.4 User Dashboard

#### FR-DASH-01: Personal Dashboard
- View all issues submitted by the authenticated user.
- Track status of each issue (open / in-progress / resolved).
- Quick actions: edit, delete, view details.

#### FR-DASH-02: User Settings
- Update profile information.
- Change language preference.
- Toggle theme (light/dark).
- Configure notification preferences (status changes, new comments, email digest).

---

### 6.5 Admin Dashboard

#### FR-ADMIN-01: Issue Management
- View **all** issues including hidden/critical ones.
- Update issue status: open → in-progress → resolved.
- Change risk level and visibility.
- Delete any issue.

#### FR-ADMIN-02: Analytics & Statistics
- Total issues count, resolution rates.
- Issues by category, severity distribution.
- Trend analytics and charts (Recharts).

#### FR-ADMIN-03: User Management
- View registered users.
- Manage user roles (promote to admin / demote).

#### FR-ADMIN-04: Admin Settings
- Platform-wide configuration.
- Manage admin-level preferences.

---

### 6.6 Notifications

#### FR-NOTIF-01: In-App Notifications
- Users receive notifications for:
  - Status changes on their submitted issues.
  - Admin actions on their issues.
- Notifications are stored in the `notifications` table.
- Mark as read functionality.

#### FR-NOTIF-02: Email Notifications
- Admin alert emails via n8n workflow for critical submissions.
- OTP emails for authentication.

---

### 6.7 Maps & Geolocation

#### FR-MAP-01: Interactive Map
- Leaflet-based map with clustered markers.
- Click on marker to see issue summary popup.
- Color-coded status indicators.

#### FR-MAP-02: Location Selection
- Click-to-select location when submitting an issue.
- Reverse geocoding to populate address field.

#### FR-MAP-03: Browser Geolocation
- Auto-detect user's current location on Map page and Submit page.
- Graceful fallback if permission denied.

---

## 7. API Specification (tRPC)

### Issues Router

| Procedure | Access | Input | Output | Description |
|-----------|--------|-------|--------|-------------|
| `issues.list` | Public | `{ limit?, offset? }` | `Issue[]` | List issues with pagination |
| `issues.getById` | Public | `number` | `Issue` | Get single issue by ID |
| `issues.getCount` | Public | — | `number` | Total issues count |
| `issues.create` | Protected | Issue creation fields | `Issue` | Create new issue |
| `issues.update` | Protected | Issue update fields | `Issue` | Update own issue |
| `issues.delete` | Protected | `number` | `{ success }` | Delete own issue |
| `issues.upvote` | Protected | `number` | `Issue` | Upvote with deduplication |
| `issues.getByUser` | Protected | — | `Issue[]` | Get authenticated user's issues |

### Auth Router

| Procedure | Access | Input | Output | Description |
|-----------|--------|-------|--------|-------------|
| `auth.me` | Public | — | `User \| null` | Get current session user |
| `auth.logout` | Public | — | `{ success }` | Clear session |

---

## 8. Pages & Routes

| Route | Page Component | Access | Description |
|-------|---------------|--------|-------------|
| `/` | `Home.tsx` | Public | Landing page with hero, stats, features |
| `/map` | `MapPage.tsx` | Public | Interactive issue map with filters |
| `/submit` | `SubmitIssue.tsx` | Protected | Issue submission form with map picker |
| `/issues/:id` | `IssueDetail.tsx` | Public | Full issue details and voting |
| `/dashboard` | `Dashboard.tsx` | Protected | User's submitted issues |
| `/settings` | `Settings.tsx` | Protected | User preferences |
| `/admin` | `AdminDashboard.tsx` | Admin | Admin management panel |
| `/admin/settings` | `AdminSettings.tsx` | Admin | Admin configuration |
| `/signin` | `SignIn.tsx` | Public | Login page |
| `/signup` | `SignUp.tsx` | Public | Registration with OTP |
| `/showcase` | `ComponentShowcase.tsx` | Public | UI component library preview |
| `*` | `NotFound.tsx` | Public | 404 error page |

---

## 9. Non-Functional Requirements

### NFR-01: Performance
- Page load time: < 3 seconds on 3G connection.
- API response time: < 500ms for standard queries.
- Map rendering: < 2 seconds with up to 1,000 markers.

### NFR-02: Security
- JWT-based session management with HTTP-only cookies.
- CSRF protection via SameSite cookie attribute.
- Rate limiting on API endpoints (`express-rate-limit`).
- Input validation with Zod schemas on all user inputs.
- SQL injection prevention via Drizzle ORM parameterized queries.
- OTP brute-force protection (6-digit code + 10-min expiry).

### NFR-03: Scalability
- Stateless backend compatible with horizontal scaling.
- Database connection pooling via `mysql2`.
- S3 for image storage (infinite scalability).
- n8n workflow engine for async processing.

### NFR-04: Accessibility
- Semantic HTML5 elements.
- ARIA labels on interactive components.
- Keyboard navigable UI.
- Color contrast compliance (WCAG 2.1 AA).

### NFR-05: Responsive Design
- Mobile-first approach.
- Breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl).
- Touch-friendly map interactions on mobile.

### NFR-06: Reliability
- Automated test suite (Vitest) for all backend procedures.
- Database migration tracking with Drizzle Kit.
- Error boundaries in React for graceful UI failures.

---

## 10. n8n Workflow Integration

### Workflow: CivicPulse Enhanced AI Workflow

| Node | Type | Purpose |
|------|------|---------|
| **Receive Submission** | Webhook (POST) | Entry point at `/civicpulse-report` |
| **Check Input** | IF Condition | Validates description is non-empty |
| **Convert Image** | Move Binary Data | Converts uploaded image to base64 |
| **AI Image Analysis** | OpenAI (GPT-4o) | Vision-based analysis of submitted photo |
| **Format Output** | Set Node | Compiles final structured report |
| **Notify Admin** | Email Send | Sends alert to admin email |
| **Respond OK** | Respond to Webhook | Returns success acknowledgment |

### n8n Instance
- **URL**: `https://mohamedhossamhamster.app.n8n.cloud`
- **Version**: 2.49.0 (latest)
- **Integration**: MCP-based control for workflow management

---

## 11. Environment Configuration

### Required
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Session signing secret |
| `VITE_APP_ID` | OAuth application identifier |

### Optional
| Variable | Description | Default |
|----------|-------------|---------|
| `OAUTH_SERVER_URL` | OAuth server endpoint | `https://api.manus.im` |
| `VITE_OAUTH_PORTAL_URL` | OAuth portal URL | `https://auth.manus.im` |
| `OWNER_OPEN_ID` | Admin user's OpenID | — |
| `OWNER_NAME` | Admin display name | — |
| `BUILT_IN_FORGE_API_KEY` | Server-side API key | — |
| `VITE_FRONTEND_FORGE_API_KEY` | Client-side API key | — |

---

## 12. Development & Deployment

### Development Commands
| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start dev server (hot reload) |
| `pnpm build` | Build production bundle |
| `pnpm start` | Run production server |
| `pnpm check` | TypeScript type checking |
| `pnpm test` | Run Vitest test suite |
| `pnpm format` | Format with Prettier |
| `pnpm db:push` | Generate & apply DB migrations |

### Production Build Outputs
- `dist/index.js` — Backend server bundle
- `client/dist/` — Optimized frontend assets

### Deployment Targets
- **Primary**: Manus Platform (built-in hosting)
- **Alternative**: Railway, Vercel, or any Node.js host

---

## 13. Project Status & Roadmap

### ✅ Completed
- Database schema & migrations (6 tables)
- Full CRUD tRPC API for issues
- OAuth + OTP authentication
- Interactive map with Leaflet
- Issue reporting with photo upload
- Community upvoting with deduplication
- User dashboard & settings
- Admin dashboard with analytics
- AI risk detection
- Hidden/critical issue visibility
- Notification system
- Comprehensive Vitest test suite
- n8n AI workflow pipeline
- Responsive design with Tailwind CSS 4

### 🔲 Remaining
- OTP verification in login flow
- Rate limiting for OTP requests
- Complete admin-only navigation
- Auto-detect risk on issue creation
- Risk level display on issue cards
- Risk level filtering
- User management interface (admin)
- Critical issue badge UI
- Vercel deployment configuration
- Comprehensive deployment guide
- Final end-to-end testing

---

## 14. Appendix

### A. Issue Categories
| Category | Example Issues |
|----------|---------------|
| Roads | Potholes, cracks, broken curbs, collapsed surfaces |
| Water | Pipe bursts, water main leaks, supply issues |
| Electricity | Power outages, broken street lights, damaged poles |
| Sanitation | Overflowing bins, illegal dumping, sewage overflow |
| Other | Vandalism, damaged signs, graffiti, broken benches |

### B. Risk Level Definitions
| Level | Description | Response Time |
|-------|-------------|--------------|
| **Low** | Minor aesthetic issue, low impact | Scheduled maintenance |
| **Medium** | Moderate inconvenience, not dangerous | Within 1 week |
| **High** | Significant hazard, affects many people | Within 24 hours |
| **Critical** | Immediate public safety risk | Emergency dispatch |

---

*This document serves as the single source of truth for CivicPulse product requirements. All feature development, testing, and deployment decisions should reference this PRD.*

# CivicPulse

**CivicPulse** is a community-driven web application that empowers residents to report, browse, and upvote local infrastructure and civic issues. Built with React, Tailwind CSS, Express, tRPC, and Supabase PostgreSQL, CivicPulse provides an interactive map-based platform for tracking the resolution of civic problems in real-time.

## Key Changes & Modernizations

The project has recently undergone several major architectural improvements to make it production-ready and easily deployable:

1. **Database Migration to Supabase**: Fully migrated the database layer from TiDB/MySQL to **Supabase PostgreSQL** using Drizzle ORM.
2. **Leaflet Map Integration**: Replaced the Google Maps API dependency with a fully open-source, customizable **Leaflet.js Map (OpenStreetMap)** system. It requires no API keys, has zero cost, and works out-of-the-box.
3. **SMTP Email Verification**: Added nodemailer SMTP integration using a Gmail app mailer for sending OTP code verification emails during forgot-password and security flows.
4. **Vercel Serverless Monorepo Deployment**: Restructured the project as a serverless-friendly monorepo on Vercel:
   - The Vite frontend is built statically into `dist/public`.
   - The Express backend is bundled with `esbuild` into a single, self-contained serverless entrypoint (`api/index.js`) managed by `@vercel/node`.
   - Temporary file uploads are routed to `os.tmpdir()` (`/tmp`) to avoid read-only filesystem crash loops on Vercel.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19, TypeScript | UI library and type safety |
| **Styling** | Tailwind CSS 4, shadcn/ui | Responsive layouts and customized components |
| **Map System** | Leaflet.js & OpenStreetMap | Zero-key interactive map visualization |
| **Backend** | Express 4, Node.js | REST / tRPC server |
| **RPC Framework**| tRPC 11 | End-to-end type-safe API queries and mutations |
| **Database** | Supabase PostgreSQL, Drizzle ORM | Relational database persistence & migration runner |
| **Auth & Security** | JWT (Jose) + OTP Email | Secure authentication flows |
| **Bundling** | Vite (Client), esbuild (Server API) | Ultrafast bundling & compilation |
| **Deployment** | Vercel Serverless | Scale-to-zero serverless hosting |

---

## Project Structure

```
civicpulse_v2/
├── api/                       # Vercel Serverless Function entry point
│   ├── index.ts               # TS Wrapper for Express app
│   └── index.js               # [Generated] Bundled Express app for Vercel
├── client/                    # React SPA frontend application
│   ├── src/
│   │   ├── pages/            # Page components (Home, Map, Submit, Detail, Dashboard)
│   │   ├── components/       # Reusable UI components
│   │   ├── contexts/         # React contexts (Theme, Auth)
│   │   ├── lib/              # Utility libraries (tRPC client config)
│   │   └── App.tsx           # Router and views
│   └── public/               # Static assets (favicons, leafet icons)
├── server/                    # Express backend application
│   ├── _core/                # Server bootstrapper, express configuration
│   │   ├── app.ts            # App instance with tRPC middleware
│   │   └── env.ts            # Environment validator
│   ├── routers.ts            # tRPC procedures (issues, auth, system)
│   ├── db.ts                 # Database pool & helpers (PostgreSQL/Supabase)
│   └── upload.ts             # File upload router (Multer with /tmp fallbacks)
├── drizzle/                   # Drizzle ORM schemas and migrations
│   ├── schema.ts             # Table mappings (users, issues, otps, upvotes)
│   └── migrations/           # PostgreSQL migration folders
├── package.json               # Package scripts & dependencies
├── vercel.json                # Vercel SPA routing & backend rewrite rules
├── .vercelignore              # Prevents uploading node_modules to Vercel
└── vite.config.ts             # Frontend Vite configuration
```

---

## Getting Started

### Prerequisites

- Node.js `20.11.0` or higher
- Supabase account (for PostgreSQL database URL)
- SMTP Server or Gmail App Password (for OTP code mailing)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd civic-final
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   # Database connection
   DATABASE_URL="postgresql://postgres.[ref]:[pass]@[host]:6543/postgres"

   # JWT secret for auth tokens
   JWT_SECRET="your-random-64-character-secret"

   # SMTP Mailer configuration
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER="your-email@gmail.com"
   SMTP_PASS="your-gmail-app-password"
   
   # Dev Mode indicator
   NODE_ENV="development"
   ```

4. **Run Database Migrations**:
   Push the Drizzle schemas to your Supabase instance:
   ```bash
   npm run db:push
   ```

5. **Start Dev Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` to interact with the app.

---

## Available Scripts

| Script | Command | Action |
|--------|---------|--------|
| `dev` | `npm run dev` | Starts server with live-reloading (Vite handles frontend proxying) |
| `build` | `npm run build` | Builds both Vite client and compiles Express code into `/dist` |
| `vercel-build` | `npm run vercel-build` | Specialized Vercel build script that bundles Vite and runs esbuild to output the serverless API chunk |
| `start` | `npm run start` | Boots server locally in production mode |
| `db:push` | `npm run db:push` | Generates schemas and pushes Drizzle structure to database |

---

## Vercel Deployment Details

This project is fully configured for Vercel deployment:

- **Monorepo routing**: The `vercel.json` file handles routing, sending all `/api/*` traffic to the `api/index.js` serverless function, and mapping everything else to the static SPA `index.html`.
- **Pre-bundling**: During Vercel's build step, `esbuild` bundles the Express server and its dependencies into a single, self-contained `api/index.js` file. This prevents missing modules (`ERR_MODULE_NOT_FOUND`) at function runtime.
- **Serverless-safe Uploads**: The file upload middleware uses `os.tmpdir()` on Vercel so that uploads are saved inside the writeable `/tmp` directory instead of trying to write to the read-only deployment package root.

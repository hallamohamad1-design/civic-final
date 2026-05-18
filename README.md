# CivicPulse

**CivicPulse** is a community-driven web application that empowers residents to report, browse, and upvote local infrastructure and civic issues. Built with React, Tailwind CSS, Express, tRPC, and MySQL, CivicPulse provides an interactive map-based platform for tracking the resolution of civic problems in real-time.

## Features

- **Interactive Map**: Visualize all reported civic issues on an interactive Google Map with color-coded status indicators (blue for open, amber for in-progress, green for resolved).
- **Issue Reporting**: Authenticated users can submit new civic issues with location selection via map click, category selection, and severity levels.
- **Real-time Updates**: Track the status of reported issues as authorities work on resolutions. Status updates are reflected immediately across the platform.
- **Community Upvoting**: Public users can upvote issues to show support and help prioritize the most urgent civic problems.
- **User Dashboard**: Authenticated users can view all their submitted issues, edit them, and track their resolution status.
- **Search & Filtering**: Filter issues by status (open, in-progress, resolved), category (Roads, Water, Electricity, Sanitation, Other), and location.
- **Authentication**: Secure OAuth-based authentication with Manus platform integration.
- **Responsive Design**: Fully responsive interface optimized for mobile, tablet, and desktop screens.

## Project Structure

```
civicpulse_v2/
├── client/                    # React frontend application
│   ├── src/
│   │   ├── pages/            # Page components (Home, Map, Submit, Detail, Dashboard)
│   │   ├── components/       # Reusable UI components
│   │   ├── contexts/         # React context providers (Theme)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Utility libraries (tRPC client)
│   │   ├── _core/            # Core utilities (auth hooks)
│   │   ├── App.tsx           # Main app component with routing
│   │   ├── main.tsx          # React entry point
│   │   └── index.css         # Global styles
│   ├── public/               # Static assets
│   └── index.html            # HTML template
├── server/                    # Express backend application
│   ├── routers.ts            # tRPC procedure definitions
│   ├── db.ts                 # Database query helpers
│   ├── storage.ts            # S3 file storage helpers
│   ├── issues.test.ts        # Vitest tests for issues procedures
│   ├── auth.logout.test.ts   # Vitest tests for auth procedures
│   └── _core/                # Core server infrastructure
├── drizzle/                   # Database schema and migrations
│   ├── schema.ts             # Drizzle ORM table definitions
│   ├── 0000_*.sql            # Initial migration (users table)
│   ├── 0001_*.sql            # Issues and images tables migration
│   └── migrations/           # Migration tracking
├── shared/                    # Shared types and constants
│   ├── types.ts              # Shared TypeScript types
│   └── const.ts              # Shared constants
├── package.json              # Project dependencies
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite bundler configuration
├── vitest.config.ts          # Vitest test configuration
├── drizzle.config.ts         # Drizzle ORM configuration
└── README.md                 # This file
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19, TypeScript | UI framework and type safety |
| Styling | Tailwind CSS 4, shadcn/ui | Responsive design and component library |
| Maps | Google Maps API | Interactive map visualization |
| Backend | Express 4, Node.js | REST/tRPC server |
| RPC Framework | tRPC 11 | End-to-end type-safe API |
| Database | MySQL/TiDB, Drizzle ORM | Data persistence and migrations |
| Authentication | Manus OAuth | Secure user authentication |
| Testing | Vitest | Unit and integration tests |
| Build Tools | Vite, esbuild | Fast development and production builds |

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm 10+
- Manus account for deployment and OAuth
- Local MySQL database (for development)

### Installation

1. **Clone the repository** (if applicable):
   ```bash
   git clone <repository-url>
   cd civicpulse_v2
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Environment variables are automatically configured**:
   The Manus platform automatically provides all required environment variables including:
   - `DATABASE_URL` - MySQL connection string
   - `JWT_SECRET` - Session signing key
   - `VITE_APP_ID` - OAuth application ID
   - `OAUTH_SERVER_URL` - OAuth server endpoint
   - `VITE_OAUTH_PORTAL_URL` - OAuth login portal
   - `BUILT_IN_FORGE_API_KEY` and `VITE_FRONTEND_FORGE_API_KEY` - API authentication
   
   For local development, create a `.env.local` file with your own database and OAuth credentials.

4. **Apply database migrations** (if running locally with a database):
   ```bash
   pnpm drizzle-kit migrate
   ```

5. **Start the development server**:
   ```bash
   pnpm dev
   ```

   The application will be available at `http://localhost:3000`

## Development

### Available Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build frontend and backend for production |
| `pnpm start` | Start production server |
| `pnpm check` | Run TypeScript type checking |
| `pnpm format` | Format code with Prettier |
| `pnpm test` | Run Vitest test suite |
| `pnpm db:push` | Generate and apply database migrations |

### Development Workflow

1. **Update Database Schema** (if needed):
   - Edit `drizzle/schema.ts` to add/modify tables
   - Run `pnpm drizzle-kit generate` to create migration SQL
   - Review the generated SQL file
   - Run `pnpm db:push` to apply migrations

2. **Add Backend Features**:
   - Create database query helpers in `server/db.ts`
   - Define tRPC procedures in `server/routers.ts`
   - Write tests in `server/*.test.ts`
   - Run `pnpm test` to verify

3. **Build Frontend Pages**:
   - Create page components in `client/src/pages/`
   - Use `trpc.*` hooks to call backend procedures
   - Import UI components from `client/src/components/ui/`
   - Use Tailwind classes for styling

4. **Test Your Changes**:
   - Write Vitest tests for backend procedures
   - Run `pnpm test` to verify all tests pass
   - Test frontend manually in the browser

## API Documentation

### tRPC Procedures

All procedures are accessible via the `trpc` client in the frontend. The API is fully type-safe with end-to-end TypeScript support.

#### Issues Router

**`issues.list`** - Get all issues with optional pagination
- **Access**: Public
- **Input**: `{ limit?: number, offset?: number }`
- **Output**: `Issue[]`

**`issues.getById`** - Get a single issue by ID
- **Access**: Public
- **Input**: `number` (issue ID)
- **Output**: `Issue`
- **Errors**: `NOT_FOUND` if issue doesn't exist

**`issues.getCount`** - Get total count of all issues
- **Access**: Public
- **Input**: None
- **Output**: `number`

**`issues.create`** - Create a new issue (requires authentication)
- **Access**: Protected
- **Input**: `{ title, description, category, severity, address, latitude, longitude }`
- **Output**: `Issue`
- **Errors**: `UNAUTHORIZED` if not authenticated, `BAD_REQUEST` if validation fails

**`issues.update`** - Update an issue (requires ownership)
- **Access**: Protected
- **Input**: `{ id, title?, description?, category?, severity?, status?, address? }`
- **Output**: `Issue`
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN` if not owner

**`issues.delete`** - Delete an issue (requires ownership)
- **Access**: Protected
- **Input**: `number` (issue ID)
- **Output**: `{ success: boolean }`
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN` if not owner

**`issues.upvote`** - Increment upvote count for an issue
- **Access**: Public
- **Input**: `number` (issue ID)
- **Output**: `Issue`
- **Errors**: `NOT_FOUND` if issue doesn't exist

**`issues.getByUser`** - Get all issues submitted by the authenticated user
- **Access**: Protected
- **Input**: None
- **Output**: `Issue[]`
- **Errors**: `UNAUTHORIZED` if not authenticated

#### Auth Router

**`auth.me`** - Get current authenticated user
- **Access**: Public
- **Input**: None
- **Output**: `User | null`

**`auth.logout`** - Clear session and log out
- **Access**: Public
- **Input**: None
- **Output**: `{ success: boolean }`

## Database Schema

### Users Table
Stores user account information and authentication state.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key, auto-incremented |
| `openId` | varchar(64) | Unique Manus OAuth identifier |
| `name` | text | User's display name |
| `email` | varchar(320) | User's email address |
| `loginMethod` | varchar(64) | Authentication method (e.g., "manus") |
| `role` | enum | User role: "user" or "admin" |
| `createdAt` | timestamp | Account creation timestamp |
| `updatedAt` | timestamp | Last update timestamp |
| `lastSignedIn` | timestamp | Last login timestamp |

### Issues Table
Stores civic issue reports submitted by users.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key, auto-incremented |
| `userId` | int | Foreign key to users table (issue reporter) |
| `title` | varchar(255) | Issue title/headline |
| `description` | text | Detailed issue description |
| `category` | varchar(64) | Category: Roads, Water, Electricity, Sanitation, Other |
| `status` | enum | Status: open, in-progress, resolved |
| `severity` | enum | Severity level: low, medium, high |
| `address` | varchar(255) | Street address of the issue |
| `latitude` | varchar(64) | Geographic latitude coordinate |
| `longitude` | varchar(64) | Geographic longitude coordinate |
| `upvotes` | int | Number of upvotes (default: 0) |
| `createdAt` | timestamp | Issue creation timestamp |
| `updatedAt` | timestamp | Last update timestamp |

### Issue Images Table
Stores photos attached to civic issues.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key, auto-incremented |
| `issueId` | int | Foreign key to issues table (cascade delete) |
| `imageUrl` | text | S3 URL to the image file |
| `createdAt` | timestamp | Image upload timestamp |

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@localhost/civicpulse` |
| `JWT_SECRET` | Secret key for session signing | `your-secret-key-here` |
| `VITE_APP_ID` | Manus OAuth application ID | `app_123456` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OAUTH_SERVER_URL` | Manus OAuth server URL | `https://api.manus.im` |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL | `https://auth.manus.im` |
| `OWNER_OPEN_ID` | Admin user's OpenID | (not set) |
| `OWNER_NAME` | Admin user's display name | (not set) |
| `BUILT_IN_FORGE_API_URL` | Manus API endpoint | `https://api.manus.im` |
| `BUILT_IN_FORGE_API_KEY` | Server-side API key | (not set) |
| `VITE_FRONTEND_FORGE_API_KEY` | Client-side API key | (not set) |
| `VITE_FRONTEND_FORGE_API_URL` | Client-side API endpoint | `https://api.manus.im` |

## Testing

The project includes comprehensive Vitest tests for all backend procedures.

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run specific test file
pnpm test server/issues.test.ts
```

### Test Coverage

- **Authentication**: Login, logout, session management
- **Issues CRUD**: Create, read, update, delete operations
- **Permissions**: Ownership validation, protected procedures
- **Upvoting**: Public upvote functionality
- **Dashboard**: User-specific issue filtering
- **Error Handling**: NOT_FOUND, FORBIDDEN, UNAUTHORIZED errors

## Deployment

### Building for Production

```bash
pnpm build
```

This creates:
- `dist/index.js` - Production server bundle
- `client/dist/` - Optimized frontend assets

### Starting Production Server

```bash
pnpm start
```

The server will listen on the port specified in the environment or default to port 3000.

### Deployment on Manus Platform

CivicPulse is built to deploy seamlessly on the Manus platform with built-in hosting, custom domain support, and automatic environment variable management. Use the Manus dashboard to publish your application.

## Troubleshooting

### Database Connection Issues

**Error**: `ECONNREFUSED` or `Access denied for user`

**Solution**: Verify `DATABASE_URL` is correct and the database server is running.

### OAuth Login Not Working

**Error**: Redirect loop or "Invalid redirect URI"

**Solution**: Ensure `VITE_OAUTH_PORTAL_URL` and `VITE_APP_ID` are correctly configured in environment variables.

### Map Not Displaying

**Error**: Blank map or "Maps API error"

**Solution**: Verify Google Maps API is enabled and `VITE_FRONTEND_FORGE_API_KEY` is valid.

### Tests Failing

**Error**: `Database not available` or connection errors

**Solution**: Tests use mocked database functions and do not require a live database connection. Ensure all dependencies are installed with `pnpm install`.

## Development Guidelines

### Adding New Features

1. Update the database schema in `drizzle/schema.ts` if needed
2. Run `pnpm drizzle-kit generate` to create migrations
3. Add query helpers in `server/db.ts`
4. Define tRPC procedures in `server/routers.ts`
5. Write tests in `server/*.test.ts`
6. Build frontend pages in `client/src/pages/`
7. Run `pnpm test` to verify all tests pass
8. Run `pnpm format` to format code

## Support

For issues, questions, or suggestions about CivicPulse, please refer to the project documentation or contact the development team.

---

**CivicPulse** - Empowering communities through civic engagement and transparent issue tracking.

Built with React, tRPC, Tailwind CSS, and Express on the Manus platform.

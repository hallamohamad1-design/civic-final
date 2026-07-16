import { defineConfig } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// drizzle-kit requires session-mode pooler (port 5432), not transaction-mode (port 6543)
const migrationUrl = rawUrl.replace(":6543/", ":5432/");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});


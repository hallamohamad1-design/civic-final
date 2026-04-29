import { defineConfig } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Ensure password with special characters is encoded correctly for the URL parser
const connectionString = rawUrl.replace(/:(.*)@/, (match, p1) => {
  // If the password part contains '/', we should encode it
  if (p1.includes('/') || p1.includes('!')) {
    return `:${encodeURIComponent(p1)}@`;
  }
  return match;
});

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});

import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL!;
console.log("Connecting to:", url.replace(/:([^@]+)@/, ":****@"));

// force IPv4 — Supabase direct host sometimes only resolves to IPv6
const sql = postgres(url, { connect_timeout: 15, ssl: "require" });

async function main() {
  try {
    const result = await sql`SELECT NOW() as now`;
    console.log("✅ Connected successfully! Server time:", result[0].now);
  } catch (e: any) {
    console.error("❌ Connection failed:", e.message);
    if (e.cause) console.error("   Cause:", e.cause.message);
  } finally {
    await sql.end();
  }
}

main();


import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();

const password = "ElMorr0%4000x";
const projectRef = "lyjnjkjobkxclzxnyzyg";

// All possible Supabase pooler regions
const regions = [
  "us-east-1",
  "us-west-1",
  "us-west-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-south-1",
  "ca-central-1",
  "sa-east-1",
];

async function tryConnect(url: string): Promise<boolean> {
  const sql = postgres(url, { connect_timeout: 5, ssl: "require", max: 1 });
  try {
    await sql`SELECT 1`;
    await sql.end();
    return true;
  } catch {
    await sql.end().catch(() => {});
    return false;
  }
}

async function main() {
  console.log("Scanning Supabase pooler regions...\n");

  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const url = `postgresql://postgres.${projectRef}:${password}@${host}:6543/postgres`;
    process.stdout.write(`Testing ${region}... `);
    const ok = await tryConnect(url);
    if (ok) {
      console.log("✅ CONNECTED!");
      console.log("\nWorking DATABASE_URL:");
      console.log(url);
      process.exit(0);
    } else {
      console.log("❌");
    }
  }
  console.log("\nNo region connected. The project may need the IPv4 add-on enabled.");
}

main();

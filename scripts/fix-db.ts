import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

async function fix() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing");
    return;
  }

  const url = new URL(process.env.DATABASE_URL.trim());
  const connection = await mysql.createConnection({
    host: url.hostname,
    user: url.username,
    password: url.password,
    database: url.pathname.substring(1).split('?')[0] || undefined,
    port: parseInt(url.port) || 3306,
    ssl: { rejectUnauthorized: true }
  });

  console.log("Connected to database. Fixing schema...");

  try {
    // Fix users table
    await connection.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en' NOT NULL,
      ADD COLUMN IF NOT EXISTS notificationSettings TEXT DEFAULT '{"statusChanges":true,"newComments":true,"emailDigest":true}' NOT NULL
    `);
    console.log("Updated users table.");

    // Fix issues table
    await connection.query(`
      ALTER TABLE issues 
      ADD COLUMN IF NOT EXISTS riskLevel ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' NOT NULL,
      ADD COLUMN IF NOT EXISTS isHidden INT DEFAULT 0 NOT NULL
    `);
    console.log("Updated issues table.");

    console.log("Database fix completed successfully!");
  } catch (error) {
    console.error("Failed to fix database:", error);
  } finally {
    await connection.end();
  }
}

fix();

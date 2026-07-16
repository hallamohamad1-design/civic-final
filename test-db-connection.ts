import 'dotenv/config';
import mysql from 'mysql2/promise';

async function testConnection() {
  const dbUrl = process.env.DATABASE_URL;
  console.log(`Testing connection for DATABASE_URL: ${dbUrl}`);

  if (!dbUrl) {
    console.error("No DATABASE_URL found in .env");
    return;
  }

  if (dbUrl.startsWith('postgres') || dbUrl.includes('supabase')) {
    console.log("Detected PostgreSQL/Supabase URL. Using 'pg' client...");
    const pg = await import('pg');
    const { Client } = pg.default || pg;
    const client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      const res = await client.query('SELECT NOW()');
      console.log('✅ Connection successful!');
      console.log('Result of SELECT NOW():', res.rows[0]);
    } catch (err) {
      console.error('❌ Connection failed:', err);
    } finally {
      await client.end();
    }
  } else {
    console.log("Detected MySQL URL. Using 'mysql2' client...");
    try {
      const connection = await mysql.createConnection(dbUrl);
      const [rows] = await connection.query('SELECT NOW()');
      console.log('✅ Connection successful!');
      console.log('Result of SELECT NOW():', rows);
      await connection.end();
    } catch (err) {
      console.error('❌ Connection failed:', err);
    }
  }
}

testConnection();

import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pkg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

try {
  await client.connect();
  const res = await client.query("SELECT NOW()");
  console.log("🟢 Database connected! Time:", res.rows[0]);
} catch (err) {
  console.error("🔴 Database connection failed:", err.message);
} finally {
  await client.end();
}

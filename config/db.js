// config/db.js
import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const {
  DATABASE_URL,          // external DB URL (local dev)
  RENDER_INTERNAL_DB_URL, // internal DB URL (Render production)
  NODE_ENV,
} = process.env;

// Use internal DB on Render in production, else external DB
const connectionString =
  NODE_ENV === "production" && RENDER_INTERNAL_DB_URL
    ? RENDER_INTERNAL_DB_URL
    : DATABASE_URL;

if (!connectionString) {
  throw new Error("❌ No database URL provided. Set DATABASE_URL or RENDER_INTERNAL_DB_URL");
}

// Correct SSL config for Render Postgres
const config = {
  connectionString,
  ssl:
    NODE_ENV === "production"
      ? { rejectUnauthorized: false } // Accept Render's self-signed certificate
      : false,                       // No SSL in local dev
};

// Create the pool
export const pool = new Pool(config);

// Test connection immediately
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected successfully");
    client.release();
  } catch (err) {
    console.error("❌ PostgreSQL connection error:", err.message);
  }
})();

// Optional query helper
export const query = (text, params) => pool.query(text, params);

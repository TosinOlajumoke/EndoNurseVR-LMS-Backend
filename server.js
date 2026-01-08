// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { pool } from "./config/db.js"; // Using our Render/Supabase-ready DB

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// --------------------- CORS ---------------------
const allowedOrigins = ["http://localhost:5173"];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL.replace(/\/+$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        // Allow server-to-server calls (no origin)
        return callback(null, true);
      }

      const cleanOrigin = origin.replace(/\/+$/, ""); // remove trailing slashes
      if (
        allowedOrigins.includes(cleanOrigin) ||
        cleanOrigin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      console.warn("❌ CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight requests for all routes
app.options("*", cors());


// --------------------- Middleware ---------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------- Uploads Directory ---------------------
const uploadsBasePath = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsBasePath)) {
  fs.mkdirSync(uploadsBasePath, { recursive: true });
  console.log("📁 Created uploads directory:", uploadsBasePath);
}
app.use("/uploads", express.static(uploadsBasePath));

// --------------------- Routes ---------------------
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// --------------------- Root / Test DB ---------------------
app.get("/", async (req, res) => {
  try {
    // Test a simple query
    const result = await pool.query("SELECT NOW()");
    
    res.send(`
      ✅ NLNG LMS Backend Server Running
      <br>🌐 Environment: ${process.env.NODE_ENV}
      <br>🕒 Database Time: ${result.rows[0].now}
      <br>📝 Database Host: ${process.env.DB_HOST || "Using DATABASE_URL"}
    `);
  } catch (error) {
    console.error("❌ Database error:", error);
    res.status(500).send(`
      ❌ Database connection failed
      <br>Message: ${error.message}
      <br>Check your DATABASE_URL and SSL settings
    `);
  }
});

// --------------------- Global Error Handler ---------------------
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(err.status || 500).json({ error: err.message });
});

// --------------------- Start Server ---------------------
app.listen(port, () => {
  console.log(`✅ Server running on port ${port} (${process.env.NODE_ENV || "development"})`);
});

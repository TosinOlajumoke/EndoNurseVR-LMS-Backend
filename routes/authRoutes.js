// routes/authRoutes.js
import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";
import { sendAccountEmail } from "../utils/mailer.js";

const router = express.Router();

/**
 * Generate a unique trainee ID
 * Example: NHIS/T/4821
 */
function generateTraineeId() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `NHIS/T/${randomNum}`;
}

/**
 * Helper: Validate email format
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * ============================================================
 * 🟩 SIGNUP ROUTE
 * ============================================================
 * @route POST /api/auth/signup
 * @desc Register a new user (Trainee or Instructor)
 */

router.post("/signup", async (req, res) => {
  try {
    const { first_name, last_name, email, password, role, title } = req.body;

    if (!first_name || !last_name || !email || !password || !role) {
      return res.status(400).json({ error: "All required fields must be filled." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const traineeId = role === "trainee" ? generateTraineeId() : null;

    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, title, trainee_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, first_name, last_name, email, role, title, trainee_id`,
      [first_name, last_name, email, hashedPassword, role, title || null, traineeId]
    );

    const newUser = result.rows[0];

    // ✅ Send Email with credentials
    const emailResponse = await sendAccountEmail({
      ...newUser,
      password_plain: password,
    });

    return res.status(201).json({
      message: "User registered successfully!",
      user: newUser,
      emailSent: emailResponse.success,
    });

  } catch (err) {
    console.error("Signup error:", err);

    if (err.code === "23505") {
      return res.status(400).json({ error: "Email already registered." });
    }

    return res.status(500).json({ error: "Internal server error during signup." });
  }
});
/**
 * ============================================================
 * 🟦 LOGIN ROUTE
 * ============================================================
 * @route POST /api/auth/login
 * @desc Authenticate an existing user
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // === Validate inputs ===
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // === Find user ===
    const userResult = await pool.query(
      "SELECT id, first_name, last_name, email, password_hash, role, title, trainee_id FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = userResult.rows[0];

    // === Compare hashed password ===
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // === Success ===
    return res.status(200).json({
      message: "✅ Login successful!",
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        title: user.title,
        trainee_id: user.trainee_id,
      },
    });

  } catch (err) {
    console.error("❌ Login error:", err);
    return res.status(500).json({ error: "Internal server error during login." });
  }
});

export default router;

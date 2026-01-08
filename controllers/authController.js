import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { sendAccountEmail, generateTraineeId } from "../utils/mailer.js";

export const signup = async (req, res) => {
  try {
    const { first_name, last_name, email, password, role, title } = req.body;

    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: "User already exists" });

    const trainee_id = role === "trainee" ? generateTraineeId() : null;
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, title, trainee_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, first_name, last_name, email, role, trainee_id`,
      [first_name, last_name, email, hashedPassword, role, title || null, trainee_id]
    );

    // send email with plain password
    await sendAccountEmail({
      first_name,
      last_name,
      email,
      role,
      trainee_id,
      password_plain: password,
    });

    res.status(201).json({
      message: "✅ User registered successfully",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error during signup" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0)
      return res.status(400).json({ error: "Invalid credentials" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

    const { password_hash, ...safeUser } = user;

    res.json({
      message: "✅ Login successful",
      user: safeUser,
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
};

import bcrypt from "bcrypt";
import { pool } from "../config/db.js";

async function seed() {
  console.log("✅ Connected to PostgreSQL");

  const users = [
    {
      first_name: "IT",
      last_name: "Admin",
      email: "admin@lms.test",
      password: "admin123",
      role: "admin",
    },
    {
      first_name: "Ian",
      last_name: "Instructor",
      email: "instructor@lms.test",
      title: "Dr.",
      password: "teach123",
      role: "instructor",
    },
    {
      first_name: "Tina",
      last_name: "Trainee",
      email: "trainee@lms.test",
      password: "learn123",
      role: "trainee",
      trainee_id: "NHIS/T/1001",
    },
  ];

  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, 10);
    try {
      await pool.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, title, role, trainee_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO NOTHING`,
        [
          u.first_name,
          u.last_name,
          u.email,
          hashed,
          u.title || null,
          u.role,
          u.trainee_id || null,
        ]
      );
      console.log("✅ Seeded:", u.email);
    } catch (err) {
      console.error("❌ Seed error:", err);
    }
  }

  console.log("🌱 Seeding complete");
  process.exit(0);
}

seed();

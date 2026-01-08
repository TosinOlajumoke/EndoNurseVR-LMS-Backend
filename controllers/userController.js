// src/controllers/userController.js
import { pool } from "../config/db.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { sendAccountEmail } from "../utils/mailer.js";

const DEFAULT_AVATAR = "/uploads/default/default-avatar.png";


// 📊 Dashboard Data (User-specific, instructor only sees their own modules/contents)
export const getDashboardData = async (req, res) => {
  const userId = Number(req.params.id);

  try {
    const { rows: userRows } = await pool.query(
      `SELECT id, first_name, last_name, role, title, trainee_id, profile_picture
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!userRows.length) return res.status(404).json({ message: "User not found" });
    const user = userRows[0];
    const role = user.role;

    // ========== ADMIN DASHBOARD ==========
    if (role === "admin") {
      const [totalUsers, totalAdmins, totalInstructors, totalTrainees] = await Promise.all([
        pool.query("SELECT COUNT(*) FROM users"),
        pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'"),
        pool.query("SELECT COUNT(*) FROM users WHERE role = 'instructor'"),
        pool.query("SELECT COUNT(*) FROM users WHERE role = 'trainee'")
      ]);

      const stats = {
        total_users: parseInt(totalUsers.rows[0].count, 10),
        total_admins: parseInt(totalAdmins.rows[0].count, 10),
        total_instructors: parseInt(totalInstructors.rows[0].count, 10),
        total_trainees: parseInt(totalTrainees.rows[0].count, 10),
        role_distribution: [
          { name: "Admins", value: parseInt(totalAdmins.rows[0].count, 10) },
          { name: "Instructors", value: parseInt(totalInstructors.rows[0].count, 10) },
          { name: "Trainees", value: parseInt(totalTrainees.rows[0].count, 10) },
        ],
      };
      return res.json({ user, stats });
    }

    // ========== INSTRUCTOR DASHBOARD ==========
    if (role === "instructor") {
      // Only modules created by this instructor
      const totalModulesRes = await pool.query(
        "SELECT COUNT(*) FROM modules WHERE instructor_id = $1",
        [userId]
      );

      const totalContentsRes = await pool.query(
        `SELECT COUNT(*) FROM instructor_contents
         WHERE module_id IN (SELECT id FROM modules WHERE instructor_id = $1)`,
        [userId]
      );

      const totalTraineesRes = await pool.query(
        `SELECT COUNT(DISTINCT e.trainee_id) AS total_trainees
         FROM enrollments e
         JOIN instructor_contents ic ON ic.id = e.content_id
         JOIN modules m ON m.id = ic.module_id
         WHERE m.instructor_id = $1`,
        [userId]
      );

      // Fetch contents with trainee counts
      const contentsRes = await pool.query(`
        SELECT ic.id AS content_id,
               ic.title AS content_title,
               ic.module_id,
               m.title AS module_title,
               COUNT(e.trainee_id) AS trainee_count,
               m.created_at
        FROM instructor_contents ic
        LEFT JOIN modules m ON ic.module_id = m.id
        LEFT JOIN enrollments e ON e.content_id = ic.id
        WHERE m.instructor_id = $1
        GROUP BY ic.id, ic.title, ic.module_id, m.title, m.created_at
        ORDER BY m.created_at DESC, ic.id ASC
      `, [userId]);

      // Group contents by module
      const moduleContentsMap = {};
      contentsRes.rows.forEach(r => {
        if (!moduleContentsMap[r.module_id]) {
          moduleContentsMap[r.module_id] = {
            module_id: r.module_id,
            module_title: r.module_title,
            contents: []
          };
        }
        moduleContentsMap[r.module_id].contents.push({
          content_id: r.content_id,
          content_title: r.content_title,
          trainee_count: parseInt(r.trainee_count, 10)
        });
      });

      const stats = {
        total_modules: parseInt(totalModulesRes.rows[0].count, 10),
        total_contents: parseInt(totalContentsRes.rows[0].count, 10),
        total_trainees: parseInt(totalTraineesRes.rows[0].total_trainees, 10),
        modules: Object.values(moduleContentsMap)
      };

      return res.json({ user, stats });
    }

    // ========== TRAINEE DASHBOARD ==========
    if (role === "trainee") {
      const enrollmentsRes = await pool.query(
        `SELECT e.content_id, ic.title AS content_title, ic.module_id, m.title AS module_title
         FROM enrollments e
         JOIN instructor_contents ic ON ic.id = e.content_id
         JOIN modules m ON m.id = ic.module_id
         WHERE e.trainee_id = $1`,
        [userId]
      );

      const rows = enrollmentsRes.rows;
      const total_modules_enrolled = new Set(rows.map(r => r.module_id)).size;
      const total_contents_enrolled = new Set(rows.map(r => r.content_id)).size;

      const grouped = {};
      rows.forEach(r => {
        if (!grouped[r.content_title]) grouped[r.content_title] = [];
        grouped[r.content_title].push({ module_title: r.module_title });
      });

      const stats = {
        trainee_id: user.trainee_id,
        total_modules_enrolled,
        total_contents_enrolled,
        contents: Object.entries(grouped).map(([content_title, modules]) => ({
          content_title,
          modules
        })),
      };

      return res.json({ user, stats });
    }

    return res.status(400).json({ message: "Invalid user role" });
  } catch (err) {
    console.error("getDashboardData error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//PROFILE PICTURE UPLOAD
// Fetch user by ID
export const getUserById = async (id) => {
  const result = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
  return result.rows[0];
};

// Update user's profile picture
export const updateUserProfilePic = async (id, profilePath) => {
  const result = await pool.query(
    "UPDATE users SET profile_picture=$1 WHERE id=$2 RETURNING *",
    [profilePath, id]
  );
  return result.rows[0];
};

// ====================================================
// 👥 USER MANAGEMENT
// ====================================================
// GET all users
export const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, role, title, trainee_id, created_at 
       FROM users ORDER BY id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// ADD new user
function generateTraineeId() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `NHIS/T/${randomNum}`;
}

export const addUser = async (req, res) => {
  try {
    const { first_name, last_name, email, password, role, title } = req.body;

    if (!first_name || !last_name || !email || !password || !role) {
      return res.status(400).json({ error: "All required fields must be filled." });
    }

    // Check if email exists
    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const traineeId = role === "trainee" ? generateTraineeId() : null;

    // Set default profile picture for the new user
     const defaultProfilePic = DEFAULT_AVATAR;

    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, title, trainee_id, profile_picture)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, first_name, last_name, email, role, title, trainee_id, profile_picture`,
      [first_name, last_name, email, hashedPassword, role, title || null, traineeId, defaultProfilePic]
    );

    const newUser = result.rows[0];

    // ✅ Send email with credentials (Account Creation)
    const emailResponse = await sendAccountEmail({
      ...newUser,
      password_plain: password,
    }, "create");

    res.status(201).json({
      message: "User created successfully!",
      user: newUser,
      emailSent: emailResponse.success,
    });

  } catch (err) {
    console.error("Add user error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// DELETE user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const firstAdminRes = await pool.query(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`
    );

    if (firstAdminRes.rowCount > 0 && firstAdminRes.rows[0].id == id)
      return res.status(403).json({ error: "Cannot delete the first admin" });

    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// ====================================================
// 👥 PASSWORD RESET
// ====================================================
export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and new password are required." });
    }

    // Check if the user exists
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = userResult.rows[0];

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password in the database
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE email = $2",
      [hashedPassword, email]
    );

    // Send email notifying user of the password reset
    const emailResponse = await sendAccountEmail(user, "reset", newPassword);

    res.json({
      message: "Password updated successfully!",
      emailSent: emailResponse.success,
    });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
};

// ====================================================
// 📚 CONTENT LIBRARY
// ====================================================
export const getAllAdminContents = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM admin_contents ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching contents:", err);
    res.status(500).json({ message: "Server error fetching contents" });
  }
};

export const addContent = async (req, res) => {
  try {
    const { title, description, video_url } = req.body;
    const image = req.file ? `/uploads/content_uploads/${req.file.filename}` : null;

    const result = await pool.query(
      "INSERT INTO admin_contents (title, description, image, video_url) VALUES ($1, $2, $3, $4) RETURNING *",
      [title, description, image, video_url || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding content:", err);
    res.status(500).json({ message: "Failed to add content" });
  }
};

export const deleteContent = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT image FROM admin_contents WHERE id=$1",
      [id]
    );
    if (result.rows.length > 0 && result.rows[0].image) {
      const imagePath = path.join(process.cwd(), "backend", result.rows[0].image);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    await pool.query("DELETE FROM admin_contents WHERE id=$1", [id]);
    res.json({ message: "Content deleted successfully" });
  } catch (err) {
    console.error("Error deleting content:", err);
    res.status(500).json({ message: "Failed to delete content" });
  }
};

// ====================================================
// ✏️ Update content by ID
// ====================================================
export const updateContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, video_url } = req.body;
    let imagePath = null;

    // Validate required fields
    if (!title || !description)
      return res.status(400).json({ message: "Title and description are required" });

    // Check if content exists
    const existing = await pool.query("SELECT * FROM admin_contents WHERE id=$1", [id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: "Content not found" });

    // Handle optional new image upload
    if (req.file) {
      imagePath = `/uploads/content_uploads/${req.file.filename}`;

      // Delete old image from filesystem
      const oldImagePath = existing.rows[0].image;
      if (oldImagePath) {
        const fullOldPath = path.join(process.cwd(), "backend", oldImagePath);
        if (fs.existsSync(fullOldPath)) fs.unlinkSync(fullOldPath);
      }
    }

    // Update the database
    const result = await pool.query(
      `UPDATE admin_contents 
       SET title=$1, description=$2, image=COALESCE($3, image), video_url=COALESCE($4, video_url)
       WHERE id=$5 RETURNING *`,
      [title, description, imagePath, video_url || null, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating content:", err);
    res.status(500).json({ message: "Failed to update content" });
  }
};


// ====================================================
// Get all modules with each instructor_contents
// ====================================================
export const getAllModules = async (req, res) => {
  try {
    const { instructor_id } = req.query;
    if (!instructor_id)
      return res.status(400).json({ message: "Instructor ID required" });

    // NEWEST MODULES FIRST
    const modulesRes = await pool.query(
      `SELECT *
       FROM modules
       WHERE instructor_id = $1
       ORDER BY created_at DESC`,
      [instructor_id]
    );

    const modules = modulesRes.rows;

    const modulesWithContents = await Promise.all(
      modules.map(async (module) => {
        // NEWEST CONTENTS FIRST
        const contentsRes = await pool.query(
          `SELECT *
           FROM instructor_contents
           WHERE module_id = $1
           ORDER BY created_at DESC`,
          [module.id]
        );

        return { ...module, contents: contentsRes.rows };
      })
    );

    res.json(modulesWithContents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching modules" });
  }
};


// ====================================================
// Add new module for a specific instructor
// ====================================================
export const addModule = async (req, res) => {
  const { title, instructor_id } = req.body;

  if (!instructor_id) return res.status(400).json({ message: "Instructor ID required" });
  if (!title) return res.status(400).json({ message: "Module title required" });

  try {
    const newModule = await pool.query(
      "INSERT INTO modules(title, instructor_id) VALUES($1, $2) RETURNING *",
      [title, instructor_id]
    );
    res.status(201).json(newModule.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error adding module" });
  }
};

// ====================================================
// Delete module by ID
// ====================================================
export const deleteModule = async (req, res) => {
  const { id } = req.params;
  const { instructor_id } = req.body; // make sure frontend sends this

  if (!instructor_id) return res.status(400).json({ message: "Instructor ID required" });

  try {
    const moduleCheck = await pool.query(
      "SELECT * FROM modules WHERE id = $1 AND instructor_id = $2",
      [id, instructor_id]
    );
    if (moduleCheck.rows.length === 0)
      return res.status(404).json({ message: "Module not found or unauthorized" });

    await pool.query("DELETE FROM instructor_contents WHERE module_id = $1", [id]);
    await pool.query("DELETE FROM modules WHERE id = $1", [id]);

    res.status(200).json({ message: "Module deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting module" });
  }
};


// ====================================================
// Attach library content to a module
// ====================================================
export const attachLibraryContentToModule = async (req, res) => {
  const moduleId = req.params.moduleId;
  const contentId = req.params.contentId;

  if (!moduleId || !contentId) {
    return res.status(400).json({ message: "Module ID and Content ID are required" });
  }

  try {
    // Check if this content is already attached
    const existsRes = await pool.query(
      `SELECT * FROM instructor_contents WHERE module_id = $1 AND admin_content_id = $2`,
      [moduleId, contentId]
    );

    if (existsRes.rows.length > 0) {
      return res.status(400).json({ message: "Content has already been added to this module" });
    }

    // Get content from admin_contents
    const { rows } = await pool.query(
      `SELECT * FROM admin_contents WHERE id = $1`,
      [contentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Content not found in library" });
    }

    const content = rows[0];

    // Insert into instructor_contents
    const insertRes = await pool.query(
      `INSERT INTO instructor_contents (module_id, title, description, image, video, admin_content_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [moduleId, content.title, content.description, content.image, content.video_url, content.id]
    );

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error("Error attaching library content:", err);
    res.status(500).json({ message: "Failed to attach content to module" });
  }
};

// ====================================================
// Get all contents for a module (NEWEST FIRST)
// ====================================================
export const getModuleContents = async (req, res) => {
  const { moduleId } = req.params;

  try {
    const contentsRes = await pool.query(
      `SELECT *
       FROM instructor_contents
       WHERE module_id = $1
       ORDER BY created_at DESC`,
      [moduleId]
    );

    res.json(contentsRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching contents" });
  }
};

// ====================================================
// Edit a content by ID
// ====================================================
export const editContent = async (req, res) => {
  const { contentId } = req.params;
  const { title, description, videopath } = req.body;

  if (!title || !description) {
    return res.status(400).json({ message: "Title and description are required" });
  }

  let imagePath = null;
  if (req.file) {
    imagePath = `/uploads/module_uploads/${req.file.filename}`;
  }

  try {
    // Check if content exists
    const existingContent = await pool.query(
      "SELECT * FROM instructor_contents WHERE id = $1",
      [contentId]
    );
    if (existingContent.rows.length === 0) {
      return res.status(404).json({ message: "Content not found" });
    }

    // Update content
    const updatedContent = await pool.query(
      `UPDATE instructor_contents
       SET title = $1,
           description = $2,
           video = $3,
           image = COALESCE($4, image)
       WHERE id = $5
       RETURNING *`,
      [title, description, videopath || null, imagePath, contentId]
    );

    res.status(200).json(updatedContent.rows[0]);
  } catch (err) {
    console.error("Error updating content:", err);
    res.status(500).json({ message: "Error updating content" });
  }
};

// ====================================================
// Delete a content by ID
// ====================================================
export const deleteInstructor_Content = async (req, res) => {
  const { contentId } = req.params;

  try {
    const existingContent = await pool.query(
      "SELECT * FROM instructor_contents WHERE id = $1",
      [contentId]
    );
    if (existingContent.rows.length === 0) {
      return res.status(404).json({ message: "Content not found" });
    }

    await pool.query("DELETE FROM instructor_contents WHERE id = $1", [contentId]);
    res.status(200).json({ message: "Content deleted successfully" });
  } catch (err) {
    console.error("Error deleting content:", err);
    res.status(500).json({ message: "Error deleting content" });
  }
};
// Enroll trainees to content
export const enrollTrainees = async (req, res) => {
  const { content_id, trainee_ids } = req.body;

  if (!content_id || !trainee_ids || !trainee_ids.length) {
    return res.status(400).json({ message: "Content and trainee(s) are required" });
  }

  try {
    for (const userId of trainee_ids) {
      // Get trainee's NLNG/T/xxxx ID
      const userRes = await pool.query(
        "SELECT trainee_id FROM users WHERE id = $1",
        [userId]
      );

      if (userRes.rows.length === 0) {
        return res.status(404).json({ message: `Trainee with ID ${userId} not found` });
      }

      const traineeCode = userRes.rows[0].trainee_id;

      // Check if trainee is already enrolled
      const existsRes = await pool.query(
        "SELECT * FROM enrollments WHERE content_id = $1 AND trainee_id = $2",
        [content_id, userId]
      );

      if (existsRes.rows.length > 0) {
        return res.status(400).json({ message: `Trainee ${traineeCode} has already been added` });
      }

      // Insert enrollment
      await pool.query(
        "INSERT INTO enrollments(content_id, trainee_id) VALUES($1, $2)",
        [content_id, userId]
      );
    }

    res.json({ message: "Trainees enrolled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error enrolling trainees" });
  }
};

// Get all trainees
export const getTrainees = async (req, res) => {
  try {
    const resTrainees = await pool.query(
      "SELECT id, first_name, last_name, email FROM users WHERE role='trainee'"
    );
    res.json(resTrainees.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching trainees" });
  }
};

// live table data in Enrolled trainee dashboard
// Get modules with contents and enrolled trainees (instructor-specific)
export const getModulesWithEnrollments = async (req, res) => {
  try {
    const { instructor_id } = req.query;
    if (!instructor_id) {
      return res.status(400).json({ message: "Instructor ID required" });
    }

    const modulesRes = await pool.query(
      "SELECT id, title FROM modules WHERE instructor_id = $1 ORDER BY created_at DESC",
      [instructor_id]
    );

    const result = await Promise.all(
      modulesRes.rows.map(async (module) => {
        const contentsRes = await pool.query(
          `SELECT id, title
           FROM instructor_contents
           WHERE module_id = $1
           ORDER BY created_at DESC`,
          [module.id]
        );

        const contents = await Promise.all(
          contentsRes.rows.map(async (content) => {
            const traineesRes = await pool.query(
              `SELECT u.first_name, u.last_name, u.trainee_id
               FROM enrollments e
               JOIN users u ON e.trainee_id = u.id
               WHERE e.content_id = $1`,
              [content.id]
            );

            return { ...content, enrolledTrainees: traineesRes.rows };
          })
        );

        return { ...module, contents };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("Error fetching modules with enrollments:", err);
    res.status(500).json({ message: "Failed to fetch enrollments" });
  }
};

// ====================================================
// 🎓 Trainee Modules Access (Optimized)
// ====================================================
export const getTraineeModules = async (req, res) => {
    const traineeId = req.params.traineeId;

    if (!traineeId) {
        return res.status(401).json({ message: "Trainee ID is required" });
    }

    try {
        // Fetch all enrolled contents in a single, efficient query using JOINs
        const enrolledRes = await pool.query(
            `SELECT
                m.id AS module_id,
                m.title AS module_title,
                ic.id AS content_id,
                ic.title AS content_title,
                ic.description AS content_description,
                ic.image AS content_image,
                ic.video AS content_video
            FROM enrollments e
            JOIN instructor_contents ic ON e.content_id = ic.id
            JOIN modules m ON ic.module_id = m.id
            WHERE e.trainee_id = $1
            ORDER BY m.created_at DESC, ic.created_at DESC`, // Order newest modules/content first
            [traineeId]
        );

        const enrolledRows = enrolledRes.rows;

        // Group the flattened results into the desired nested structure: Module -> Contents
        const groupedModules = enrolledRows.reduce((acc, row) => {
            const moduleId = row.module_id;
            const content = {
                id: row.content_id,
                title: row.content_title,
                description: row.content_description,
                image: row.content_image,
                video: row.content_video,
            };

            if (!acc[moduleId]) {
                acc[moduleId] = {
                    id: moduleId,
                    title: row.module_title,
                    contents: [],
                };
            }
            acc[moduleId].contents.push(content);
            return acc;
        }, {});
        
        // Convert the map object back to an array
        res.json(Object.values(groupedModules));
    } catch (err) {
        console.error("Error fetching trainee modules:", err);
        res.status(500).json({ message: "Failed to fetch trainee modules" });
    }
};

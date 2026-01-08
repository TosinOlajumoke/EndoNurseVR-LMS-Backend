import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pool } from "../config/db.js";

import {
  // Dashboard
  getDashboardData,

  //Profile picture
  updateUserProfilePic,
  getUserById,

  // Users
  getAllUsers,
  addUser,
  deleteUser,
  resetPassword,

 // Content Library
  getAllAdminContents,
  addContent,
  deleteContent,
  updateContent ,

  // Instructor Page & Modules
  getAllModules,
  addModule,
  deleteModule,
  getModuleContents,
  attachLibraryContentToModule,
  deleteInstructor_Content,
  enrollTrainees,
  getTrainees,
  getModulesWithEnrollments,

  // Trainee Page & Modules
 getTraineeModules,
} from "../controllers/userController.js";

const router = express.Router();

const DEFAULT_AVATAR = "/uploads/default/default-avatar.png";


// ====================================================
// 🧭 DASHBOARD
// ====================================================
router.get("/dashboard/:id", getDashboardData);


// Set up directory for profilePic_uploads
const profileUploadDir = path.join(process.cwd(), "uploads", "profilePic_uploads");
if (!fs.existsSync(profileUploadDir)) fs.mkdirSync(profileUploadDir, { recursive: true });

// Multer config for profile uploads
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, profileUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `profile_${Date.now()}${ext}`);
  },
});
const profileUpload = multer({ storage: profileStorage });

// Upload profile picture route
router.post("/:userId/upload-profile", profileUpload.single("profile_picture"), async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if the user already has a profile picture and delete it (but not the default one)
    if (user.profile_picture && user.profile_picture !== DEFAULT_AVATAR) {
  const oldPath = path.join(process.cwd(), user.profile_picture);
  if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
}

    // Update user in database with new profile picture path
    const newPath = `uploads/profilePic_uploads/${req.file.filename}`;
    const updatedUser = await updateUserProfilePic(userId, newPath);

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error uploading profile picture" });
  }
});


// ====================================================
// 👥 USER MANAGEMENT ROUTES (Admin Panel)
// ====================================================
router.get("/", getAllUsers);
router.post("/", addUser);
router.delete("/:id", deleteUser);
// RESET password
router.post("/reset-password", resetPassword);


// ====================================================
// 📚 CONTENT LIBRARY ROUTES (Admin Panel)
// ====================================================

// Set up directory for content_uploads
const contentUploadDir = path.join(process.cwd(), "uploads", "content_uploads");
if (!fs.existsSync(contentUploadDir)) fs.mkdirSync(contentUploadDir, { recursive: true });

// Multer config for content uploads
const contentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, contentUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `content_${Date.now()}${ext}`);
  },
});
const contentUpload = multer({ storage: contentStorage });

// Admin_Content routes
router.get("/admin_contents", getAllAdminContents);
router.post("/admin_contents", contentUpload.single("image"), addContent);
router.put("/admin_contents/:id", contentUpload.single("image"), updateContent);
router.delete("/admin_contents/:id", deleteContent);



// Modules
router.get("/modules", getAllModules);
router.post("/modules", addModule);
router.delete("/modules/:id", deleteModule);

// Instructor Contents
router.get("/modules/:moduleId/contents", getModuleContents);
router.post("/modules/:moduleId/attach_content/:contentId",attachLibraryContentToModule);

// Delete content
router.delete("/contents/:contentId", deleteInstructor_Content);

// Enrollments
router.post("/contents/enroll", enrollTrainees);
router.get("/trainees", getTrainees);

// Route for enrollment table
router.get("/modules/enrollments", getModulesWithEnrollments);

// Trainee Module Route
router.get("/my-courses/:traineeId", getTraineeModules);

export default router;

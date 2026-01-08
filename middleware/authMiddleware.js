import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
const JWT_SECRET = process.env.JWT_SECRET || "replace_with_secret";
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Access denied" });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}
export function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}
export function isInstructor(req, res, next) {
  if (!req.user || req.user.role !== "instructor") return res.status(403).json({ error: "Instructor access required" });
  next();
}
export function isTrainee(req, res, next) {
  if (!req.user || req.user.role !== "trainee") return res.status(403).json({ error: "Trainee access required" });
  next();
}

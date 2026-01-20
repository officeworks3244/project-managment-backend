import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";
import { uploadSingle } from "../middleware/upload.js";

const router = express.Router();

// Middleware to handle multer errors
const handleMulterError = (err, req, res, next) => {
  if (err && err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: err.message || "File upload error",
    });
  }
  next(err);
};

router.get("/profile", requireAuth, getProfile);
router.put("/profile", requireAuth, uploadSingle, handleMulterError, updateProfile);
router.put("/profile/change-password", requireAuth, changePassword);

export default router;

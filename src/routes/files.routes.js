import express from "express";
import { upload } from "../middleware/upload.js";
import { requireAuth } from "../middleware/auth.js";
import {
  uploadFile,
  getFileById,
  getFilesByRelatedId, // New function
  deleteFile,
} from "../controllers/files.controller.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

router.post(
  "/files/upload",
  requireAuth,
  requirePermission("files.upload"),
  upload.single("file"),
  uploadFile
);

// Get all files for a task/project
router.get("/files/:related_id", requireAuth, getFilesByRelatedId);

// Get single file info
router.get("/file/:id", requireAuth, getFileById);

router.delete("/files/:id", requireAuth, requirePermission("files.delete"), deleteFile);

export default router;
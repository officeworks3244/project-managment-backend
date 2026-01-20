import express from "express";
import {
  getAllActivityLogs,
  getMyActivityLogs,
} from "../controllers/activityLogs.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

// Admin system logs
router.get(
  "/activity-logs",
  requireAuth,
  requirePermission("logs.view"),
  getAllActivityLogs
);

// Logged-in user logs
router.get("/activity-logs/me", requireAuth, getMyActivityLogs);

export default router;

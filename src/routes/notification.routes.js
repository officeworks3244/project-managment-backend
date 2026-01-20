import express from "express";
import {
  getNotifications,
  markNotificationRead,
} from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.get("/notifications", requireAuth, getNotifications);
router.put("/notifications/:id/read", requireAuth, markNotificationRead);

export default router;

import express from "express";
import {
  getTaskComments,
  addTaskComment,
  deleteComment,
} from "../controllers/taskComments.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

// Task comments
router.get("/tasks/:id/comments", requireAuth,
  requirePermission("tasks.view"), getTaskComments);

router.post("/tasks/:id/comments", requireAuth,
  requirePermission("comments.create"), addTaskComment);

// Delete comment
router.delete("/comments/:id", requireAuth,
  requirePermission("comments.delete"), deleteComment);

export default router;

import express from "express";
import {
  getAllTasks,
  getMyTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  updateTaskPriority,
  deleteTask,
  getTasksByUserId,
  getTasksByProjectId
} from "../controllers/tasks.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

router.use(requireAuth);

// Admin
router.get("/tasks",  getAllTasks);

// Logged-in user
router.get("/tasks/my", getMyTasks);

// Task detail
router.get("/tasks/:id", getTaskById);

// Manage tasks
router.post(
  "/tasks",
  createTask
);

router.put(
  "/tasks/:id",
  updateTask
);

router.delete(
  "/tasks/:id",
  deleteTask
);

// Update task status
router.patch("/tasks/:id/status", updateTaskStatus);

// Update task priority
router.patch("/tasks/:id/priority", updateTaskPriority);

// Task detail
router.get("/:userId/tasks", getTasksByUserId);

router.get(
  "/projects/:projectId/tasks",
  requireAuth,
  getTasksByProjectId
);


export default router;

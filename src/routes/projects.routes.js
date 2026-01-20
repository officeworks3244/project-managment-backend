import express from "express";
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectsByUserId
} from "../controllers/projects.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

router.use(requireAuth);

// View
router.get("/get", getProjects, requireAuth,
  requirePermission("projects.view"));

router.get("/:id", getProjectById, requireAuth,
  requirePermission("projects.view"));

// Manage
router.post(
  "/add",
  requireAuth,
  requirePermission("projects.create"),
  createProject
);

router.put(
  "/:id",
  requireAuth,
  requirePermission("projects.update"),
  updateProject
);

router.delete(
  "/:id",
  requireAuth,
  requirePermission("projects.delete"),
  deleteProject
);

// View
router.get("/:userId/projects", getProjectsByUserId, requireAuth,
  requirePermission("projects.view"));


export default router;

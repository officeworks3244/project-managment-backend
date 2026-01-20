import express from "express";
import {
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
} from "../controllers/projectMembers.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

router.use(requireAuth);

// View members
router.get("/projects/:id/members",  requirePermission("projects.view"), getProjectMembers);

// Manage members
router.post(
  "/projects/:id/members",

  requirePermission("projects.update"),
  addProjectMember
);

router.delete(
  "/projects/:id/members/:userId",
  requirePermission("projects.update"),
  removeProjectMember
);

export default router;
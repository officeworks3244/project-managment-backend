import express from "express";
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getRoleById
} from "../controllers/roles.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";


const router = express.Router();

// Only ADMIN / SUPER_ADMIN can manage roles
router.get("/get", requireAuth,
  requirePermission("roles.manage"), getRoles);

router.post("/add", requireAuth,
  requirePermission("roles.manage"), createRole);

router.put("/:id", requireAuth,
  requirePermission("roles.manage"), updateRole);

router.delete("/:id", requireAuth,
  requirePermission("roles.manage"), deleteRole);

router.get(
  "/:id",
  requireAuth,
  requirePermission("roles.manage"),
  getRoleById
);


export default router;

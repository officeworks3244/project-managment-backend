import express from "express";
import { assignPermissionsToRole, getRolePermissions, updateRolePermissions } from "../controllers/rolePermissions.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

router.post(
  "/:id/permissionsassign",
  requireAuth,
  requirePermission("roles.manage"),
  assignPermissionsToRole
);

router.get(
  "/roles/:roleId/permissions",
  getRolePermissions
);


router.put(
  "/roles/:roleId/permissions",
  requireAuth,
  requirePermission("roles.manage"),
  updateRolePermissions
);


export default router;

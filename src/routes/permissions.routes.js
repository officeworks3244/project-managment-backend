import express from "express";
import {
  getPermissions,
  createPermission,
} from "../controllers/permissions.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

router.get(
  "/get",
  requireAuth,
  requirePermission("permissions.manage"),
  getPermissions
);

router.post(
  "/",
  requireAuth,
  requirePermission("permissions.manage"),
  createPermission
);

export default router;

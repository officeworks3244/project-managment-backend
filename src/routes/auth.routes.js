import express from "express";
import { login, logout, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

router.post("/login", login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);

export default router;

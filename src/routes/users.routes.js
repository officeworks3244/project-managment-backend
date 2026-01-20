import express from "express";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/users.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadSingle } from "../middleware/upload.js";

const router = express.Router();

router.use(requireAuth);

// Middleware to handle multer errors
const handleMulterError = (err, req, res, next) => {
  if (err && err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: err.message || "File upload error",
    });
  }
  next(err);
};

// ADMIN & SUPER_ADMIN
router.get("/get",   getUsers);
router.get("/:id", getUserById);
router.post("/add", createUser);
router.put("/:id", uploadSingle, handleMulterError, updateUser);
router.delete("/:id",  deleteUser);

export default router;

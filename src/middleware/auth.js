import jwt from "jsonwebtoken";
import { pool } from "../../config/db.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ message: "Token required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        r.name AS role,
        GROUP_CONCAT(p.name) AS permissions
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = ?
      GROUP BY u.id
      `,
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = {
      id: rows[0].id,
      role: rows[0].role,
      permissions: rows[0].permissions
        ? rows[0].permissions.split(",")
        : [],
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
};

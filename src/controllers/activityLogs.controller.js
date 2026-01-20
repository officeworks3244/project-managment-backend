import { pool } from "../../config/db.js";

/**
 * GET ALL ACTIVITY LOGS (ADMIN)
 * GET /activity-logs
 */
export const getAllActivityLogs = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        a.id,
        a.action,
        a.entity_type,
        a.entity_id,
        a.created_at,
        u.id AS user_id,
        u.name AS user_name,
        u.email
      FROM activity_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("Get activity logs error:", err);
    res.status(500).json({ message: "Failed to fetch activity logs" });
  }
};

/**
 * GET MY ACTIVITY LOGS
 * GET /activity-logs/me
 */
export const getMyActivityLogs = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        id,
        action,
        entity_type,
        entity_id,
        created_at
      FROM activity_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("Get my activity logs error:", err);
    res.status(500).json({ message: "Failed to fetch user activity" });
  }
};

import { pool } from "../../config/db.js";


/**
 * GET NOTIFICATIONS
 * GET /notifications
 */
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const roleId = req.user.role_id; // assume middleware set karta hai

    let query = `
      SELECT 
        n.*,
        u.name,
        u.email
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
    `;
    let params = [];

    // ✅ Super Admin (role_id = 1) → sab dekhega
    if (roleId === 1) {
      query += ` ORDER BY n.created_at DESC LIMIT 50`;
    } 
    // ✅ Normal users - get broadcast notifications and their specific notifications
    else {
      query += `
        WHERE 
          (
            n.user_id = ? 
            OR n.user_id IS NULL
          )
        ORDER BY n.created_at DESC
        LIMIT 50
      `;
      params = [userId];
    }

    const [rows] = await pool.query(query, params);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load notifications",
    });
  }
};


/**
 * MARK NOTIFICATION READ
 * PUT /notifications/:id/read
 */
export const markNotificationRead = async (req, res) => {
  const { id } = req.params;

  await pool.query(
    `UPDATE notifications SET is_read = 1 WHERE id = ?`,
    [id]
  );

  res.json({ success: true });
};

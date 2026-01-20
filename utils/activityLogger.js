import { pool } from "../config/db.js";

/**
 * Log activity to database
 * @param {number} userId - ID of user performing the action
 * @param {string} action - Action type (CREATE, UPDATE, DELETE, etc.)
 * @param {string} entityType - Type of entity (Project, Task, User, Role, Permission, etc.)
 * @param {number} entityId - ID of the entity being acted upon
 */
export const logActivity = async (userId, action, entityType, entityId) => {
  try {
    await pool.query(
      `
      INSERT INTO activity_logs 
        (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, ?, ?, ?, NOW())
      `,
      [userId, action, entityType, entityId]
    );
  } catch (err) {
    console.error("Activity log error:", err);
    // Don't throw error to prevent activity logging failures from breaking the request
  }
};

export default logActivity;

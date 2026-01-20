import { pool } from "../../config/db.js";

/**
 * GET ALL PROJECT MEMBER IDS (Helper)
 */
export const getProjectMemberIds = async (projectId) => {
  const [members] = await pool.query(
    `SELECT user_id FROM project_members WHERE project_id = ?`,
    [projectId]
  );
  return members.map((m) => m.user_id);
};

/**
 * GET PROJECT CREATOR ID
 */
export const getProjectCreatorId = async (projectId) => {
  const [rows] = await pool.query(
    `SELECT created_by FROM projects WHERE id = ?`,
    [projectId]
  );
  return rows.length ? rows[0].created_by : null;
};

/**
 * GET ALL SUPER ADMIN IDS
 */
export const getSuperAdminIds = async () => {
  const [admins] = await pool.query(
    `
    SELECT u.id 
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE r.name = 'SUPER_ADMIN'
    `
  );
  return admins.map((a) => a.id);
};

/**
 * CREATE NOTIFICATION (Reusable)
 * Handles bulk insert properly with mysql2
 */
export const createNotification = async ({
  userIds = null,   // null = all users, or array of user IDs
  title,
  message,
  type,
  entityType,
  entityId,
}) => {
  if (!userIds || userIds.length === 0) {
    // Broadcast notification - send to all users
    await pool.query(
      `
      INSERT INTO notifications 
      (user_id, title, message, type, entity_type, entity_id)
      VALUES (NULL, ?, ?, ?, ?, ?)
      `,
      [title, message, type, entityType, entityId]
    );
    return;
  }

  // Remove duplicates from userIds
  const uniqueUserIds = [...new Set(userIds)];

  // Insert for each specific user
  for (const userId of uniqueUserIds) {
    await pool.query(
      `
      INSERT INTO notifications 
      (user_id, title, message, type, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [userId, title, message, type, entityType, entityId]
    );
  }
};

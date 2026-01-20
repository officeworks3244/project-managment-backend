import { pool } from "../../config/db.js";
import { logActivity } from "../../utils/activityLogger.js";
import { createNotification, getProjectMemberIds, getProjectCreatorId, getSuperAdminIds } from "../services/notification.service.js";

/**
 * GET TASK COMMENTS (WITH REPLIES)
 * GET /tasks/:id/comments
 */
export const getTaskComments = async (req, res) => {
  const taskId = req.params.id;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        c.id,
        c.comment,
        c.parent_id,
        c.created_at,
        u.id AS user_id,
        u.name AS user_name
      FROM task_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
      `,
      [taskId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get comments error:", err);
    res.status(500).json({ message: "Failed to fetch comments" });
  }
};

/**
 * ADD TASK COMMENT OR REPLY
 * POST /tasks/:id/comments
 */
export const addTaskComment = async (req, res) => {
  const taskId = req.params.id;
  const { content, parent_id = null } = req.body;
  const userId = req.user.id;

  if (!content) {
    return res.status(400).json({ message: "Comment content is required" });
  }

  try {
    const [result] = await pool.query(
      `
      INSERT INTO task_comments (task_id, user_id, comment, parent_id)
      VALUES (?, ?, ?, ?)
      `,
      [taskId, userId, content, parent_id]
    );

    // Better activity log
    await logActivity(
      userId,
      parent_id ? "TASK_COMMENT_REPLIED" : "TASK_COMMENT_ADDED",
      "task",
      taskId
    );

    // 📢 Get task's project and send notification to members, super admins, and project creator (EXCLUDE commenter)
    const [taskData] = await pool.query(
      `SELECT project_id FROM tasks WHERE id = ?`,
      [taskId]
    );
    
    if (taskData.length && taskData[0].project_id) {
      const projectId = taskData[0].project_id;
      const projectMemberIds = await getProjectMemberIds(projectId);
      const projectCreatorId = await getProjectCreatorId(projectId);
      const superAdminIds = await getSuperAdminIds();
      
      const recipientIds = [
        ...projectMemberIds,
        ...superAdminIds,
        projectCreatorId
      ].filter((id, index, arr) => id !== userId && arr.indexOf(id) === index);
      
      if (recipientIds.length > 0) {
        await createNotification({
          userIds: recipientIds,
          title: "New comment added",
          message: `A new comment has been added to a task`,
          type: "COMMENT_ADDED",
          entityType: "TaskComment",
          entityId: result.insertId,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: parent_id
        ? "Reply added successfully"
        : "Comment added successfully",
    });
  } catch (err) {
    console.error("Add comment error:", err);
    res.status(500).json({ message: "Failed to add comment" });
  }
};





/**
 * DELETE COMMENT
 * DELETE /comments/:id
 */
export const deleteComment = async (req, res) => {
  const commentId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const [rows] = await pool.query(
      `
      SELECT user_id FROM task_comments WHERE id = ?
      `,
      [commentId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const comment = rows[0];

    // Permission check
    if (
      comment.user_id !== userId &&
      !["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"].includes(role)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    await pool.query(
      `DELETE FROM task_comments WHERE id = ?`,
      [commentId]
    );

    // Log activity
    await logActivity(userId, "DELETE", "TaskComment", commentId);

    res.json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (err) {
    console.error("Delete comment error:", err);
    res.status(500).json({ message: "Failed to delete comment" });
  }
};

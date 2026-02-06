import { pool } from "../../config/db.js";
import { logActivity } from "../../utils/activityLogger.js";
import { createNotification, getProjectMemberIds, getProjectCreatorId, getSuperAdminIds } from "../services/notification.service.js";

/**
 * GET PROJECT MEMBERS
 * GET /projects/:id/members
 */
export const getProjectMembers = async (req, res) => {
  const { id: projectId } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        pm.id,
        pm.project_role,
        pm.assigned_at,
        u.id AS user_id,
        u.name,
        u.email,
        r.name AS role
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      JOIN roles r ON r.id = u.role_id
      WHERE pm.project_id = ?
      ORDER BY pm.assigned_at ASC
      `,
      [projectId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Get project members error:", err);
    res.status(500).json({ message: "Failed to fetch project members" });
  }
};

/**
 * ADD PROJECT MEMBER
 * POST /projects/:id/members
 */
export const addProjectMember = async (req, res) => {
  const { id: projectId } = req.params;

  // ✅ Support both camelCase & snake_case
  const {
    user_id,
    userId,
    project_role,
    role,
  } = req.body;

  const finalUserId = user_id || userId;
  const finalProjectRole = project_role || role || "MEMBER";

  // 🔹 Validation
  if (!finalUserId) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }

  try {
    /* 🔹 Check project exists */
    const [project] = await pool.query(
      `SELECT id FROM projects WHERE id = ? LIMIT 1`,
      [projectId]
    );

    if (!project.length) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    /* 🔹 Check user exists & active */
    const [user] = await pool.query(
      `SELECT id FROM users WHERE id = ? AND status = 'active' LIMIT 1`,
      [finalUserId]
    );

    if (!user.length) {
      return res.status(404).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    /* 🔹 Prevent duplicate assignment */
    const [exists] = await pool.query(
      `
      SELECT id
      FROM project_members
      WHERE project_id = ? AND user_id = ?
      LIMIT 1
      `,
      [projectId, finalUserId]
    );

    if (exists.length) {
      return res.status(409).json({
        success: false,
        message: "User already assigned to this project",
      });
    }

    /* 🔹 Insert member */
    const [result] = await pool.query(
      `
      INSERT INTO project_members (project_id, user_id, project_role)
      VALUES (?, ?, ?)
      `,
      [projectId, finalUserId, finalProjectRole.toUpperCase()]
    );

    // Log activity
    await logActivity(req.user.id, "CREATE", "ProjectMember", result.insertId);

    // 📢 Send notification to all members, super admins, and project creator (EXCLUDE performer)
    const projectMemberIds = await getProjectMemberIds(projectId);
    const projectCreatorId = await getProjectCreatorId(projectId);
    const superAdminIds = await getSuperAdminIds();
    
    const recipientIds = [
      ...projectMemberIds,
      ...superAdminIds,
      projectCreatorId
    ].filter((id, index, arr) => id !== req.user.id && arr.indexOf(id) === index);
    
    if (recipientIds.length > 0) {
      await createNotification({
        userIds: recipientIds,
        title: "New member added",
        message: `A new member has been added to the project`,
        type: "MEMBER_ADDED",
        entityType: "ProjectMember",
        entityId: result.insertId,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Member added to project successfully",
    });
  } catch (err) {
    console.error("Add project member error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add project member",
    });
  }
};


/**
 * REMOVE PROJECT MEMBER
 * DELETE /projects/:id/members/:userId
 */
export const removeProjectMember = async (req, res) => {
  const { id: projectId, userId } = req.params;

  try {
    const [exists] = await pool.query(
      `
      SELECT id FROM project_members
      WHERE project_id = ? AND user_id = ?
      `,
      [projectId, userId]
    );

    if (!exists.length) {
      return res.status(404).json({ message: "Project member not found" });
    }

    const memberRecord = exists[0];

    await pool.query(
      `
      DELETE FROM project_members
      WHERE project_id = ? AND user_id = ?
      `,
      [projectId, userId]
    );

    // Log activity
    await logActivity(req.user.id, "DELETE", "ProjectMember", memberRecord.id);

    // 🔔 Notify removed member
    const [projectRows] = await pool.query(
      `SELECT name FROM projects WHERE id = ? LIMIT 1`,
      [projectId]
    );
    const projectName = projectRows.length ? projectRows[0].name : "project";

    await createNotification({
      userIds: [Number(userId)],
      title: "Removed from project",
      message: `You have been removed from "${projectName}"`,
      type: "MEMBER_REMOVED",
      entityType: "ProjectMember",
      entityId: memberRecord.id,
    });

    res.json({
      success: true,
      message: "Member removed from project successfully",
    });
  } catch (err) {
    console.error("Remove project member error:", err);
    res.status(500).json({ message: "Failed to remove project member" });
  }
};

import { pool } from "../../config/db.js";
import { logActivity } from "../../utils/activityLogger.js";
import { createNotification, getProjectMemberIds, getSuperAdminIds } from "../services/notification.service.js";


export const getProjects = async (req, res) => {
  const userId = req.user.id;
  const permissions = req.user.permissions || [];

  const canViewAll = permissions.includes("projects.view.all");
  const canViewOwn = permissions.includes("projects.view");

  if (!canViewAll && !canViewOwn) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to view projects",
    });
  }

  try {
    let query = `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.status,
        p.priority,
        p.start_date,
        p.end_date,
        p.progress,
        p.created_at,

        u.id   AS created_by_id,
        u.name AS created_by_name,

        (
          SELECT COUNT(*)
          FROM project_members pm
          WHERE pm.project_id = p.id
        ) AS member_count,

        (
          SELECT COUNT(*)
          FROM tasks t
          WHERE t.project_id = p.id
        ) AS task_count

      FROM projects p
      JOIN users u ON u.id = p.created_by
    `;

    const params = [];

    if (!canViewAll) {
      query += `
        WHERE 
          p.created_by = ?
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id
            AND pm.user_id = ?
          )
      `;
      params.push(userId, userId);
    }

    query += ` ORDER BY p.created_at DESC`;

    const [rows] = await pool.query(query, params);

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("Get projects error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch projects",
    });
  }
};


/**
 * GET PROJECT DETAIL (COUNTS ONLY)
 * GET /projects/:id
 */
export const getProjectById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.status,
        p.priority,
        p.start_date,
        p.end_date,
        p.progress,
        p.created_at,

        u.id   AS created_by_id,
        u.name AS created_by_name,

        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS task_count

      FROM projects p
      JOIN users u ON u.id = p.created_by
      WHERE p.id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("Get project error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch project",
    });
  }
};




/**
 * CREATE PROJECT
 * POST /projects
 */
export const createProject = async (req, res) => {
  const { name, description, status, priority, start_date, end_date } = req.body;

  if (!name || !start_date) {
    return res.status(400).json({
      message: "Project name and start date are required",
    });
  }

  try {
    const [result] = await pool.query(
      `
      INSERT INTO projects
        (name, description, status, priority, start_date, end_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        description || null,
        status || "Active",
        priority || "Medium",
        start_date,
        end_date || null,
        req.user.id,
      ]
    );

    await logActivity(req.user.id, "PROJECT_CREATED", "Project", result.insertId);

    // 📢 Send notification only to super admins (exclude creator)
    const superAdminIds = await getSuperAdminIds();
    const recipientIds = superAdminIds.filter(id => id !== req.user.id);
    
    if (recipientIds.length > 0) {
      await createNotification({
        userIds: recipientIds,
        title: "New project created",
        message: `${req.user.name} created project "${name}"`,
        type: "PROJECT_CREATED",
        entityType: "Project",
        entityId: result.insertId,
      });
    }

    res.status(201).json({
      success: true,
      message: "Project created successfully",
    });
  } catch (err) {
    console.error("Create project error:", err);
    res.status(500).json({
      message: "Failed to create project",
    });
  }
};


/**
 * UPDATE PROJECT
 * PUT /projects/:id
 */
export const updateProject = async (req, res) => {
  const { id } = req.params;
  const { name, description, status, priority, start_date, end_date } = req.body;

  try {
    const [project] = await pool.query(
      `SELECT id FROM projects WHERE id = ?`,
      [id]
    );

    if (!project.length) {
      return res.status(404).json({ message: "Project not found" });
    }

    await pool.query(
      `
      UPDATE projects
      SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date)
      WHERE id = ?
      `,
      [name, description, status, priority, start_date, end_date, id]
    );

    await logActivity(req.user.id, "PROJECT_UPDATED", "Project", id);

    // 📢 Send notification to members, super admins, and project creator (EXCLUDE performer)
    const memberIds = await getProjectMemberIds(id);
    const superAdminIds = await getSuperAdminIds();
    const [projectData] = await pool.query(
      `SELECT created_by, name FROM projects WHERE id = ?`,
      [id]
    );
    
    const projectName = name || projectData[0].name || "Project";
    
    const recipientIds = [
      ...memberIds,
      ...superAdminIds,
      projectData[0].created_by
    ].filter((id, index, arr) => id !== req.user.id && arr.indexOf(id) === index);
    
    if (recipientIds.length > 0) {
      await createNotification({
        userIds: recipientIds,
        title: "Project updated",
        message: `Project "${projectName}" has been updated`,
        type: "PROJECT_UPDATED",
        entityType: "Project",
        entityId: id,
      });
    }

    res.json({
      success: true,
      message: "Project updated successfully",
    });
  } catch (err) {
    console.error("Update project error:", err);
    res.status(500).json({ message: "Failed to update project" });
  }
};


/**
 * DELETE PROJECT
 * DELETE /projects/:id
 */
export const deleteProject = async (req, res) => {
  const { id } = req.params;

  try {
    const [project] = await pool.query(
      `SELECT id FROM projects WHERE id = ?`,
      [id]
    );

    if (!project.length) {
      return res.status(404).json({ message: "Project not found" });
    }

    await pool.query(`DELETE FROM projects WHERE id = ?`, [id]);

    await logActivity(req.user.id, "PROJECT_DELETED", "Project", id);

    res.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (err) {
    console.error("Delete project error:", err);
    res.status(500).json({ message: "Failed to delete project" });
  }
};



/**
 * GET PROJECTS BY USER
 * GET /users/:userId/projects
 */
export const getProjectsByUserId = async (req, res) => {
  const { userId } = req.params;
  const loggedInUserId = req.user.id;
  const role = req.user.role;

  if (!["SUPER_ADMIN", "ADMIN"].includes(role) && Number(userId) !== loggedInUserId) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.status,
        p.priority,
        p.start_date,
        p.end_date,
        p.progress,
        p.created_at,

        u.id   AS created_by_id,
        u.name AS created_by_name,

        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count

      FROM project_members pm
      JOIN projects p ON p.id = pm.project_id
      JOIN users u ON u.id = p.created_by
      WHERE pm.user_id = ?
      ORDER BY p.created_at DESC
      `,
      [userId]
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("Get projects by user error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user projects",
    });
  }
};


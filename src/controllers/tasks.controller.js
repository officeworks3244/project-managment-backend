import { pool } from "../../config/db.js";
import { logActivity } from "../../utils/activityLogger.js";
import { createNotification, getProjectMemberIds, getProjectCreatorId, getSuperAdminIds } from "../services/notification.service.js";


/**
 * GET TASKS (Permission Based)
 * GET /tasks
 */
export const getAllTasks = async (req, res) => {
  const userId = req.user.id;
  const permissions = req.user.permissions || [];
  const role = req.user.role; // "super_admin"

  const canViewAll =
    role === "super_admin" || permissions.includes("tasks.view.all");

  try {
    let query = `
      SELECT DISTINCT
        t.id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.due_date,
        t.created_at,

        -- Project
        p.id   AS project_id,
        p.name AS project_name,

        -- Assigned user
        u.id   AS assigned_user_id,
        u.name AS assigned_user_name,
        u.profile_image AS assigned_user_profile_image

      FROM tasks t
      LEFT JOIN projects p 
        ON p.id = t.project_id
      LEFT JOIN users u 
        ON u.id = t.assigned_to
    `;

    const params = [];

    // 🔐 Restrict normal users
    if (!canViewAll) {
      query += `
        WHERE 
          t.assigned_to = ?
          OR t.project_id IN (
            SELECT project_id
            FROM project_members
            WHERE user_id = ?
          )
      `;
      params.push(userId, userId);
    }

    query += `
      ORDER BY t.created_at DESC
    `;

    const [rows] = await pool.query(query, params);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {
    console.error("Get tasks error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tasks"
    });
  }
};



/**
 * GET LOGGED-IN USER TASKS
 * GET /tasks/my
 */
export const getMyTasks = async (req, res) => {
  const userId = req.user.id;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        t.*,

        -- Project
        p.name AS project_name,

        -- Assigned user
        u.id   AS assigned_to_id,
        u.name AS assigned_to_name,
        u.profile_image AS assigned_to_profile_image

      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assigned_to

      WHERE t.assigned_to = ?
      ORDER BY t.due_date ASC
      `,
      [userId]
    );

    // ✅ NO baseUrl, NO path modify
    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("Get my tasks error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your tasks"
    });
  }
};



/**
 * GET TASK DETAIL
 * GET /tasks/:id
 */
export const getTaskById = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        t.id AS task_id,
        t.project_id,
        t.assigned_to,
        t.title,
        t.description,
        t.priority,
        t.status,
        t.due_date,
        t.created_at,

        u.name AS assigned_user,

        p.name AS project_name,
        p.status AS project_status,
        p.created_by AS project_owner,

        pm.user_id AS is_project_member
      FROM tasks t
      INNER JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN project_members pm 
        ON pm.project_id = t.project_id 
        AND pm.user_id = ?
      WHERE t.id = ?
      `,
      [userId, id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found" });
    }

    const row = rows[0];

    // 🔐 ACCESS CHECK (FINAL & CORRECT)
    const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(role);
    const isAssigned = row.assigned_to === userId;
    const isProjectMember = !!row.is_project_member;
    const isProjectOwner = row.project_owner === userId;

    if (!isAdmin && !isAssigned && !isProjectMember && !isProjectOwner) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json({
      success: true,
      data: {
        task: {
          id: row.task_id,
          title: row.title,
          description: row.description,
          priority: row.priority,
          status: row.status,
          due_date: row.due_date,
          assigned_to: row.assigned_to,
          assigned_user: row.assigned_user
        },
        project: {
          name: row.project_name,
          status: row.project_status
        }
      }
    });
  } catch (err) {
    console.error("Get task error:", err);
    res.status(500).json({ message: "Failed to fetch task" });
  }
};


/**
 * CREATE TASK
 * POST /tasks
 */
export const createTask = async (req, res) => {
  const {
    project_id,
    assigned_to,
    title,
    description,
    priority,
    status,
    due_date,
  } = req.body;

  if (!project_id || !title) {
    return res.status(400).json({
      success: false,
      message: "Project and title are required",
    });
  }

  try {
    const [result] = await pool.query(
      `
      INSERT INTO tasks
      (project_id, assigned_to, title, description, priority, status, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        project_id,
        assigned_to ?? null,   // ✅ SAFE
        title,
        description ?? null,
        priority ?? "MEDIUM",
        status ?? "TODO",
        due_date ?? null,
      ]
    );

    // Log activity
    await logActivity(req.user.id, "CREATE", "Task", result.insertId);

    // 📢 Send notification to project members and super admins (EXCLUDE creator)
    const projectMemberIds = await getProjectMemberIds(project_id);
    const superAdminIds = await getSuperAdminIds();
    
    // Combine members and admins, exclude creator
    const recipientIds = [
      ...projectMemberIds,
      ...superAdminIds
    ].filter(id => id !== req.user.id);
    
    if (recipientIds.length > 0) {
      await createNotification({
        userIds: recipientIds,
        title: "New task created",
        message: `New task "${title}" has been created in your project`,
        type: "TASK_CREATED",
        entityType: "Task",
        entityId: result.insertId,
      });
    }

    res.status(201).json({
      success: true,
      message: "Task created successfully",
    });
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create task",
    });
  }
};


/**
 * UPDATE TASK
 * PUT /tasks/:id
 */
export const updateTask = async (req, res) => {
  const { id } = req.params;

  try {
    // Get previous task data for assignment change detection AND project_id
    const [previousTask] = await pool.query(
      `SELECT assigned_to, project_id FROM tasks WHERE id = ?`,
      [id]
    );

    if (!previousTask.length) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const previousAssignedTo = previousTask[0].assigned_to;
    const projectId = previousTask[0].project_id;

    const data = { ...req.body };

    // 🔧 FIX: map assignee_id → assigned_to
    if (data.assignee_id !== undefined) {
      data.assigned_to = data.assignee_id;
      delete data.assignee_id;
    }

    const [result] = await pool.query(
      `
      UPDATE tasks
      SET ?
      WHERE id = ?
      `,
      [data, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Log activity
    await logActivity(req.user.id, "UPDATE", "Task", id);

    // 📢 Send notification to project members, super admins, and project creator (EXCLUDE performer)
    const projectMemberIds = await getProjectMemberIds(projectId);
    const projectCreatorId = await getProjectCreatorId(projectId);
    const superAdminIds = await getSuperAdminIds();
    
    // Combine all recipients and exclude the person performing the operation
    const recipientIds = [
      ...projectMemberIds,
      ...superAdminIds,
      projectCreatorId
    ].filter((id, index, arr) => id !== req.user.id && arr.indexOf(id) === index);
    
    if (recipientIds.length > 0) {
      await createNotification({
        userIds: recipientIds,
        title: "Task updated",
        message: `A task has been updated in your project`,
        type: "TASK_UPDATED",
        entityType: "Task",
        entityId: id,
      });
    }

    // Handle task assignment notifications (specific to assigned user)
    if (data.assigned_to !== undefined && data.assigned_to !== previousAssignedTo) {
      // Task assigned to someone
      if (data.assigned_to) {
        await createNotification({
          userIds: [data.assigned_to],
          title: "Task assigned",
          message: `You have been assigned a new task`,
          type: "TASK_ASSIGNED",
          entityType: "Task",
          entityId: id,
        });
      }

      // Task unassigned from someone
      if (previousAssignedTo) {
        await createNotification({
          userIds: [previousAssignedTo],
          title: "Task unassigned",
          message: `You have been unassigned from a task`,
          type: "TASK_UNASSIGNED",
          entityType: "Task",
          entityId: id,
        });
      }
    }

    res.json({
      success: true,
      message: "Task updated successfully",
    });
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update task",
    });
  }
};

/**
 * DELETE TASK
 * DELETE /tasks/:id
 */
export const deleteTask = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `DELETE FROM tasks WHERE id = ?`,
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Log activity
    await logActivity(req.user.id, "DELETE", "Task", id);

    res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (err) {
    console.error("Delete task error:", err);
    res.status(500).json({ message: "Failed to delete task" });
  }
};

/**
 * UPDATE TASK STATUS
 * PATCH /tasks/:id/status
 */
export const updateTaskStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!status) {
    return res.status(400).json({ message: "Status is required" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT assigned_to FROM tasks WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found" });
    }

    const task = rows[0];

    // Access check
    if (
      !["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"].includes(role) &&
      task.assigned_to !== userId
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    await pool.query(
      `UPDATE tasks SET status = ? WHERE id = ?`,
      [status, id]
    );

    // Log activity
    await logActivity(req.user.id, "UPDATE", "Task", id);

    res.json({
      success: true,
      message: "Task status updated successfully",
    });
  } catch (err) {
    console.error("Update task status error:", err);
    res.status(500).json({ message: "Failed to update task status" });
  }
};

/**
 * UPDATE TASK PRIORITY
 * PATCH /tasks/:id/priority
 */
export const updateTaskPriority = async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!priority) {
    return res.status(400).json({ message: "Priority is required" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT assigned_to FROM tasks WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found" });
    }

    const task = rows[0];

    // Access check
    if (
      !["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"].includes(role) &&
      task.assigned_to !== userId
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    await pool.query(
      `UPDATE tasks SET priority = ? WHERE id = ?`,
      [priority, id]
    );

    // Log activity
    await logActivity(req.user.id, "UPDATE", "Task", id);

    res.json({
      success: true,
      message: "Task priority updated successfully",
    });
  } catch (err) {
    console.error("Update task priority error:", err);
    res.status(500).json({ message: "Failed to update task priority" });
  }
};


/**
 * GET TASKS BY USER
 * GET /users/:userId/tasks
 */
export const getTasksByUserId = async (req, res) => {
  const { userId } = req.params;
  const loggedInUserId = req.user.id;
  const role = req.user.role;

  try {
    /* 🔐 Access control */
    if (
      !["SUPER_ADMIN", "ADMIN"].includes(role) &&
      Number(userId) !== loggedInUserId
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    /* 🔹 Fetch tasks */
    const [rows] = await pool.query(
      `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.priority,
        t.status,
        t.due_date,
        t.created_at,
        p.name AS project_name
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.assigned_to = ?
      ORDER BY t.created_at DESC
      `,
      [userId]
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Get tasks by user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user tasks",
    });
  }
};



/**
 * GET TASKS BY PROJECT
 * GET /projects/:projectId/tasks
 */
export const getTasksByProjectId = async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    // 🔹 Check project exists
    const [project] = await pool.query(
      `SELECT id, name, created_by FROM projects WHERE id = ?`,
      [projectId]
    );

    if (!project.length) {
      return res.status(404).json({ message: "Project not found" });
    }

    const projectCreator = project[0].created_by;

    // 🔐 ACCESS CHECK
    let isAllowed = ["SUPER_ADMIN", "ADMIN"].includes(role);

    if (!isAllowed) {
      if (projectCreator === userId) {
        isAllowed = true;
      } else {
        const [member] = await pool.query(
          `
          SELECT 1
          FROM project_members
          WHERE project_id = ? AND user_id = ?
          `,
          [projectId, userId]
        );
        isAllowed = member.length > 0;
      }
    }

    if (!isAllowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    // ✅ Get tasks (STRICTLY by project_id)
    const [tasks] = await pool.query(
      `
      SELECT
        t.id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.due_date,
        t.created_at,

        p.id AS project_id,
        p.name AS project_name,

        u.id AS assigned_user_id,
        u.name AS assigned_user_name

      FROM tasks t
      INNER JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assigned_to

      WHERE t.project_id = ?
      ORDER BY t.created_at DESC
      `,
      [projectId]
    );

    res.json({
      success: true,
      count: tasks.length,
      data: tasks
    });

  } catch (err) {
    console.error("Get tasks by project error:", err);
    res.status(500).json({ message: "Failed to fetch project tasks" });
  }
};
``

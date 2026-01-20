import { pool } from "../../config/db.js";


export const getCalendarByRange = async (req, res) => {
  const user_id = req.user.id;
  const { start_date, end_date } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({
      message: "start_date and end_date are required"
    });
  }

  const canViewAllCalendar = req.user.permissions.includes("calendar.view.all");
  const role = req.user.role; // "SUPER_ADMIN", "ADMIN", etc.

  try {
    let projects = [];

    // ==========================
    // 📁 PROJECTS
    // ==========================
    if (canViewAllCalendar || role === "SUPER_ADMIN") {
      // 🔓 Admin / SuperAdmin - see all
      [projects] = await pool.query(
        `
        SELECT id, name, description, status, start_date, end_date, progress
        FROM projects
        WHERE start_date <= ?
          AND end_date >= ?
        `,
        [end_date, start_date]
      );
    } else {
      // 🔒 Normal user - see own created or member projects
      [projects] = await pool.query(
        `
        SELECT 
          p.id, p.name, p.description, p.status,
          p.start_date, p.end_date, p.progress
        FROM projects p
        WHERE (
          p.created_by = ?
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id
            AND pm.user_id = ?
          )
        )
        AND p.start_date <= ?
        AND p.end_date >= ?
        `,
        [user_id, user_id, end_date, start_date]
      );
    }

    if (!projects.length) {
      return res.json({
        success: true,
        role_scope: canViewAllCalendar || role === "SUPER_ADMIN" ? "ALL" : "ASSIGNED",
        data: []
      });
    }

    // ==========================
    // 📝 TASKS (only project tasks)
    // ==========================
    const projectIds = projects.map(p => p.id);

    const [tasks] = await pool.query(
      `
      SELECT 
        id, project_id, title, description,
        priority, status, due_date
      FROM tasks
      WHERE project_id IN (?)
        AND due_date BETWEEN ? AND ?
      `,
      [projectIds, start_date, end_date]
    );

    // ==========================
    // 📦 MERGE DATA
    // ==========================
    const data = projects.map(project => ({
      ...project,
      tasks: tasks.filter(t => t.project_id === project.id)
    }));

    res.json({
      success: true,
      role_scope: canViewAllCalendar || role === "SUPER_ADMIN" ? "ALL" : "ASSIGNED",
      total_projects: data.length,
      data
    });

  } catch (err) {
    console.error("Calendar API error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

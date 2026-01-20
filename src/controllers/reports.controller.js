import { pool } from "../../config/db.js";

/**
 * DASHBOARD STATS (Permission Based)
 * GET /reports/dashboard
 */
export const dashboardStats = async (req, res) => {
  try {
    const perms = req.user.permissions || [];

    const can = (p) => perms.includes(p);

    const data = {};

    // =====================
    // TOTAL / ACTIVE PROJECTS
    // =====================
    if (can("dashboard.view.total_projects")) {
      const [[projects]] = await pool.query(`
        SELECT 
          COUNT(*) total,
          SUM(status = 'active') active
        FROM projects
      `);

      data.projects = {
        total: projects.total,
        active: projects.active,
      };
    }

    // =====================
    // TASKS (TOTAL + THIS MONTH)
    // =====================
    if (can("dashboard.view.tasks")) {
      const [[tasks]] = await pool.query(`
        SELECT 
          COUNT(*) total,
          SUM(created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) thisMonth
        FROM tasks
      `);

      data.tasks = {
        total: tasks.total,
        thisMonth: tasks.thisMonth,
      };
    }

    // =====================
    // OVERDUE TASKS
    // =====================
    if (can("dashboard.view.overdue")) {
      const [[overdue]] = await pool.query(`
        SELECT COUNT(*) overdue
        FROM tasks
        WHERE status != 'DONE' AND due_date < NOW()
      `);

      data.overdueTasks = overdue.overdue;
    }

    // =====================
    // TEAM MEMBERS / ONLINE
    // =====================
    if (can("dashboard.view.team") || can("dashboard.view.online_users")) {
      const [[users]] = await pool.query(`
        SELECT 
          COUNT(DISTINCT u.id) total,
          SUM(u.login_at >= NOW() - INTERVAL 15 MINUTE) online
        FROM users u
        INNER JOIN project_members pm ON pm.user_id = u.id
        WHERE u.status = 'active'
      `);

      data.teamMembers = {};

      if (can("dashboard.view.team")) {
        data.teamMembers.total = users.total;
      }

      if (can("dashboard.view.online_users")) {
        data.teamMembers.online = users.online;
      }
    }

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({
      success: false,
      message: "Dashboard load failed",
    });
  }
};



/**
 * PROJECT PROGRESS
 * GET /reports/project-progress
 */
export const projectProgress = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.status,
        COUNT(t.id) total_tasks,
        SUM(t.status = 'DONE') completed_tasks,
        IF(
          COUNT(t.id) = 0, 0,
          ROUND((SUM(t.status = 'DONE') / COUNT(t.id)) * 100)
        ) AS progress
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id
      ORDER BY progress DESC
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Project progress error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch progress" });
  }
};


/**
 * TEAM PERFORMANCE
 * GET /reports/team-performance
 */
export const teamPerformance = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        u.id,
        u.name,
        COUNT(t.id) total_tasks,
        SUM(t.status = 'DONE') completed_tasks,
        IF(
          COUNT(t.id) = 0, 0,
          ROUND((SUM(t.status = 'DONE') / COUNT(t.id)) * 100)
        ) AS completion_rate
      FROM users u
      LEFT JOIN tasks t ON t.assigned_to = u.id
      WHERE u.status = 'active'
      GROUP BY u.id
      ORDER BY completed_tasks DESC
      LIMIT 10
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Team performance error:", err);
    res.status(500).json({ success: false });
  }
};


/**
 * TASK SUMMARY
 * GET /reports/task-summary
 */
export const taskSummary = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        status,
        COUNT(*) count
      FROM tasks
      GROUP BY status
      `
    );

    const [priority] = await pool.query(
      `
      SELECT 
        priority,
        COUNT(*) count
      FROM tasks
      GROUP BY priority
      `
    );

    res.json({
      byStatus: rows,
      byPriority: priority,
    });
  } catch (err) {
    console.error("Task summary error:", err);
    res.status(500).json({ message: "Failed to fetch task summary" });
  }
};


/**
 * TASK DISTRIBUTION
 * GET /reports/task-distribution
 */
export const taskDistribution = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        LOWER(status) status,
        COUNT(*) count
      FROM tasks
      GROUP BY status
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Task distribution error:", err);
    res.status(500).json({ success: false });
  }
};


/**
 * TASK ACTIVITY (MONTHLY)
 * GET /reports/task-activity
 */
export const taskActivity = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE_FORMAT(created_at, '%b') month,
        COUNT(*) created,
        SUM(status = 'DONE') completed
      FROM tasks
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY MONTH(created_at)
      ORDER BY created_at
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Task activity error:", err);
    res.status(500).json({ success: false });
  }
};

import express from "express";
import {
  dashboardStats,
  projectProgress,
  taskDistribution,
  taskActivity,
  teamPerformance,
  
} from "../controllers/reports.controller.js";

import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

const router = express.Router();

/**
 * DASHBOARD MAIN STATS
 * GET /reports/dashboard
 */
router.get(
  "/reports/dashboard",
  requireAuth,
  requirePermission("dashboard.stats.view"),
  dashboardStats
);

/**
 * PROJECT PROGRESS (View All)
 * GET /reports/project-progress
 */
router.get(
  "/reports/project-progress",
  requireAuth,
  requirePermission("dashboard.project_progress"),
  projectProgress
);

/**
 * TASK DISTRIBUTION (Done / Todo / Blocked)
 * GET /reports/task-distribution
 */
router.get(
  "/reports/task-distribution",
  requireAuth,
  requirePermission("dashboard.task_charts"),
  taskDistribution
);

/**
 * TASK ACTIVITY (Completed vs Created Chart)
 * GET /reports/task-activity
 */
router.get(
  "/reports/task-activity",
  requireAuth,
  requirePermission("dashboard.task_charts"),
  taskActivity
);

/**
 * TEAM PERFORMANCE (Leaderboard)
 * GET /reports/team-performance
 */
router.get(
  "/reports/team-performance",
  requireAuth,
  requirePermission("dashboard.team_performance"),
  teamPerformance
);



export default router;

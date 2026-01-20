import { pool } from "../../config/db.js";
import { createNotification, getProjectMemberIds } from "./notification.service.js";

/**
 * CHECK FOR PROJECTS STARTING TODAY AND SEND NOTIFICATIONS
 * Runs daily to notify members when their project starts
 */
export const checkAndNotifyProjectStart = async () => {
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // Get all projects that are starting today
    const [projects] = await pool.query(
      `
      SELECT 
        id,
        name,
        created_by
      FROM projects
      WHERE DATE(start_date) = ?
      AND status != 'Cancelled'
      `,
      [today]
    );

    // Send notifications for each project
    for (const project of projects) {
      const projectName = project.name || "Unnamed Project";
      const projectMemberIds = await getProjectMemberIds(project.id);
      
      // Send notification to all members
      if (projectMemberIds.length > 0) {
        await createNotification({
          userIds: projectMemberIds,
          title: "Project started",
          message: `Project "${projectName}" has started today`,
          type: "PROJECT_STARTED",
          entityType: "Project",
          entityId: project.id,
        });
      }

      // Also send to project creator if not already in members
      if (
        project.created_by &&
        !projectMemberIds.includes(project.created_by)
      ) {
        await createNotification({
          userIds: [project.created_by],
          title: "Project started",
          message: `Your project "${projectName}" has started today`,
          type: "PROJECT_STARTED",
          entityType: "Project",
          entityId: project.id,
        });
      }
    }

    if (projects.length > 0) {
      console.log(
        `✅ Project start notifications sent for ${projects.length} project(s)`
      );
    }
  } catch (err) {
    console.error("❌ Error checking project start:", err);
  }
};

/**
 * SCHEDULE PROJECT START NOTIFICATIONS
 * Runs daily at a specific time (default: 6:00 AM)
 */
export const scheduleProjectStartNotifications = () => {
  // Run immediately once
  checkAndNotifyProjectStart();

  // Then run daily - every 24 hours
  setInterval(() => {
    checkAndNotifyProjectStart();
  }, 24 * 60 * 60 * 1000); // Every 24 hours

  console.log("📅 Project start notification scheduler initialized");
};

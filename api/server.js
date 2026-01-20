import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// routes
import authRoutes from "../src/routes/auth.routes.js";
import rolesRoutes from "../src/routes/roles.routes.js";
import permissionsRoutes from "../src/routes/permissions.routes.js";
import userPermissionsRoutes from "../src/routes/rolePermissions.routes.js";
import usersRoutes from "../src/routes/users.routes.js";
import projectsRoutes from "../src/routes/projects.routes.js";
import projectMembersRoutes from "../src/routes/projectMembers.routes.js";
import tasksRoutes from "../src/routes/tasks.routes.js";
import taskCommentsRoutes from "../src/routes/taskComments.routes.js";
import filesRoutes from "../src/routes/files.routes.js";
import reportsRoutes from "../src/routes/reports.routes.js";
import profileRoutes from "../src/routes/profile.routes.js";
import activityLogsRoutes from "../src/routes/activityLogs.routes.js";
import notificationRoutes from "../src/routes/notification.routes.js";
import calendargRoutes from "../src/routes/calendar.routes.js";
import mailRoutes from "../src/routes/mails.routes.js";

dotenv.config();

const app = express();

// __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
  origin: [
    "http://localhost:8080",
    "https://zenith-board-hub.lovable.app",
    "https://orbit-grid-suite.lovable.app"
  ],
  credentials: true
}));

app.use(express.json());

// static uploads
app.use("/api/uploads", express.static(path.join(__dirname, "../src/uploads")));

// health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// routes
app.use("/api/auth", authRoutes);
app.use("/api/role", rolesRoutes);
app.use("/api/permissioins", permissionsRoutes);
app.use("/api", userPermissionsRoutes);
app.use("/api", notificationRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/project", projectsRoutes);
app.use("/api/project", projectMembersRoutes);
app.use("/api/task", tasksRoutes);
app.use("/api/taskcomment", taskCommentsRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/report", reportsRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/activitylog", activityLogsRoutes);
app.use("/api", calendargRoutes);
app.use("/api/mails", mailRoutes);

// 🚀 VERY IMPORTANT
export default app;

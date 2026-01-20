import { pool } from "../../config/db.js";
import fs from "fs";
import path from "path";
import { logActivity } from "../../utils/activityLogger.js";
import { createNotification, getProjectMemberIds, getProjectCreatorId, getSuperAdminIds } from "../services/notification.service.js";

/**
 * UPLOAD FILE
 * POST /files/upload
 */
export const uploadFile = async (req, res) => {
  const { related_type, related_id, file_name, description } = req.body;
  const userId = req.user.id;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  if (!related_type || !related_id) {
    return res.status(400).json({
      success: false,
      message: "related_type and related_id are required",
    });
  }

  try {
    // Normalize path (Windows fix)
    const filePath = req.file.path.replace(/\\/g, "/");

    // Detect folder from path (images / documents / others)
    const folder = filePath.includes("/images/")
      ? "images"
      : filePath.includes("/documents/")
      ? "documents"
      : "others";

    // ✅ PUBLIC URL (served by express.static)
    const fileUrl = `/uploads/${folder}/${req.file.filename}`;

    const fileName = file_name || req.file.originalname;
    const fileSize = req.file.size;
    const fileType = req.file.mimetype;

    const [result] = await pool.query(
      `
      INSERT INTO files (
        related_type,
        related_id,
        file_name,
        file_path,
        file_url,
        file_size,
        file_type,
        description,
        uploaded_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        related_type,
        related_id,
        fileName,
        filePath,   // server path
        fileUrl,    // browser path
        fileSize,
        fileType,
        description || null,
        userId,
      ]
    );

    // Log activity
    await logActivity(userId, "CREATE", "File", result.insertId);

    // 📢 Get project ID and send notification to project members, super admins, and project creator (EXCLUDE uploader)
    let projectId = null;
    if (related_type === "PROJECT") {
      projectId = related_id;
    } else if (related_type === "TASK") {
      const [task] = await pool.query(
        `SELECT project_id FROM tasks WHERE id = ?`,
        [related_id]
      );
      projectId = task.length ? task[0].project_id : null;
    }

    if (projectId) {
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
          title: "File uploaded",
          message: `File "${fileName}" has been uploaded to your project`,
          type: "FILE_UPLOADED",
          entityType: "File",
          entityId: result.insertId,
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        id: result.insertId,
        name: fileName,
        file_url: fileUrl,
        file_size: fileSize,
        file_type: fileType,
      },
    });
  } catch (err) {
    console.error("Upload file error:", err);
    return res.status(500).json({
      success: false,
      message: "File upload failed",
    });
  }
};

/**
 * GET FILES BY RELATED ID (task_id or project_id)
 * GET /files/:related_id
 */
export const getFilesByRelatedId = async (req, res) => {
  const relatedId = req.params.related_id;

  try {
    const [files] = await pool.query(
      `
      SELECT 
        f.id,
        f.file_name AS name,
        f.file_name,
        f.file_path,
        f.file_url,
        f.file_size,
        f.file_type,
        f.description,
        f.uploaded_by,
        f.uploaded_at AS created_at,
        u.name AS uploaded_by_name
      FROM files f
      LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.related_id = ?
      ORDER BY f.uploaded_at DESC
      `,
      [relatedId]
    );

    res.json({
      success: true,
      data: files
    });
  } catch (err) {
    console.error("Get files error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch files" 
    });
  }
};

/**
 * GET SINGLE FILE INFO
 * GET /file/:id
 */
export const getFileById = async (req, res) => {
  const fileId = req.params.id;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        f.*,
        u.name AS uploaded_by_name
      FROM files f
      LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.id = ?
      `,
      [fileId]
    );

    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: "File not found" 
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error("Get file error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch file" 
    });
  }
};

/**
 * DELETE FILE
 * DELETE /files/:id
 */
export const deleteFile = async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const [rows] = await pool.query(
      `SELECT * FROM files WHERE id = ?`,
      [fileId]
    );

    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: "File not found" 
      });
    }

    const file = rows[0];

    // Check permission
    if (
      file.uploaded_by !== userId &&
      !["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"].includes(role)
    ) {
      return res.status(403).json({ 
        success: false,
        message: "Access denied" 
      });
    }

    // Delete from disk
    const filePath = file.file_path || file.file_url;
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await pool.query(`DELETE FROM files WHERE id = ?`, [fileId]);

    // Log activity
    await logActivity(userId, "DELETE", "File", fileId);

    res.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (err) {
    console.error("Delete file error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to delete file" 
    });
  }
};
import { pool } from "../../config/db.js";
import { logActivity } from "../../utils/activityLogger.js";

/**
 * GET ALL PERMISSIONS
 * GET /permissions
 */
export const getPermissions = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        id,
        name,
        description
      FROM permissions
      ORDER BY name ASC
      `
    );

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("Get permissions error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch permissions",
    });
  }
};



/**
 * CREATE PERMISSION
 * POST /permissions
 */
export const createPermission = async (req, res) => {
  let { name, description } = req.body;

  /* 🔹 Validation */
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Permission name is required",
    });
  }

  name = name.trim().toLowerCase();

  try {
    /* 🔹 Check duplicate */
    const [existing] = await pool.query(
      `
      SELECT id 
      FROM permissions 
      WHERE name = ? 
      LIMIT 1
      `,
      [name]
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Permission already exists",
      });
    }

    /* 🔹 Insert permission */
    const [result] = await pool.query(
      `
      INSERT INTO permissions (name, description)
      VALUES (?, ?)
      `,
      [name, description?.trim() || null]
    );

    // Log activity
    await logActivity(req.user.id, "CREATE", "Permission", result.insertId);

    return res.status(201).json({
      success: true,
      message: "Permission created successfully",
      data: {
        id: result.insertId,
        name,
        description: description || null,
      },
    });
  } catch (err) {
    console.error("Create permission error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create permission",
    });
  }
};



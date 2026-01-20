import { pool } from "../../config/db.js";
import { logActivity } from "../../utils/activityLogger.js";

/**
 * ASSIGN PERMISSIONS TO ROLE
 * POST /roles/:id/permissions
 */
export const assignPermissionsToRole = async (req, res) => {
  const roleId = Number(req.params.id);

  // ✅ FIX: frontend se permissionIds aa rahe hain
  let { permissionIds } = req.body;

  if (!roleId || isNaN(roleId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid role id",
    });
  }

  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Permissions array is required",
    });
  }

  // ✅ normalize: remove duplicates + ensure numbers
  const permissions = [...new Set(permissionIds.map(Number))];

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /* 🔹 Check role exists */
    const [[role]] = await connection.query(
      `SELECT id FROM roles WHERE id = ? LIMIT 1`,
      [roleId]
    );

    if (!role) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    /* 🔹 Validate permission IDs */
    const [validPermissions] = await connection.query(
      `SELECT id FROM permissions WHERE id IN (?)`,
      [permissions]
    );

    if (validPermissions.length !== permissions.length) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "One or more permission IDs are invalid",
      });
    }

    /* 🔹 Remove old role permissions */
    await connection.query(
      `DELETE FROM role_permissions WHERE role_id = ?`,
      [roleId]
    );

    /* 🔹 Assign new permissions */
    const insertValues = permissions.map((permissionId) => [
      roleId,
      permissionId,
    ]);

    if (insertValues.length > 0) {
      const [result] = await connection.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ?`,
        [insertValues]
      );

      // Log activity
      await logActivity(req.user.id, "UPDATE", "RolePermission", roleId);
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Permissions assigned to role successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Assign role permissions error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to assign permissions",
    });
  } finally {
    connection.release();
  }
};

/**
 * GET ROLE PERMISSIONS
 * GET /roles/:roleId/permissions
 */
export const getRolePermissions = async (req, res) => {
  const { roleId } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.description
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.id ASC
      `,
      [roleId]
    );

    res.json({
      success: true,
      role_id: roleId,
      permissions: rows,
    });
  } catch (err) {
    console.error("Get role permissions error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch role permissions",
    });
  }
};


/**
 * UPDATE ROLE PERMISSIONS
 * PUT /roles/:roleId/permissions
 */
export const updateRolePermissions = async (req, res) => {
  const { roleId } = req.params;
  const { permissions } = req.body;
  const userId = req.user.id; // logged in admin

  if (!Array.isArray(permissions)) {
    return res.status(400).json({
      success: false,
      message: "Permissions must be an array",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1️⃣ Remove old permissions
    await connection.query(
      `DELETE FROM role_permissions WHERE role_id = ?`,
      [roleId]
    );

    // 2️⃣ Insert new permissions
    if (permissions.length > 0) {
      const values = permissions.map((pid) => [roleId, pid]);

      await connection.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ?`,
        [values]
      );
    }

    // 3️⃣ Activity Log
    await logActivity(
      userId,
      "UPDATE",
      "RolePermissions",
      roleId
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Role permissions updated successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Update role permissions error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to update role permissions",
    });
  } finally {
    connection.release();
  }
};

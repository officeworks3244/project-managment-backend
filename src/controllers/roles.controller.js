import { pool } from "../../config/db.js";
import { logActivity } from "../../utils/activityLogger.js";

/**
 * GET ALL ROLES (WITH PERMISSION COUNT)
 * GET /roles
 */
export const getRoles = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        r.id,
        r.name,
        r.description,
        r.created_at,
        COUNT(rp.permission_id) AS permission_count
      FROM roles r
      LEFT JOIN role_permissions rp 
        ON rp.role_id = r.id
      GROUP BY r.id
      ORDER BY r.id ASC
      `
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("Get roles error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch roles",
    });
  }
};

/**
 * CREATE ROLE
 * POST /roles
 */
export const createRole = async (req, res) => {
  let { name, description } = req.body;

  /* 🔹 Validation */
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Role name is required",
    });
  }

  name = name.trim().toUpperCase();

  try {
    /* 🔹 Check duplicate role */
    const [exists] = await pool.query(
      `SELECT id FROM roles WHERE name = ? LIMIT 1`,
      [name]
    );

    if (exists.length) {
      return res.status(409).json({
        success: false,
        message: "Role already exists",
      });
    }

    /* 🔹 Insert role */
    const [result] = await pool.query(
      `
      INSERT INTO roles (name, description)
      VALUES (?, ?)
      `,
      [name, description || null]
    );

    const roleId = result.insertId;

    // Log activity
    await logActivity(req.user.id, "CREATE", "Role", roleId);

    /* ✅ Final response */
    return res.status(201).json({
      success: true,
      message: "Role created successfully",
      roleId, // 🔥 direct access for frontend
      data: {
        id: roleId,
        name,
        description: description || null,
        created_at: new Date(),
      },
    });
  } catch (err) {
    console.error("Create role error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create role",
    });
  }
};


/**
 * UPDATE ROLE
 * PUT /roles/:id
 */
export const updateRole = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    const [role] = await pool.query(
      `SELECT id FROM roles WHERE id = ?`,
      [id]
    );

    if (!role.length) {
      return res.status(404).json({ message: "Role not found" });
    }

    await pool.query(
      `
      UPDATE roles
      SET name = ?, description = ?
      WHERE id = ?
      `,
      [name.toUpperCase(), description || null, id]
    );

    // Log activity
    await logActivity(req.user.id, "UPDATE", "Role", id);

    res.json({
      success: true,
      message: "Role updated successfully",
    });
  } catch (err) {
    console.error("Update role error:", err);
    res.status(500).json({ message: "Failed to update role" });
  }
};

/**
 * DELETE ROLE
 * DELETE /roles/:id
 */
export const deleteRole = async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1️⃣ Check role exists
    const [role] = await connection.query(
      `SELECT id FROM roles WHERE id = ?`,
      [id]
    );

    if (!role.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Role not found" });
    }

    // 2️⃣ Prevent delete if role is assigned to users
    const [users] = await connection.query(
      `SELECT id FROM users WHERE role_id = ? LIMIT 1`,
      [id]
    );

    if (users.length) {
      await connection.rollback();
      return res.status(400).json({
        message: "Role is assigned to users and cannot be deleted",
      });
    }

    // 3️⃣ Delete role permissions first
    await connection.query(
      `DELETE FROM role_permissions WHERE role_id = ?`,
      [id]
    );

    // 4️⃣ Delete role
    await connection.query(
      `DELETE FROM roles WHERE id = ?`,
      [id]
    );

    await connection.commit();

    // Log activity
    await logActivity(req.user.id, "DELETE", "Role", id);

    res.json({
      success: true,
      message: "Role and its permissions deleted successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Delete role error:", err);
    res.status(500).json({ message: "Failed to delete role" });
  } finally {
    connection.release();
  }
};


/**
 * GET ROLE BY ID
 * GET /roles/:id
 */
export const getRoleById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        id,
        name,
        description,
        created_at
      FROM roles
      WHERE id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("Get role by id error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch role",
    });
  }
};

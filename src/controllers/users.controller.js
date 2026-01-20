import { pool } from "../../config/db.js";
import { hashPassword } from "../../utils/password.js";
import { logActivity } from "../../utils/activityLogger.js";


/**
 * GET ALL USERS
 * GET /users
 */
export const getUsers = async (req, res) => {
  try {
    const loggedInUserId = req.user.id; // 🔑 current user

    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.profile_image,
        u.bio,
        u.status,
        u.login_at,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        r.id AS role_id,
        r.name AS role
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id != ?           -- 🔥 exclude logged-in user
      ORDER BY u.id DESC
      `,
      [loggedInUserId]
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("Get users error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};


/**
 * GET SINGLE USER WITH PERMISSIONS
 * GET /users/:id
 */
export const getUserById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.profile_image,
        u.bio,
        u.status,
        u.login_at,
        u.last_login_at,
        u.created_at,
        u.updated_at,

        r.id   AS role_id,
        r.name AS role,

        GROUP_CONCAT(p.name) AS permissions
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = ?
      GROUP BY u.id
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = rows[0];

    res.json({
      success: true,
      data: {
        ...user,
        permissions: user.permissions
          ? user.permissions.split(",")
          : [],
      },
    });
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
};



/**
 * CREATE USER
 * POST /users
 */
export const createUser = async (req, res) => {
  const {
    name,
    email,
    password,
    role_id,
    phone,
    status = "active",
  } = req.body;

  /* 🔹 Validation */
  if (!name || !email || !password || !role_id) {
    return res.status(400).json({
      success: false,
      message: "Name, email, password and role are required",
    });
  }

  try {
    /* 🔹 Check email uniqueness */
    const [exists] = await pool.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (exists.length) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    /* 🔹 Hash password */
    const hashedPassword = await hashPassword(password);

    /* 🔹 Insert user */
    const [result] = await pool.query(
      `
      INSERT INTO users 
        (name, email, phone, password_hash, role_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [name, email, phone || null, hashedPassword, role_id, status]
    );

    const userId = result.insertId;

    // Log activity
    await logActivity(req.user.id, "CREATE", "User", userId);

    /* ✅ Final response with userId */
    return res.status(201).json({
      success: true,
      message: "User created successfully",
      userId, // 🔥 direct access
      data: {
        id: userId,
        name,
        email,
        phone: phone || null,
        role_id,
        status,
      },
    });
  } catch (err) {
    console.error("Create user error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
};



/**
 * UPDATE USER
 * PUT /users/:id
 */
export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, role_id, status, phone, bio } = req.body;
  let profileImage = null;

  // Handle file upload if exists (supports both profile_image and file field names)
  if (req.files) {
    const uploadedFile = req.files.profile_image?.[0] || req.files.file?.[0];
    if (uploadedFile) {
      profileImage = `/uploads/images/${uploadedFile.filename}`;
    }
  }

  try {
    const [user] = await pool.query(
      `SELECT id FROM users WHERE id = ?`,
      [id]
    );

    if (!user.length) {
      return res.status(404).json({ message: "User not found" });
    }

    await pool.query(
      `
      UPDATE users
      SET name = COALESCE(?, name),
          role_id = COALESCE(?, role_id),
          status = COALESCE(?, status),
          phone = COALESCE(?, phone),
          bio = COALESCE(?, bio),
          profile_image = COALESCE(?, profile_image),
          updated_at = NOW()
      WHERE id = ?
      `,
      [name, role_id, status, phone, bio, profileImage, id]
    );

    // Log activity
    await logActivity(req.user.id, "UPDATE", "User", id);

    res.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ message: "Failed to update user" });
  }
};

/**
 * DELETE / DISABLE USER (SOFT DELETE)
 * DELETE /users/:id
 */
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const [user] = await pool.query(
      `SELECT id FROM users WHERE id = ?`,
      [id]
    );

    if (!user.length) {
      return res.status(404).json({ message: "User not found" });
    }

    await pool.query(
      `
      UPDATE users
      SET status = 'inactive',
          updated_at = NOW()
      WHERE id = ?
      `,
      [id]
    );

    // Log activity
    await logActivity(req.user.id, "DELETE", "User", id);

    res.json({
      success: true,
      message: "User disabled successfully",
    });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ message: "Failed to disable user" });
  }
};

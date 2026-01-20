import { pool } from "../../config/db.js";
import { comparePassword } from "../../utils/password.js";
import { signToken } from "../../utils/jwt.js";


/**
 * LOGIN
 * POST /auth/login
 */
export const login = async (req, res) => {
  const { email, password } = req.body;

  /* 🔹 Validation */
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  try {
    /* 🔹 Fetch user + role + ROLE permissions */
    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.profile_image,
        u.password_hash,
        u.status,
        r.id   AS role_id,
        r.name AS role_name,
        GROUP_CONCAT(DISTINCT p.name) AS permissions
      FROM users u
      JOIN roles r 
        ON r.id = u.role_id

      LEFT JOIN role_permissions rp 
        ON rp.role_id = r.id

      LEFT JOIN permissions p 
        ON p.id = rp.permission_id

      WHERE u.email = ?
        AND u.status = 'active'

      GROUP BY u.id
      LIMIT 1
      `,
      [email]
    );

    /* 🔹 User not found */
    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = rows[0];

    /* 🔹 Password check */
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    /* 🔹 Update login timestamps */
    await pool.query(
      `
      UPDATE users
      SET last_login_at = login_at,
          login_at = NOW()
      WHERE id = ?
      `,
      [user.id]
    );

    /* 🔹 Create JWT */
    const token = signToken({
      id: user.id,
      role: user.role_name,
    });

    /* 🔹 Final response */
    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profile_image: user.profile_image,
        role: {
          id: user.role_id,
          name: user.role_name,
        },
        permissions: user.permissions
          ? user.permissions.split(",")
          : [],
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};


/**
 * LOGOUT
 */
export const logout = async (req, res) => {
  try {
    await pool.query(
      `
      UPDATE users
      SET last_login_at = NOW()
      WHERE id = ?
      `,
      [req.user.id]
    );

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: "Logout failed" });
  }
};


/**
 * GET CURRENT USER (Updated with Roles & Permissions)
 */
export const me = async (req, res) => {
  try {
    // 1. Get User and Role info
    const [users] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.profile_image, u.bio, u.role_id, u.login_at, u.last_login_at, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (users.length === 0) return res.status(404).json({ message: "User not found" });

    const user = users[0];

    // 2. Get Permissions for this role
    const [permissions] = await pool.query(
      `SELECT p.name 
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [user.role_id]
    );

    // 3. Format response as per Frontend expectations
    const userData = {
      ...user,
      role: { id: user.role_id, name: user.role_name },
      permissions: permissions.map(p => p.name)
    };

    res.json(userData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

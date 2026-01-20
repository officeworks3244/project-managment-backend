import { pool } from "../../config/db.js";
import { hashPassword, comparePassword } from "../../utils/password.js";
import { logActivity } from "../../utils/activityLogger.js";

/**
 * GET PROFILE
 * GET /profile
 */
export const getProfile = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        id,
        name,
        email,
        phone,
        profile_image,
        bio,
        role_id,
        status,
        login_at,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
      `,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

/**
 * UPDATE PROFILE
 * PUT /profile
 */
export const updateProfile = async (req, res) => {
  const { name, email, phone, bio } = req.body;
  let profileImage = null;

  // Handle file upload if exists (supports both profile_image and file field names)
  if (req.files) {
    const uploadedFile = req.files.profile_image?.[0] || req.files.file?.[0];
    if (uploadedFile) {
      profileImage = `/uploads/images/${uploadedFile.filename}`;
    }
  }

  try {
    await pool.query(
      `
      UPDATE users
      SET name = COALESCE(?, name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          bio = COALESCE(?, bio),
          profile_image = COALESCE(?, profile_image),
          updated_at = NOW()
      WHERE id = ?
      `,
      [name, email, phone, bio, profileImage, req.user.id]
    );

    // Log activity
    await logActivity(req.user.id, "UPDATE", "Profile", req.user.id);

    res.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Failed to update profile" });
  }
};

/**
 * CHANGE PASSWORD
 * PUT /profile/change-password
 */
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT password_hash FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await comparePassword(
      currentPassword,
      rows[0].password_hash
    );

    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const newHash = await hashPassword(newPassword);

    await pool.query(
      `
      UPDATE users
      SET password_hash = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [newHash, req.user.id]
    );

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Failed to change password" });
  }
};

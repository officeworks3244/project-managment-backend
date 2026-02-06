/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MAILS CONTROLLER - WITH REAL-TIME SOCKET.IO NOTIFICATIONS
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { pool } from "../../config/db.js";
import { emitToUser, emitToUsers, getIO } from "../services/socket.service.js";


export const sendMail = async (req, res) => {
  const senderId = req.user.id;
  const { subject, body } = req.body;
  let { recipients } = req.body;

  // 🔹 Parse recipients (handle both JSON string and array)
  if (typeof recipients === "string") {
    try {
      recipients = JSON.parse(recipients);
    } catch {
      recipients = recipients.split(",").map(r => parseInt(r.trim()));
    }
  }

  // 🔹 Validation
  if (!subject || !body || !Array.isArray(recipients) || !recipients.length) {
    return res.status(400).json({
      success: false,
      message: "subject, body & recipients required"
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 📌 Create mail thread
    const [thread] = await conn.query(
      `INSERT INTO mail_threads (subject, created_by) VALUES (?, ?)`,
      [subject, senderId]
    );

    // 📌 Create mail message
    const [mail] = await conn.query(
      `INSERT INTO mails (sender_id, subject, body, thread_id)
             VALUES (?, ?, ?, ?)`,
      [senderId, subject, body, thread.insertId]
    );

    // 📎 Attachments (if any)
    if (req.files?.length) {
      const values = req.files.map(f => [
        mail.insertId,
        f.originalname,
        f.filename,
        f.path,
        f.mimetype,
        f.size
      ]);
      await conn.query(
        `INSERT INTO mail_attachments
                 (mail_id, original_name, file_name, file_path, mime_type, file_size)
                 VALUES ?`,
        [values]
      );
    }

    // 👥 Add recipients
    await conn.query(
      `INSERT INTO mail_recipients (mail_id, recipient_id)
             VALUES ?`,
      [recipients.map(r => [mail.insertId, r])]
    );

    await conn.commit();

    // ✨ REAL-TIME NOTIFICATIONS
    // 🔔 SOCKET
    emitToUsers(recipients, "mail:received", {
      mail_id: mail.insertId,
      thread_id: thread.insertId,
      sender_id: senderId,
      sender_name: req.user.name,
      sender_email: req.user.email,
      subject,
      preview: body.substring(0, 120),
      created_at: new Date()
    });

    emitToUser(senderId, "mail:sent", {
      mail_id: mail.insertId,
      thread_id: thread.insertId
    });

    // Optional unified update event (for clients listening only to mail:update)
    emitToUsers(recipients, "mail:update", {
      mail_id: mail.insertId,
      thread_id: thread.insertId,
      action: "received"
    });

    emitToUser(senderId, "mail:update", {
      mail_id: mail.insertId,
      thread_id: thread.insertId,
      action: "sent"
    });

    res.json({ success: true, mail_id: mail.insertId });

  } catch (err) {
    await conn.rollback();
    console.error("❌ Mail sending failed:", err);
    res.status(500).json({
      success: false,
      message: "Mail sending failed"
    });
  } finally {
    conn.release();
  }
};



/**
 * GET INBOX (THREAD BASED – WITH ATTACHMENTS)
 * GET /mails/inbox
 */
export const getInbox = async (req, res) => {
  try {
    const userId = req.user.id;

    /* =====================================================
       1️⃣ Threads jahan user RECIPIENT hai (not sender)
    ===================================================== */
    const [threads] = await pool.query(
      `
      SELECT DISTINCT t.id AS thread_id, t.subject
      FROM mail_threads t
      JOIN mails m ON m.thread_id = t.id
      JOIN mail_recipients mr ON mr.mail_id = m.id
      WHERE mr.recipient_id = ?
        AND mr.is_deleted = 0
      `,
      [userId]
    );


    if (!threads.length) {
      return res.json({
        success: true,
        inbox_count: 0,
        data: []
      });
    }

    const threadIds = threads.map(t => t.thread_id);

    /* =====================================================
       2️⃣ Latest mail per thread
    ===================================================== */
    const [latestMails] = await pool.query(
      `
      SELECT
        m.id,
        m.thread_id,
        m.subject,
        m.body,
        m.created_at,
        u.id   AS sender_id,
        u.name AS sender_name,
        u.email AS sender_email,
        (
          SELECT is_read
          FROM mail_recipients
          WHERE mail_id = m.id
            AND recipient_id = ?
          LIMIT 1
        ) AS is_read
      FROM mails m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = (
        SELECT id
        FROM mails
        WHERE thread_id = m.thread_id
        ORDER BY created_at DESC
        LIMIT 1
      )
      AND m.thread_id IN (${threadIds.map(() => "?").join(",")})
      ORDER BY m.created_at DESC
      `,
      [userId, ...threadIds]
    );

    const mailIds = latestMails.map(m => m.id);

    /* =====================================================
       3️⃣ Attachments (latest mails only)
    ===================================================== */
    let attachmentsMap = {};
    if (mailIds.length) {
      const [attachments] = await pool.query(
        `
        SELECT
          id,
          mail_id,
          original_name,
          file_name,
          file_path,
          mime_type,
          file_size
        FROM mail_attachments
        WHERE mail_id IN (${mailIds.map(() => "?").join(",")})
        `,
        mailIds
      );

      attachments.forEach(a => {
        if (!attachmentsMap[a.mail_id]) attachmentsMap[a.mail_id] = [];
        attachmentsMap[a.mail_id].push(a);
      });
    }

    /* =====================================================
       4️⃣ All replies (thread mails)
    ===================================================== */
    const [allMails] = await pool.query(
      `
      SELECT
        m.id,
        m.thread_id,
        m.body,
        m.created_at,
        u.id   AS sender_id,
        u.name AS sender_name
      FROM mails m
      JOIN users u ON u.id = m.sender_id
      WHERE m.thread_id IN (${threadIds.map(() => "?").join(",")})
      ORDER BY m.created_at ASC
      `,
      threadIds
    );

    const repliesMap = {};
    allMails.forEach(m => {
      if (!repliesMap[m.thread_id]) repliesMap[m.thread_id] = [];
      repliesMap[m.thread_id].push(m);
    });

    /* =====================================================
       5️⃣ Final Response Shape
    ===================================================== */
    const data = latestMails.map(m => {
      const replies = repliesMap[m.thread_id] || [];
      const attachments = attachmentsMap[m.id] || [];

      return {
        id: m.id,
        thread_id: m.thread_id,
        subject: m.subject,
        preview: m.body.substring(0, 120),
        created_at: m.created_at,

        sender_id: m.sender_id,
        sender_name: m.sender_name,
        sender_email: m.sender_email,

        is_read: m.is_read ?? 1,

        attachments_count: attachments.length,
        attachments,

        has_replies: replies.length > 1,
        replies_count: Math.max(replies.length - 1, 0),

        replies: replies.map(r => ({
          id: r.id,
          body: r.body,
          created_at: r.created_at,
          sender_id: r.sender_id,
          sender_name: r.sender_name
        }))
      };
    });

    /* =====================================================
       6️⃣ Send Response
    ===================================================== */
    res.json({
      success: true,
      inbox_count: data.length,
      data
    });

  } catch (err) {
    console.error("Get inbox error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load inbox"
    });
  }
};






/**
 * GET SENT MAILS
 * GET /mails/sent
 */
export const getSentMails = async (req, res) => {
  const userId = req.user.id;

  const [rows] = await pool.query(`
    SELECT
      m.id,
      m.subject,
      LEFT(m.body,120) AS preview,
      m.created_at,
      GROUP_CONCAT(DISTINCT CONCAT(u.name, ' (', u.email, ')') SEPARATOR ', ') AS recipients,
      (
        SELECT COUNT(*)
        FROM mail_attachments ma
        WHERE ma.mail_id = m.id
      ) AS attachments_count
    FROM mails m
    JOIN mail_recipients mr ON mr.mail_id = m.id
    JOIN users u ON u.id = mr.recipient_id
    WHERE m.sender_id = ? AND m.sender_deleted = 0
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `, [userId]);

  // Get attachments for all sent mails
  const mailIds = rows.map(r => r.id);
  let attachmentsMap = {};

  if (mailIds.length > 0) {
    const [attachments] = await pool.query(`
        SELECT 
          mail_id,
          id,
          original_name,
          file_name,
          file_path,
          mime_type,
          file_size
        FROM mail_attachments
        WHERE mail_id IN (${mailIds.map(() => '?').join(',')})
        ORDER BY mail_id
      `, mailIds);

    // Group attachments by mail_id
    attachments.forEach(att => {
      if (!attachmentsMap[att.mail_id]) {
        attachmentsMap[att.mail_id] = [];
      }
      attachmentsMap[att.mail_id].push({
        id: att.id,
        original_name: att.original_name,
        file_name: att.file_name,
        file_path: att.file_path,
        mime_type: att.mime_type,
        file_size: att.file_size
      });
    });
  }

  // Add attachments to each mail
  const dataWithAttachments = rows.map(mail => ({
    ...mail,
    attachments: attachmentsMap[mail.id] || []
  }));

  res.json({
    success: true,
    sent_count: rows.length,
    data: dataWithAttachments
  });
};






/**
 * GET MAIL DETAIL
 * GET /mails/:id
 */
export const getMailDetail = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  // Get the initial mail and its thread
  const [[mail]] = await pool.query(`
    SELECT m.id, m.subject, m.body, m.created_at, m.thread_id, u.name AS sender_name, u.email AS sender_email, u.id AS sender_id
    FROM mails m
    JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `, [id]);

  if (!mail) {
    return res.status(404).json({ success: false, message: "Mail not found" });
  }

  // Get all mails in the thread (entire conversation)
  const [allMails] = await pool.query(`
    SELECT
      m.id,
      m.subject,
      m.body,
      m.created_at,
      u.id AS sender_id,
      u.name AS sender_name,
      u.email AS sender_email
    FROM mails m
    JOIN users u ON u.id = m.sender_id
    WHERE m.thread_id = ?
    ORDER BY m.created_at ASC
  `, [mail.thread_id]);

  // Get attachments for all mails in thread
  const [allAttachments] = await pool.query(`
    SELECT
      ma.mail_id,
      ma.id,
      ma.original_name,
      ma.file_name,
      ma.file_path,
      ma.mime_type,
      ma.file_size
    FROM mail_attachments ma
    JOIN mails m ON m.id = ma.mail_id
    WHERE m.thread_id = ?
  `, [mail.thread_id]);

  // Group attachments by mail_id
  const attachmentsMap = {};
  allAttachments.forEach(att => {
    if (!attachmentsMap[att.mail_id]) {
      attachmentsMap[att.mail_id] = [];
    }
    attachmentsMap[att.mail_id].push({
      id: att.id,
      original_name: att.original_name,
      file_name: att.file_name,
      file_path: att.file_path,
      mime_type: att.mime_type,
      file_size: att.file_size
    });
  });

  // Build thread with all mails and their attachments
  const thread = {
    thread_id: mail.thread_id,
    subject: mail.subject,
    mails: allMails.map(m => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      created_at: m.created_at,
      sender_id: m.sender_id,
      sender_name: m.sender_name,
      sender_email: m.sender_email,
      attachments: attachmentsMap[m.id] || []
    }))
  };

  res.json({
    success: true,
    data: thread
  });
};



/**
 * MARK AS READ
 * PUT /mails/:id/read
 */
export const markAsRead = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  await pool.query(
    `
    UPDATE mail_recipients
    SET is_read = 1, read_at = NOW()
    WHERE mail_id = ? AND recipient_id = ?
    `,
    [id, userId]
  );

  emitToUser(userId, "mail:read", { mail_id: id });

  res.json({ success: true });
};


/**
 * REPLY MAIL
 * POST /mails/:mailId/reply
 */
export const replyMail = async (req, res) => {
  const senderId = req.user?.id;
  const { mailId } = req.params;
  const { body } = req.body;

  if (!senderId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
  }

  if (!body) {
    return res.status(400).json({
      success: false,
      message: "Body is required"
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Get original mail + thread
    const [[mail]] = await conn.query(
      `
      SELECT m.thread_id, t.subject
      FROM mails m
      JOIN mail_threads t ON t.id = m.thread_id
      WHERE m.id = ?
      `,
      [mailId]
    );

    if (!mail) {
      return res.status(404).json({
        success: false,
        message: "Mail not found"
      });
    }

    // 2️⃣ Insert reply mail
    const [insert] = await conn.query(
      `
      INSERT INTO mails (sender_id, subject, body, thread_id)
      VALUES (?, ?, ?, ?)
      `,
      [senderId, mail.subject, body, mail.thread_id]
    );

    const newMailId = insert.insertId;

    // 3️⃣ Handle attachments
    if (req.files?.file?.length) {
      const attachments = req.files.file.map(file => [
        newMailId,
        file.originalname,
        file.filename,
        file.path.replace(/\\/g, "/"),
        file.mimetype,
        file.size
      ]);

      await conn.query(
        `
        INSERT INTO mail_attachments
        (mail_id, original_name, file_name, file_path, mime_type, file_size)
        VALUES ?
        `,
        [attachments]
      );
    }

    // 4️⃣ Get thread participants (auto recipients)
    const [recipients] = await conn.query(
      `
      SELECT DISTINCT user_id FROM (
        SELECT sender_id AS user_id FROM mails WHERE thread_id = ?
        UNION
        SELECT mr.recipient_id
        FROM mail_recipients mr
        JOIN mails m ON m.id = mr.mail_id
        WHERE m.thread_id = ?
      ) t
      WHERE user_id != ?
      `,
      [mail.thread_id, mail.thread_id, senderId]
    );

    if (recipients.length) {
      await conn.query(
        `INSERT INTO mail_recipients (mail_id, recipient_id) VALUES ?`,
        [recipients.map(r => [newMailId, r.user_id])]
      );
    }

    await conn.commit();

    // 🔔 SOCKET
    recipients.forEach(r => {
      emitToUser(r.user_id, "mail:replied", {
        mail_id: newMailId,
        thread_id: mail.thread_id,
        reply_from: senderId,
        reply_from_name: req.user.name,
        preview: body.substring(0, 120),
        created_at: new Date()
      });
    });

    emitToUser(senderId, "mail:replied", {
      mail_id: newMailId,
      thread_id: mail.thread_id,
      self: true
    });

    // Emit socket update to sender and recipients
    try {
      const io = getIO();
      if (io) {
        io.to(`user_${senderId}`).emit("mail:update", { mail_id: newMailId, thread_id: mail.thread_id, action: "replied" });
        if (recipients.length) {
          recipients.forEach(r => io.to(`user_${r.user_id}`).emit("mail:update", { mail_id: newMailId, thread_id: mail.thread_id, action: "replied" }));
        }
      }
    } catch (e) {
      console.error("Socket emit error:", e);
    }

    res.json({
      success: true,
      message: "Reply sent successfully",
      mail_id: newMailId
    });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Reply failed"
    });
  } finally {
    conn.release();
  }
};





/**
 * USER MAIL SUGGESTIONS (EMAIL AUTOCOMPLETE)
 * GET /mails/users/suggestions?q=
 */
export const getMailUserSuggestions = async (req, res) => {
  const currentUserId = req.user.id;
  const search = req.query.q?.trim() || "";
  const limit = parseInt(req.query.limit, 10) || 10;

  if (!search) {
    return res.json({
      success: true,
      data: []
    });
  }

  try {
    const [users] = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        r.name AS role
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE 
        u.id != ?
        AND r.name NOT IN ('SUPER_ADMIN', 'ADMIN')
        AND (
          u.name LIKE ?
          OR u.email LIKE ?
        )
      ORDER BY u.name ASC
      LIMIT ?
      `,
      [
        currentUserId,
        `%${search}%`,
        `%${search}%`,
        limit
      ]
    );

    res.json({
      success: true,
      count: users.length,
      data: users
    });

  } catch (err) {
    console.error("Mail user suggestions error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user suggestions"
    });
  }
};






/**
 * DELETE MAIL (THREAD BASED – SOFT DELETE)
 * DELETE /mails/:id   (id = threadId)
 */
export const deleteMail = async (req, res) => {
  console.log("DELETE MAIL HIT");
  console.log("REQ PARAMS:", req.params);

  const userId = req.user?.id;
  const threadId = req.params.id; // route se aa raha hai

  console.log("THREAD ID:", threadId);
  console.log("USER ID:", userId);

  if (!threadId) {
    return res.status(400).json({
      success: false,
      message: "Thread id missing"
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Thread exist check
    const [[thread]] = await conn.query(
      `SELECT id FROM mail_threads WHERE id = ?`,
      [threadId]
    );

    if (!thread) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Thread not found"
      });
    }

    // 2️⃣ RECIPIENT soft delete (JOIN required)
    await conn.query(
      `
      UPDATE mail_recipients mr
      JOIN mails m ON m.id = mr.mail_id
      SET mr.is_deleted = 1
      WHERE m.thread_id = ?
        AND mr.recipient_id = ?
      `,
      [threadId, userId]
    );

    // 3️⃣ SENDER soft delete
    await conn.query(
      `
      UPDATE mails
      SET sender_deleted = 1
      WHERE thread_id = ?
        AND sender_id = ?
      `,
      [threadId, userId]
    );

    await conn.commit();

    res.json({
      success: true,
      message: "Conversation removed successfully"
    });

  } catch (err) {
    await conn.rollback();
    console.error("DELETE MAIL ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Delete failed"
    });
  } finally {
    conn.release();
  }
};





/**
 * GET ALL MAILS (ADMIN – VIEW ALL)
 * GET /mails/admin/all
 */
export const getAllMailsAdmin = async (req, res) => {
  try {
    // 1️⃣ All threads
    const [threads] = await pool.query(`
      SELECT
        t.id AS thread_id,
        t.subject,
        t.created_at,
        u.id AS created_by_id,
        u.name AS created_by_name
      FROM mail_threads t
      JOIN users u ON u.id = t.created_by
      ORDER BY t.created_at DESC
    `);

    if (!threads.length) {
      return res.json({
        success: true,
        total_threads: 0,
        data: []
      });
    }

    const threadIds = threads.map(t => t.thread_id);

    // 2️⃣ All mails (including deleted)
    const [mails] = await pool.query(`
      SELECT
        m.id,
        m.thread_id,
        m.subject,
        m.body,
        m.created_at,
        m.sender_deleted,
        u.id AS sender_id,
        u.name AS sender_name,
        u.email AS sender_email
      FROM mails m
      JOIN users u ON u.id = m.sender_id
      WHERE m.thread_id IN (${threadIds.map(() => "?").join(",")})
      ORDER BY m.created_at ASC
    `, threadIds);

    // 3️⃣ Recipients (with delete + read status)
    const [recipients] = await pool.query(`
      SELECT
        mr.mail_id,
        mr.recipient_id,
        mr.is_read,
        mr.is_deleted,
        u.name AS recipient_name,
        u.email AS recipient_email
      FROM mail_recipients mr
      JOIN users u ON u.id = mr.recipient_id
    `);

    // 4️⃣ Attachments
    const [attachments] = await pool.query(`
      SELECT
        id,
        mail_id,
        original_name,
        file_name,
        file_path,
        mime_type,
        file_size
      FROM mail_attachments
    `);

    // 5️⃣ Mapping
    const recipientMap = {};
    recipients.forEach(r => {
      if (!recipientMap[r.mail_id]) recipientMap[r.mail_id] = [];
      recipientMap[r.mail_id].push(r);
    });

    const attachmentMap = {};
    attachments.forEach(a => {
      if (!attachmentMap[a.mail_id]) attachmentMap[a.mail_id] = [];
      attachmentMap[a.mail_id].push(a);
    });

    const mailsByThread = {};
    mails.forEach(m => {
      if (!mailsByThread[m.thread_id]) mailsByThread[m.thread_id] = [];
      mailsByThread[m.thread_id].push({
        ...m,
        recipients: recipientMap[m.id] || [],
        attachments: attachmentMap[m.id] || []
      });
    });

    // 6️⃣ Final response
    const data = threads.map(t => ({
      thread_id: t.thread_id,
      subject: t.subject,
      created_at: t.created_at,
      created_by: {
        id: t.created_by_id,
        name: t.created_by_name
      },
      mails: mailsByThread[t.thread_id] || []
    }));

    res.json({
      success: true,
      total_threads: data.length,
      data
    });

  } catch (err) {
    console.error("ADMIN MAIL FETCH ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch mails"
    });
  }
};

# Socket.IO Real-Time Notification System - Integration Guide

## Overview

This guide demonstrates how to integrate the secure, production-ready Socket.IO notification system into your controllers and services.

---

## 📌 Table of Contents

1. [Client-Side Setup](#client-side-setup)
2. [Server-Side Integration](#server-side-integration)
3. [Mail Notification Examples](#mail-notification-examples)
4. [Other Notification Types](#other-notification-types)
5. [Error Handling](#error-handling)
6. [Best Practices](#best-practices)

---

## Client-Side Setup

### Connect to Socket.IO with JWT Token

```javascript
// client/src/services/socket.ts
import { io, Socket } from "socket.io-client";

let socket: Socket;

export const connectSocket = (token: string) => {
  socket = io("http://localhost:3000", {
    auth: {
      token: token, // JWT token from login response
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    console.log("✅ Connected to Socket.IO:", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected from Socket.IO");
  });

  socket.on("auth:error", (data) => {
    console.error("🔐 Authentication error:", data.message);
    // Redirect to login
    window.location.href = "/login";
  });

  return socket;
};

export const getSocket = () => socket;

// Listen for mail notifications
export const onMailReceived = (callback: (data: any) => void) => {
  socket.on("mail:received", callback);
};

export const onMailReplied = (callback: (data: any) => void) => {
  socket.on("mail:replied", callback);
};

export const onMailDeleted = (callback: (data: any) => void) => {
  socket.on("mail:deleted", callback);
};

// Manual room management
export const joinRoom = (userId: number) => {
  socket.emit("join", { userId });
};

export const leaveRoom = (userId: number) => {
  socket.emit("leave", { userId });
};
```

### Use in React Component

```javascript
// client/src/components/MailNotification.tsx
import { useEffect, useState } from "react";
import { onMailReceived } from "../services/socket";

export const MailNotification = () => {
  const [mails, setMails] = useState([]);

  useEffect(() => {
    // Listen for new mail notifications
    onMailReceived((data) => {
      console.log("📬 New mail received:", data);

      // Add to UI
      setMails((prev) => [
        ...prev,
        {
          id: data.mail_id,
          from: data.sender_name,
          subject: data.subject,
          preview: data.preview,
          time: new Date(data.created_at),
        },
      ]);

      // Show toast notification
      showToast(`New mail from ${data.sender_name}: ${data.subject}`);
    });

    return () => {
      // Cleanup listener
    };
  }, []);

  return (
    <div className="mail-notifications">
      {mails.map((mail) => (
        <div key={mail.id} className="notification-item">
          <strong>{mail.from}</strong>: {mail.subject}
        </div>
      ))}
    </div>
  );
};
```

---

## Server-Side Integration

### Option 1: Using Helper Functions (Recommended)

```javascript
// src/controllers/mails.controller.js
import { pool } from "../../config/db.js";
import { emitToUser, emitToUsers } from "../services/socket.service.js";

export const sendMail = async (req, res) => {
  const senderId = req.user.id;
  const { subject, body } = req.body;
  let { recipients } = req.body;

  // ... validation code ...

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Create thread
    const [thread] = await conn.query(
      `INSERT INTO mail_threads (subject, created_by) VALUES (?, ?)`,
      [subject, senderId]
    );

    // Create mail
    const [mail] = await conn.query(
      `INSERT INTO mails (sender_id, subject, body, thread_id)
       VALUES (?, ?, ?, ?)`,
      [senderId, subject, body, thread.insertId]
    );

    // Add recipients
    await conn.query(
      `INSERT INTO mail_recipients (mail_id, recipient_id)
       VALUES ?`,
      [recipients.map((r) => [mail.insertId, r])]
    );

    await conn.commit();

    // ✨ EMIT NOTIFICATIONS
    // Notify sender
    emitToUser(senderId, "mail:received", {
      mail_id: mail.insertId,
      thread_id: thread.insertId,
      sender_name: req.user.name,
      sender_email: req.user.email,
      subject: subject,
      preview: body.substring(0, 100),
      created_at: new Date(),
      action: "sent",
    });

    // Notify recipients
    emitToUsers(recipients, "mail:received", {
      mail_id: mail.insertId,
      thread_id: thread.insertId,
      sender_id: senderId,
      sender_name: req.user.name,
      sender_email: req.user.email,
      subject: subject,
      preview: body.substring(0, 100),
      created_at: new Date(),
      action: "received",
    });

    res.json({
      success: true,
      message: "Mail sent",
      mail_id: mail.insertId,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Mail sending failed" });
  } finally {
    conn.release();
  }
};
```

### Option 2: Using getIO() Directly

```javascript
// src/controllers/mails.controller.js
import { pool } from "../../config/db.js";
import { getIO } from "../services/socket.service.js";

export const sendMail = async (req, res) => {
  const senderId = req.user.id;
  const { subject, body } = req.body;
  let { recipients } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ... create mail, thread, recipients ...

    await conn.commit();

    // ✨ EMIT NOTIFICATIONS
    const io = getIO();
    if (io) {
      // Notify each recipient individually
      recipients.forEach((recipientId) => {
        io.to(`user_${recipientId}`).emit("mail:received", {
          mail_id: mail.insertId,
          thread_id: thread.insertId,
          sender_id: senderId,
          sender_name: req.user.name,
          sender_email: req.user.email,
          subject: subject,
          preview: body.substring(0, 100),
          created_at: new Date(),
        });
      });

      // Also notify sender (optional)
      io.to(`user_${senderId}`).emit("mail:sent", {
        mail_id: mail.insertId,
        thread_id: thread.insertId,
        recipients: recipients.length,
        subject: subject,
      });
    }

    res.json({
      success: true,
      message: "Mail sent",
      mail_id: mail.insertId,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Mail sending failed" });
  } finally {
    conn.release();
  }
};
```

---

## 📧 Mail Notification Examples

### 1. Send Mail & Notify Recipients

```javascript
export const sendMail = async (req, res) => {
  const senderId = req.user.id;
  const { subject, body, recipients } = req.body;

  // ... database operations ...

  // Emit to recipients
  emitToUsers(recipients, "mail:received", {
    mail_id: mailId,
    thread_id: threadId,
    sender_id: senderId,
    sender_name: req.user.name,
    sender_email: req.user.email,
    subject,
    preview: body.substring(0, 100),
    created_at: new Date(),
  });

  res.json({ success: true, mail_id: mailId });
};
```

### 2. Reply to Mail Thread

```javascript
export const replyMail = async (req, res) => {
  const replyerId = req.user.id;
  const { thread_id, body } = req.body;

  // ... database operations to create reply ...

  // Get all participants in thread (except replier)
  const [threadParticipants] = await pool.query(
    `
    SELECT DISTINCT mr.recipient_id
    FROM mail_recipients mr
    JOIN mails m ON m.id = mr.mail_id
    WHERE m.thread_id = ? AND mr.recipient_id != ?
    UNION
    SELECT DISTINCT m.sender_id
    FROM mails m
    WHERE m.thread_id = ? AND m.sender_id != ?
    `,
    [thread_id, replyerId, thread_id, replyerId]
  );

  // Extract user IDs
  const participantIds = threadParticipants.map((p) => p.recipient_id);

  // Notify all participants
  emitToUsers(participantIds, "mail:replied", {
    mail_id: newMailId,
    thread_id: thread_id,
    reply_from: replyerId,
    reply_from_name: req.user.name,
    reply_from_email: req.user.email,
    body: body.substring(0, 100),
    created_at: new Date(),
  });

  res.json({ success: true, message: "Reply sent" });
};
```

### 3. Delete Mail & Notify

```javascript
export const deleteMail = async (req, res) => {
  const userId = req.user.id;
  const { mail_id } = req.params;

  // Fetch mail details
  const [mail] = await pool.query(
    `SELECT sender_id, thread_id FROM mails WHERE id = ?`,
    [mail_id]
  );

  if (!mail.length) {
    return res.status(404).json({ success: false, message: "Mail not found" });
  }

  // Soft delete
  await pool.query(`UPDATE mails SET is_deleted = 1 WHERE id = ?`, [mail_id]);

  // Get mail recipients
  const [recipients] = await pool.query(
    `SELECT recipient_id FROM mail_recipients WHERE mail_id = ?`,
    [mail_id]
  );

  const recipientIds = recipients.map((r) => r.recipient_id);

  // Notify all involved users
  const affectedUsers = [
    mail[0].sender_id,
    ...recipientIds,
  ].filter((id) => id !== userId);

  emitToUsers(affectedUsers, "mail:deleted", {
    mail_id: mail_id,
    thread_id: mail[0].thread_id,
    deleted_by: userId,
    deleted_by_name: req.user.name,
    deleted_at: new Date(),
  });

  res.json({ success: true, message: "Mail deleted" });
};
```

---

## 🔔 Other Notification Types

### Task Notifications

```javascript
// src/controllers/tasks.controller.js
import { emitToUser, emitToUsers } from "../services/socket.service.js";

export const assignTask = async (req, res) => {
  const { task_id, assigned_to } = req.body;

  // ... assign task ...

  emitToUser(assigned_to, "task:assigned", {
    task_id,
    assigned_by: req.user.name,
    task_name: taskName,
    due_date: dueDate,
  });

  res.json({ success: true });
};

export const updateTaskStatus = async (req, res) => {
  const { task_id, status } = req.body;

  // ... update status ...

  emitToUsers(projectMemberIds, "task:updated", {
    task_id,
    status,
    updated_by: req.user.name,
  });

  res.json({ success: true });
};
```

### Project Notifications

```javascript
// src/controllers/projects.controller.js
import { broadcastNotification } from "../services/socket.service.js";

export const createProject = async (req, res) => {
  const { name, description, members } = req.body;

  // ... create project ...

  emitToUsers(members, "project:created", {
    project_id: projectId,
    project_name: name,
    created_by: req.user.name,
  });

  res.json({ success: true });
};

export const systemMaintenance = async (req, res) => {
  // Broadcast to ALL users (system-wide)
  broadcastNotification("system:maintenance", {
    message: "Scheduled maintenance at 2 AM UTC",
    duration: "30 minutes",
  });

  res.json({ success: true });
};
```

---

## ⚠️ Error Handling

### Try-Catch Wrapper for Socket Emissions

```javascript
export const sendMailWithErrorHandling = async (req, res) => {
  const senderId = req.user.id;
  const { subject, body, recipients } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ... create mail ...

    await conn.commit();

    // ✨ EMIT NOTIFICATIONS WITH ERROR HANDLING
    try {
      emitToUsers(recipients, "mail:received", {
        mail_id: mailId,
        thread_id: threadId,
        sender_id: senderId,
        sender_name: req.user.name,
        sender_email: req.user.email,
        subject,
        preview: body.substring(0, 100),
        created_at: new Date(),
      });
    } catch (socketError) {
      // Log but don't fail the request
      console.error("Socket emit error:", socketError);
      // Mail was created successfully, just notify failed
    }

    res.json({ success: true, mail_id: mailId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Mail sending failed" });
  } finally {
    conn.release();
  }
};
```

---

## ✅ Best Practices

### 1. **Always Check if IO is Available**

```javascript
// ❌ DON'T
const io = getIO();
io.to(`user_${userId}`).emit("event", data);

// ✅ DO
const io = getIO();
if (io) {
  io.to(`user_${userId}`).emit("event", data);
} else {
  console.warn("Socket.IO not initialized");
}
```

### 2. **Use Helper Functions for Consistency**

```javascript
// ✅ GOOD - Clear intent
emitToUser(userId, "mail:received", data);
emitToUsers([1, 2, 3], "task:assigned", data);

// ❌ AVOID - Unclear patterns
io.to(`user_${userId}`).emit(...);
recipients.forEach((r) => io.to(`user_${r}`).emit(...));
```

### 3. **Implement Proper Error Handling**

```javascript
export const notifyUsers = (userIds, event, data) => {
  try {
    const io = getIO();
    if (!io) {
      console.error("Socket.IO not available");
      return;
    }

    emitToUsers(userIds, event, data);
  } catch (error) {
    console.error(`Failed to emit ${event}:`, error);
    // Don't crash the main request
  }
};
```

### 4. **Include Metadata in Events**

```javascript
// ✅ GOOD - Rich context
emitToUser(userId, "mail:received", {
  mail_id: 123,
  thread_id: 456,
  sender_id: 789,
  sender_name: "John Doe",
  sender_email: "john@example.com",
  subject: "Hello",
  preview: "Hi there...",
  created_at: new Date(),
  action: "received",
});

// ❌ AVOID - Minimal data
emitToUser(userId, "mail:received", { mail_id: 123 });
```

### 5. **Document Custom Events**

```javascript
/**
 * Notify user of new mail
 *
 * @event mail:received
 * @param {number} mail_id - Mail ID
 * @param {number} sender_id - Sender user ID
 * @param {string} subject - Mail subject
 * @param {timestamp} created_at - Creation time
 */
emitToUser(userId, "mail:received", {
  mail_id,
  sender_id,
  subject,
  created_at,
});
```

### 6. **Handle User Disconnections Gracefully**

```javascript
export const sendNotificationToUser = (userId, event, data) => {
  const io = getIO();
  if (io) {
    // This automatically handles if user is not connected
    // Message will be lost, so consider implementing:
    // 1. Database backup for offline users
    // 2. Mark as "unseen" in database
    // 3. Show unread count on next login
    io.to(`user_${userId}`).emit(event, data);
  }
};

// Alternative: Store notification in DB for offline users
export const notifyWithFallback = async (userId, event, data) => {
  const io = getIO();

  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  } else {
    // Store in DB for later retrieval
    await storeNotificationInDatabase(userId, event, data);
  }
};
```

### 7. **Add Request/Response Logging**

```javascript
socket.on("mail:received", (data) => {
  console.log(`[${new Date().toISOString()}] Mail received event:`, {
    userId: socket.userId,
    mail_id: data.mail_id,
    from: data.sender_name,
  });
});
```

---

## 🚀 Environment Setup

Ensure your `.env` file has:

```env
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development

# Or for production
NODE_ENV=production
```

---

## 📱 Testing Socket Events

### Using Socket.IO Client

```bash
npm install socket.io-client
```

```javascript
import { io } from "socket.io-client";

const token = "your_jwt_token";
const socket = io("http://localhost:3000", {
  auth: { token },
});

socket.on("connect", () => {
  console.log("Connected!");
});

socket.on("mail:received", (data) => {
  console.log("New mail:", data);
});

socket.on("disconnect", () => {
  console.log("Disconnected!");
});
```

---

## 📚 Summary

| Task | Function | Usage |
| --- | --- | --- |
| Send to 1 user | `emitToUser()` | Notify specific user |
| Send to multiple | `emitToUsers()` | Notify list of users |
| Broadcast all | `broadcastNotification()` | System-wide alerts |
| Get instance | `getIO()` | Manual room management |

---

✨ **Your Socket.IO real-time notification system is production-ready!**

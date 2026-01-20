/**
 * SOCKET.IO REAL-TIME SERVICE (FINAL FIX)
 * JWT Auth + Auto Room Join + User-based Emit
 */

import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io = null;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://localhost:8080",
        "https://zenith-board-hub.lovable.app",
        "https://orbit-grid-suite.lovable.app",
      ],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // 🔐 JWT AUTH MIDDLEWARE
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userEmail = decoded.email;
      socket.userName = decoded.name;

      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log("✅ Socket connected:", socket.id, "User:", socket.userId);

    // ✅ AUTO JOIN USER ROOM
    socket.join(`user_${socket.userId}`);
    console.log(`📍 Joined room user_${socket.userId}`);

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", socket.id);
    });
  });

  console.log("🚀 Socket.IO initialized");
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

// 🔔 EMIT HELPERS
export const emitToUser = (userId, event, data) => {
  const io = getIO();
  io.to(`user_${userId}`).emit(event, data);
};

export const emitToUsers = (userIds, event, data) => {
  const io = getIO();
  userIds.forEach((id) => {
    io.to(`user_${id}`).emit(event, data);
  });
};

export const broadcast = (event, data) => {
  const io = getIO();
  io.emit(event, data);
};

import express from "express";
import {
  sendMail,
  getInbox,
  getSentMails,
  getMailDetail,
  markAsRead,
  deleteMail,
  replyMail,
  getMailUserSuggestions,
  getAllMailsAdmin
} from "../controllers/mails.controller.js";

import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";
import { mailUpload } from "../middleware/upload.js";

const router = express.Router();

/**
 * SEND MAIL (Create thread + mail)
 */
router.post(
  "/",
  requireAuth,
  mailUpload,
  sendMail
);

router.get(
  "/users/suggestions",
  requireAuth,
  getMailUserSuggestions
);

/**
 * GET INBOX MAILS
 */
router.get(
  "/inbox",
  requireAuth,
  getInbox
);

/**
 * GET SENT MAILS
 */
router.get(
  "/sent",
  requireAuth,
  getSentMails
);

/**
 * GET SINGLE MAIL DETAIL (with attachments)
 */
router.get(
  "/:id",
  requireAuth,
  getMailDetail
);

/**
 * MARK MAIL AS READ
 */
router.put(
  "/:id/read",
  requireAuth,
  markAsRead
);

/**
 * DELETE MAIL (SOFT DELETE)
 */
router.delete(
  "/:id",
  requireAuth,
  deleteMail
);

/**
 * REPLY TO THREAD
 */
router.post(
  "/:mailId/reply",
  requireAuth,
  mailUpload,
  replyMail
);


// GET ALL MAILS (ADMIN)
router.get(
  "/admin/all",
  requireAuth,
  requirePermission("view_all_mails"),
  getAllMailsAdmin
);


export default router;

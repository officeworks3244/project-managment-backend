

import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = "src/uploads";

// Create upload directories
["images", "documents", "others"].forEach((dir) => {
  const fullPath = path.join(uploadDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "others";
    if (file.mimetype.startsWith("image/")) folder = "images";
    else if (file.mimetype.includes("pdf") || file.mimetype.includes("document")) folder = "documents";
    
    cb(null, path.join(uploadDir, folder));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Flexible field name handler - accepts profile_image or file
export const uploadSingle = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).fields([
  { name: 'profile_image', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]);

export const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// For mail attachments - handle both files and text fields
export const mailUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
}).array("attachments", 10); // 🔥 NOW MATCHING FRONTEND

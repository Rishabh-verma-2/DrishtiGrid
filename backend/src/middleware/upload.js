/**
 * Multer middleware for image upload validation.
 * Accepts: JPG, JPEG, PNG only.
 * Supports both single and multi-image upload streams.
 */

const multer = require("multer");
const path = require("path");

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "50", 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const mimeType = (file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (ALLOWED_MIME_TYPES.has(mimeType) || ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        `Unsupported file type: ${mimeType || ext}. Only JPG, JPEG, and PNG are accepted.`
      ),
      false
    );
  }
}

// Single image upload middleware
const uploadSingle = multer({
  storage,
  limits: {
    fileSize: MAX_BYTES,
    files: 1,
  },
  fileFilter,
});

// Multi-image upload middleware (up to 20 images)
const uploadMulti = multer({
  storage,
  limits: {
    fileSize: MAX_BYTES,
    files: 20,
  },
  fileFilter,
});

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/webm",
  "application/octet-stream",
]);

const ALLOWED_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm"]);

const MAX_VIDEO_MB = parseInt(process.env.MAX_VIDEO_SIZE_MB || "150", 10);
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

function videoFileFilter(req, file, cb) {
  const mimeType = (file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (ALLOWED_VIDEO_MIME_TYPES.has(mimeType) || ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        `Unsupported video type: ${mimeType || ext}. Only MP4, MOV, MKV, AVI, and WEBM are accepted.`
      ),
      false
    );
  }
}

// Video upload middleware
const uploadVideo = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_BYTES,
    files: 1,
  },
  fileFilter: videoFileFilter,
});

module.exports = {
  upload: uploadSingle,
  uploadSingle,
  uploadMulti,
  uploadVideo,
  MAX_BYTES,
  MAX_VIDEO_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
};


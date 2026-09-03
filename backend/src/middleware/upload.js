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

module.exports = {
  upload: uploadSingle,
  uploadSingle,
  uploadMulti,
  MAX_BYTES,
  ALLOWED_MIME_TYPES,
};

/**
 * Cloudinary Integration Service for DrishtiGrid ANPR & Footage Requisition.
 * Handles:
 * 1. Upload of raw surveillance videos and plate crop evidence.
 * 2. Automated deletion of non-matching license plate crops.
 * 3. Secure storage and retrieval of AES-256-GCM encrypted evidence binaries with local fallback.
 */

const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Readable } = require("stream");
const logger = require("../utils/logger");

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Local fallback directory for offline safety
const LOCAL_FALLBACK_DIR = path.join(__dirname, "../../uploads/evidence");
if (!fs.existsSync(LOCAL_FALLBACK_DIR)) {
  try {
    fs.mkdirSync(LOCAL_FALLBACK_DIR, { recursive: true });
  } catch (e) {
    logger.warn(`Could not create local fallback dir ${LOCAL_FALLBACK_DIR}: ${e.message}`);
  }
}

/**
 * Upload raw video buffer to Cloudinary.
 * @param {Buffer} buffer - Raw video file buffer
 * @param {string} videoId - Unique video tracking identifier
 * @returns {Promise<{ url: string|null, public_id: string|null }>}
 */
async function uploadVideo(buffer, videoId) {
  return new Promise((resolve) => {
    try {
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
        return resolve({
          url: null,
          public_id: null,
          error: "Cloudinary credentials not configured",
        });
      }

      const publicId = `drishtigrid/videos/${videoId}`;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          public_id: publicId,
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            console.error(`[Cloudinary] uploadVideo error for ${videoId}:`, error.message || error);
            return resolve({
              url: null,
              public_id: null,
              error: error.message || "Cloudinary video upload failed",
            });
          }
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        }
      );

      Readable.from(buffer).pipe(uploadStream);
    } catch (err) {
      console.error(`[Cloudinary] uploadVideo stream exception for ${videoId}:`, err.message);
      resolve({
        url: null,
        public_id: null,
        error: err.message,
      });
    }
  });
}

/**
 * Upload a cropped plate image to Cloudinary.
 * Public ID pattern: drishtigrid/{videoId}/{frameSecond}_{plateIndex}
 * @param {Buffer} buffer - Image buffer (JPEG/PNG)
 * @param {string} videoId - Video ID
 * @param {number|string} frameSecond - Frame offset in seconds
 * @param {number|string} plateIndex - Index of plate within the frame
 * @returns {Promise<{ url: string|null, public_id: string|null, error?: string }>}
 */
async function uploadPlateCrop(buffer, videoId, frameSecond, plateIndex) {
  return new Promise((resolve) => {
    try {
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
        return resolve({
          url: null,
          public_id: null,
          error: "Cloudinary credentials not configured",
        });
      }

      const publicId = `drishtigrid/${videoId}/${frameSecond}_${plateIndex}`;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          public_id: publicId,
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            console.error(
              `[Cloudinary] uploadPlateCrop error for ${publicId}:`,
              error.message || error
            );
            return resolve({
              url: null,
              public_id: null,
              error: error.message || "Cloudinary crop upload failed",
            });
          }
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        }
      );

      Readable.from(buffer).pipe(uploadStream);
    } catch (err) {
      console.error(`[Cloudinary] uploadPlateCrop stream exception for ${videoId}:`, err.message);
      resolve({
        url: null,
        public_id: null,
        error: err.message,
      });
    }
  });
}

/**
 * Delete an asset (image or video) from Cloudinary.
 * @param {string} public_id - Public ID of asset to delete
 * @param {string} [resource_type='image'] - 'image' or 'video'
 * @returns {Promise<any>}
 */
async function deleteAsset(public_id, resource_type = "image") {
  if (!public_id) return { result: "skipped_no_id" };
  try {
    const res = await cloudinary.uploader.destroy(public_id, {
      resource_type,
    });
    return res;
  } catch (err) {
    console.error(`[Cloudinary] deleteAsset error for ${public_id}:`, err.message || err);
    return { result: "error", error: err.message };
  }
}

/**
 * Upload an encrypted buffer to Cloudinary as secure raw resource with local fallback
 * @param {Buffer} encryptedBuffer
 * @param {string} ticketId
 * @param {string} evidenceId
 * @returns {Promise<{ publicId: string, secureUrl: string, resourceType: string, version?: string, isLocalFallback?: boolean }>}
 */
async function uploadEncryptedBuffer(encryptedBuffer, ticketId, evidenceId) {
  const publicId = `drishtigrid/evidence/${ticketId}_${evidenceId}`;

  // Ensure local directory exists
  if (!fs.existsSync(LOCAL_FALLBACK_DIR)) {
    try {
      fs.mkdirSync(LOCAL_FALLBACK_DIR, { recursive: true });
    } catch (e) {}
  }

  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      try {
        const fallbackPath = path.join(LOCAL_FALLBACK_DIR, `${ticketId}_${evidenceId}.bin`);
        fs.writeFileSync(fallbackPath, encryptedBuffer);
        logger.info(`Stored encrypted evidence locally: ${fallbackPath}`);
        return resolve({
          publicId,
          secureUrl: `/uploads/evidence/${ticketId}_${evidenceId}.bin`,
          resourceType: "raw",
          isLocalFallback: true,
        });
      } catch (localErr) {
        return reject(new Error(`Failed to store encrypted evidence locally: ${localErr.message}`));
      }
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id: publicId,
        overwrite: true,
        folder: "drishtigrid/evidence",
        tags: ["cctv_evidence", ticketId, evidenceId],
      },
      (error, result) => {
        if (error) {
          logger.warn(`Cloudinary upload failed: ${error.message}. Storing in secure local fallback archive.`);
          try {
            const fallbackPath = path.join(LOCAL_FALLBACK_DIR, `${ticketId}_${evidenceId}.bin`);
            fs.writeFileSync(fallbackPath, encryptedBuffer);
            return resolve({
              publicId,
              secureUrl: `/uploads/evidence/${ticketId}_${evidenceId}.bin`,
              resourceType: "raw",
              isLocalFallback: true,
            });
          } catch (localErr) {
            return reject(new Error(`Failed to store encrypted evidence: ${error.message} && ${localErr.message}`));
          }
        }

        logger.info(`Encrypted evidence stored in Cloudinary: ${result.public_id} (${result.secure_url})`);
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          resourceType: result.resource_type || "raw",
          version: result.version ? String(result.version) : undefined,
        });
      }
    );

    Readable.from(encryptedBuffer).pipe(uploadStream);
  });
}

/**
 * Fetch raw encrypted buffer from Cloudinary URL or local fallback
 * @param {string} secureUrl 
 * @param {string} publicId 
 * @returns {Promise<Buffer>}
 */
async function fetchEncryptedBuffer(secureUrl, publicId) {
  // 1. Check if it's explicitly a local fallback path
  if (secureUrl && secureUrl.startsWith("/uploads/evidence/")) {
    const fileName = path.basename(secureUrl);
    const localPath = path.join(LOCAL_FALLBACK_DIR, fileName);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
  }

  // 2. Also check if local fallback file exists under ticketId_evidenceId
  if (publicId) {
    const cleanId = publicId.split("/").pop();
    const localPath = path.join(LOCAL_FALLBACK_DIR, `${cleanId}.bin`);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
  }

  // 3. Fetch from remote Cloudinary URL via axios
  if (secureUrl && (secureUrl.startsWith("http://") || secureUrl.startsWith("https://"))) {
    try {
      const response = await axios.get(secureUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxRedirects: 5,
      });
      return Buffer.from(response.data);
    } catch (err) {
      logger.error(`[Cloudinary] Error fetching encrypted buffer from URL ${secureUrl}: ${err.message}`);
      throw new Error(`Failed to fetch encrypted asset from Cloudinary: ${err.message}`);
    }
  }

  throw new Error(`No valid URL or local fallback found for evidence asset: ${publicId || secureUrl}`);
}

module.exports = {
  uploadVideo,
  uploadPlateCrop,
  deleteAsset,
  uploadEncryptedBuffer,
  fetchEncryptedBuffer,
  cloudinary,
};

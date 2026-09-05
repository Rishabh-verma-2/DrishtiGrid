/**
 * Cloudinary Integration Service for DrishtiGrid ANPR.
 * Handles upload of raw surveillance videos, structured plate crop evidence,
 * and automated deletion of non-matching license plate crops.
 */

const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

let isCloudinaryDisabled = false;

function checkAndMarkAuthError(error) {
  if (!error) return;
  const msg = String(error.message || error);
  const code = error.http_code;
  if (code === 401 || code === 403 || msg.includes("403") || msg.includes("401") || msg.includes("disabled")) {
    if (!isCloudinaryDisabled) {
      console.warn(`[Cloudinary] Authentication failed (${msg}). Disabling Cloudinary uploads to avoid delay and falling back to direct base64 storage.`);
      isCloudinaryDisabled = true;
    }
  }
}

/**
 * Upload raw video buffer to Cloudinary.
 * @param {Buffer} buffer - Raw video file buffer
 * @param {string} videoId - Unique video tracking identifier
 * @returns {Promise<{ url: string, public_id: string }>}
 */
async function uploadVideo(buffer, videoId) {
  if (isCloudinaryDisabled) {
    return { url: null, public_id: null, error: "Cloudinary disabled" };
  }

  return new Promise((resolve) => {
    try {
      const publicId = `drishtigrid/videos/${videoId}`;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          public_id: publicId,
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            checkAndMarkAuthError(error);
            console.error(`[Cloudinary] uploadVideo error for ${videoId}:`, error.message || error);
            // Return null url and public_id so video processing continues uninterrupted
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
      checkAndMarkAuthError(err);
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
  if (isCloudinaryDisabled) {
    return { url: null, public_id: null, error: "Cloudinary disabled" };
  }

  return new Promise((resolve) => {
    try {
      const publicId = `drishtigrid/${videoId}/${frameSecond}_${plateIndex}`;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          public_id: publicId,
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            checkAndMarkAuthError(error);
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
      checkAndMarkAuthError(err);
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
 * Used for GDPR / privacy compliance to clean up non-matching vehicle crops.
 * @param {string} publicId - Cloudinary public identifier
 * @param {string} resourceType - "image" | "video"
 * @returns {Promise<{ success: boolean, result?: any, error?: string }>}
 */
async function deleteAsset(publicId, resourceType = "image") {
  if (isCloudinaryDisabled || !publicId) {
    return { success: false, error: "Cloudinary disabled or no publicId" };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    return {
      success: result.result === "ok",
      result: result.result,
    };
  } catch (err) {
    checkAndMarkAuthError(err);
    console.error(`[Cloudinary] deleteAsset error for ${publicId}:`, err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  uploadVideo,
  uploadPlateCrop,
  deleteAsset,
};

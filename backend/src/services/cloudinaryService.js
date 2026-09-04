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

/**
 * Upload raw video buffer to Cloudinary.
 * @param {Buffer} buffer - Raw video file buffer
 * @param {string} videoId - Unique video tracking identifier
 * @returns {Promise<{ url: string, public_id: string }>}
 */
async function uploadVideo(buffer, videoId) {
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

module.exports = {
  uploadVideo,
  uploadPlateCrop,
  deleteAsset,
};

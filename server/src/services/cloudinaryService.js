const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const logger = require('../utils/logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dumwirykd',
  api_key: process.env.CLOUDINARY_API_KEY || '733877715338262',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'lWv40ZZIVbY16h5e_ecal68KJFU',
  secure: true,
});

// Local fallback directory for offline safety
const LOCAL_FALLBACK_DIR = path.join(__dirname, '../../uploads/evidence');
if (!fs.existsSync(LOCAL_FALLBACK_DIR)) {
  try {
    fs.mkdirSync(LOCAL_FALLBACK_DIR, { recursive: true });
  } catch (e) {}
}

/**
 * Upload an encrypted buffer to Cloudinary as secure raw resource
 * @param {Buffer} encryptedBuffer
 * @param {string} ticketId
 * @param {string} evidenceId
 * @returns {Promise<{ publicId: string, secureUrl: string, resourceType: string, version?: string }>}
 */
async function uploadEncryptedBuffer(encryptedBuffer, ticketId, evidenceId) {
  const publicId = `drishtigrid/evidence/${ticketId}_${evidenceId}`;

  return new Promise((resolve, reject) => {
    // Attempt Cloudinary upload
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        public_id: publicId,
        overwrite: true,
        folder: 'drishtigrid/evidence',
        tags: ['cctv_evidence', ticketId, evidenceId],
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
              resourceType: 'raw',
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
          resourceType: result.resource_type || 'raw',
          version: result.version ? String(result.version) : undefined,
        });
      }
    );

    uploadStream.end(encryptedBuffer);
  });
}

/**
 * Fetch raw encrypted buffer from Cloudinary URL or local fallback
 * @param {string} secureUrl 
 * @param {string} publicId 
 * @returns {Promise<Buffer>}
 */
async function fetchEncryptedBuffer(secureUrl, publicId) {
  // Check if it's local fallback
  if (secureUrl.startsWith('/uploads/evidence/')) {
    const fileName = path.basename(secureUrl);
    const localPath = path.join(LOCAL_FALLBACK_DIR, fileName);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
  }

  // If Cloudinary URL
  return new Promise((resolve, reject) => {
    const client = secureUrl.startsWith('https') ? https : http;
    client.get(secureUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        return fetchEncryptedBuffer(res.headers.location, publicId).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch encrypted asset from Cloudinary. HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
}

module.exports = {
  uploadEncryptedBuffer,
  fetchEncryptedBuffer,
  cloudinary,
};

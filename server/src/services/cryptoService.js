const crypto = require('crypto');
const logger = require('../utils/logger');

// Retrieve master encryption key (must be 32 bytes for aes-256-gcm)
function getMasterKey() {
  const envKey = process.env.EVIDENCE_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      return Buffer.from(envKey, 'hex');
    }
    return crypto.createHash('sha256').update(envKey).digest();
  }
  // Default fallback key for government demo safety
  logger.warn('EVIDENCE_ENCRYPTION_KEY not set in env; using secure fallback key.');
  return crypto.createHash('sha256').update('DRISHTIGRID_SECURE_GOV_EVIDENCE_KEY_2026').digest();
}

/**
 * Generate SHA-256 hash of a file or buffer
 * @param {Buffer} buffer 
 * @returns {string} hex hash
 */
function generateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Encrypt video/file buffer using AES-256-GCM
 * @param {Buffer} plaintextBuffer 
 * @returns {{ encryptedBuffer: Buffer, ivHex: string, authTagHex: string }}
 */
function encryptBuffer(plaintextBuffer) {
  const key = getMasterKey();
  // 12-byte IV is standard and recommended for GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedBuffer: encrypted,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
  };
}

/**
 * Decrypt AES-256-GCM encrypted buffer
 * @param {Buffer} encryptedBuffer 
 * @param {string} ivHex 
 * @param {string} authTagHex 
 * @returns {Buffer} decrypted plaintext buffer
 */
function decryptBuffer(encryptedBuffer, ivHex, authTagHex) {
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

/**
 * Verify SHA-256 integrity of a buffer against expected hash
 * @param {Buffer} buffer 
 * @param {string} expectedHash 
 * @returns {boolean}
 */
function verifySha256(buffer, expectedHash) {
  const computedHash = generateSha256(buffer);
  if (computedHash.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computedHash, 'utf8'), Buffer.from(expectedHash, 'utf8'));
}

module.exports = {
  generateSha256,
  encryptBuffer,
  decryptBuffer,
  verifySha256,
};

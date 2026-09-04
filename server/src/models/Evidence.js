const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema(
  {
    evidenceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FootageTicket',
      required: true,
      index: true,
    },
    ticketId: {
      type: String,
      required: true,
      index: true,
    },
    camera: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camera',
    },
    cameraId: {
      type: String,
      required: true,
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      default: 'video/mp4',
    },
    fileSizeBytes: {
      type: Number,
      required: true,
    },
    cloudinaryAsset: {
      publicId: { type: String, required: true },
      secureUrl: { type: String, required: true },
      resourceType: { type: String, default: 'raw' },
      format: { type: String, default: 'bin' },
      version: { type: String },
    },
    // Cryptographic verification hash (computed on raw video prior to encryption)
    sha256Hash: {
      type: String,
      required: [true, 'SHA-256 integrity hash is mandatory'],
      index: true,
    },
    // AES-256-GCM encryption metadata (Secret key is NEVER stored here)
    encryption: {
      algorithm: { type: String, default: 'aes-256-gcm' },
      iv: { type: String, required: true }, // Initialization vector in hex
      authTag: { type: String, required: true }, // Authentication tag in hex
      isEncrypted: { type: Boolean, default: true },
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploadedByName: {
      type: String,
      required: true,
    },
    uploadedByDept: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'verified', 'tampered', 'archived'],
      default: 'active',
      index: true,
    },
    integrityStatus: {
      type: String,
      enum: ['pending', 'verified', 'compromised'],
      default: 'verified',
    },
    recordingStartTime: {
      type: Date,
    },
    recordingEndTime: {
      type: Date,
    },
    metadata: {
      resolution: { type: String, default: '1080p' },
      fps: { type: Number, default: 30 },
      codec: { type: String, default: 'h264' },
      remarks: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

evidenceSchema.index({ ticketId: 1, createdAt: -1 });
evidenceSchema.index({ uploadedByDept: 1, createdAt: -1 });

module.exports = mongoose.model('Evidence', evidenceSchema);

const mongoose = require('mongoose');

const rowAnalysisSchema = new mongoose.Schema(
  {
    rowNumber: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['VALID', 'WARNING', 'ERROR', 'DUPLICATE', 'IMPORTED', 'SKIPPED'],
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    normalized: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    errors: [
      {
        field: String,
        value: mongoose.Schema.Types.Mixed,
        problem: String,
        expected: String,
        suggestion: String,
      },
    ],
    warnings: [
      {
        field: String,
        value: mongoose.Schema.Types.Mixed,
        problem: String,
      },
    ],
    isDuplicate: {
      type: Boolean,
      default: false,
    },
    duplicateReason: {
      type: String,
      default: '',
    },
  },
  { _id: false, suppressReservedKeysWarning: true }
);

const importSessionSchema = new mongoose.Schema(
  {
    importId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploaderName: {
      type: String,
      default: '',
    },
    uploaderRole: {
      type: String,
      default: '',
    },
    filename: {
      type: String,
      required: true,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        'UPLOADED',
        'VALIDATED',
        'CONFIRMED',
        'IMPORTING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'EXPIRED',
      ],
      default: 'VALIDATED',
      index: true,
    },
    summary: {
      total: { type: Number, default: 0 },
      valid: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      imported: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    rows: [rowAnalysisSchema],
    headersFound: [String],
    headersMissing: [String],
    headersUnknown: [String],
    committedAt: Date,
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours expiry
      index: { expires: 0 }, // MongoDB TTL index on expiresAt
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    suppressReservedKeysWarning: true,
  }
);

module.exports = mongoose.model('ImportSession', importSessionSchema);

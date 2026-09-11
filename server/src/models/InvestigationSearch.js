const mongoose = require('mongoose');

const investigationSearchSchema = new mongoose.Schema(
  {
    searchId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    case: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FirCase',
      required: true,
      index: true,
    },
    caseId: {
      type: String,
      required: true,
      index: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InvestigationAssignment',
    },
    departmentCode: {
      type: String,
      required: true,
      index: true,
    },
    departmentName: {
      type: String,
      default: '',
    },
    executedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    executedByName: {
      type: String,
      required: true,
    },

    // Search Configuration
    searchType: {
      type: String,
      enum: ['ANPR', 'FACE', 'VEHICLE_COLOR_TYPE', 'PERSON_DESCRIPTION', 'MULTI_FACTOR'],
      default: 'ANPR',
    },
    targetPlate: {
      type: String,
      uppercase: true,
      trim: true,
      default: '',
    },
    targetPersonName: {
      type: String,
      trim: true,
      default: '',
    },
    filters: {
      dateFrom: Date,
      dateTo: Date,
      timeFrom: String,
      timeTo: String,
      region: String,
      district: String,
      cameraIds: [String],
      confidenceThreshold: { type: Number, default: 80 },
    },

    // Results Summary
    matchesFound: {
      type: Number,
      default: 0,
    },
    results: [
      {
        detectionId: String,
        matchType: String,
        confidence: Number,
        cameraId: String,
        cameraName: String,
        locationName: String,
        district: String,
        coordinates: [Number], // [lng, lat]
        timestamp: Date,
        snapshotUrl: String,
        videoClipUrl: String,
        details: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

investigationSearchSchema.index({ caseId: 1, createdAt: -1 });
investigationSearchSchema.index({ departmentCode: 1, createdAt: -1 });

module.exports = mongoose.model('InvestigationSearch', investigationSearchSchema);

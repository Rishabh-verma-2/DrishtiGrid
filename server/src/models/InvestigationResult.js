const mongoose = require('mongoose');

const investigationResultSchema = new mongoose.Schema(
  {
    resultId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
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
      trim: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InvestigationAssignment',
      index: true,
    },
    departmentCode: {
      type: String,
      required: true,
      index: true,
    },
    departmentName: {
      type: String,
      required: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    submittedByName: {
      type: String,
      required: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // ─── Detection / Match Details ────────────────────────────────────
    matchLabel: {
      type: String,
      default: 'AI POTENTIAL MATCH', // Safety label: Never confirmed without human verification
    },
    detectionType: {
      type: String,
      enum: ['ANPR_MATCH', 'FACE_MATCH', 'VEHICLE_MATCH', 'PERSON_MATCH', 'MANUAL_SPOT'],
      default: 'ANPR_MATCH',
    },
    aiConfidence: {
      type: Number,
      default: 92.5,
    },
    detectionTimestamp: {
      type: Date,
      required: true,
    },
    camera: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camera',
    },
    cameraId: {
      type: String,
      required: true,
      trim: true,
    },
    cameraName: {
      type: String,
      default: '',
    },
    locationName: {
      type: String,
      required: true,
      trim: true,
    },
    district: {
      type: String,
      default: 'Gujarat',
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: [72.5714, 23.0225],
    },
    headingOrDirection: {
      type: String,
      default: 'Northbound',
    },
    detectionAttributes: {
      plateNumber: String,
      vehicleType: String,
      vehicleColor: String,
      vehicleMake: String,
      personAgeEstimate: String,
      personGenderEstimate: String,
      clothingColors: String,
      additionalNotes: String,
    },

    // ─── Evidence Files with Cryptographic Hash ───────────────────────
    evidenceFiles: [
      {
        fileId: { type: String, required: true },
        fileName: { type: String, required: true },
        fileType: { type: String, default: 'image/jpeg' }, // video/mp4, image/jpeg
        category: {
          type: String,
          enum: ['CCTV_FOOTAGE', 'FRAME_SNAPSHOT', 'VEHICLE_CROP', 'FACE_CROP', 'SUPPORTING_DOC'],
          default: 'FRAME_SNAPSHOT',
        },
        fileUrl: { type: String, required: true },
        fileSizeBytes: { type: Number, default: 0 },
        sha256Hash: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    officerRemarks: {
      type: String,
      required: [true, 'Investigating officer remarks are required'],
      trim: true,
    },

    // ─── Admin Review / Validation Workflow ───────────────────────────
    status: {
      type: String,
      enum: [
        'SUBMITTED',
        'ADMIN_VALIDATED',
        'ADMIN_REJECTED',
        'MORE_EVIDENCE_REQUIRED',
        'FORWARDED_TO_ORIGIN',
        'ORIGIN_ACKNOWLEDGED',
        'CASE_RESOLVED',
      ],
      default: 'SUBMITTED',
      index: true,
    },
    adminReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedByName: { type: String, default: '' },
      reviewedAt: Date,
      remarks: { type: String, default: '' },
      rejectionReason: { type: String, default: '' },
    },

    // ─── Originating Station Forwarding ───────────────────────────────
    forwardedToOriginAt: Date,
    forwardedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    originStationName: { type: String, default: '' },
    originAcknowledgment: {
      acknowledgedAt: Date,
      acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      acknowledgedByName: { type: String, default: '' },
      officerNotes: { type: String, default: '' },
      actionTaken: {
        type: String,
        enum: ['ACKNOWLEDGED', 'CASE_RESOLVED', 'CONTINUE_INVESTIGATION', 'DISPUTED'],
        default: 'ACKNOWLEDGED',
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

investigationResultSchema.index({ caseId: 1, status: 1 });
investigationResultSchema.index({ departmentCode: 1, status: 1 });
investigationResultSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('InvestigationResult', investigationResultSchema);

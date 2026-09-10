const mongoose = require('mongoose');
const { normalizeStatus } = require('../utils/ticketStateMachine');

const footageTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Requisition title is required'],
      trim: true,
    },
    firNumber: {
      type: String,
      trim: true,
      default: '',
    },
    caseNumber: {
      type: String,
      trim: true,
      default: '',
    },
    incidentType: {
      type: String,
      enum: [
        'Traffic Violation',
        'Criminal Investigation',
        'Accident Analysis',
        'Missing Person',
        'VIP Security',
        'Disaster Response',
        'Forensic Audit',
        'Public Safety',
        'Other',
      ],
      default: 'Criminal Investigation',
    },
    priority: {
      type: String,
      enum: ['urgent', 'high', 'medium', 'low'],
      default: 'medium',
    },
    classification: {
      type: String,
      enum: ['Confidential', 'Restricted', 'Secret', 'Official Use Only'],
      default: 'Confidential',
    },

    // ─── Requesting Department ──────────────────────────────────────
    requestingDepartment: {
      type: String,
      required: [true, 'Requesting department is required'],
      trim: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    officialDesignation: {
      type: String,
      trim: true,
      default: '',
    },
    contactPhone: {
      type: String,
      trim: true,
      default: '',
    },
    purpose: {
      type: String,
      required: [true, 'Legal purpose and justification are required for CCTV requisition'],
      trim: true,
    },

    // ─── Target Department & Camera ─────────────────────────────────
    targetDepartment: {
      type: String,
      required: [true, 'Target department is required'],
      trim: true,
      index: true,
    },
    camera: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camera',
      required: true,
    },
    cameraId: {
      type: String,
      required: true,
      trim: true,
    },
    cameraName: {
      type: String,
      trim: true,
      default: '',
    },
    locationName: {
      type: String,
      trim: true,
      default: '',
    },
    district: {
      type: String,
      trim: true,
      default: 'Gujarat',
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: [0, 0],
    },

    // ─── Footage Duration Window ───────────────────────────────────
    startTime: {
      type: Date,
      required: [true, 'Footage start time is required'],
    },
    endTime: {
      type: Date,
      required: [true, 'Footage end time is required'],
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },
    // ─── Status Lifecycle ──────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'PENDING_ADMIN_REVIEW',
        'ADMIN_APPROVED',
        'ROUTED_TO_DEPARTMENT',
        'DEPARTMENT_ACKNOWLEDGED',
        'ASSIGNED',
        'PROCESSING',
        'FOOTAGE_READY',
        'SUBMITTED',
        'AVAILABLE_TO_REQUESTER',
        'ACCESSED',
        'COMPLETED',
        'ADMIN_REJECTED',
        'DEPARTMENT_REJECTED',
        'CLARIFICATION_REQUIRED',
        'CANCELLED',
        'PROCESSING_FAILED',
        // Legacy compatibility
        'Pending',
        'Accepted',
        'Processing',
        'Evidence Uploaded',
        'Available',
        'Viewed',
        'Responded',
        'Closed',
        'Rejected',
        'submitted',
        'under_review',
        'approved',
        'dispatched',
        'rejected',
        'closed',
      ],
      default: 'PENDING_ADMIN_REVIEW',
      set: (val) => {
        if (!val) return 'PENDING_ADMIN_REVIEW';
        return normalizeStatus(val);
      },
      index: true,
    },

    // ─── Government Workflow Routing & Review ──────────────────────
    isEmergency: {
      type: Boolean,
      default: false,
      index: true,
    },
    emergencyReason: {
      type: String,
      trim: true,
      default: '',
    },
    approval: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedByName: { type: String, default: '' },
      approvedAt: Date,
      remarks: { type: String, default: '' },
    },
    rejection: {
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      rejectedByName: { type: String, default: '' },
      rejectedAt: Date,
      stage: { type: String, enum: ['ADMIN', 'DEPARTMENT'], default: 'ADMIN' },
      reason: { type: String, default: '' },
      explanation: { type: String, default: '' },
    },
    clarification: {
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      requestedByName: { type: String, default: '' },
      requestedAt: Date,
      question: { type: String, default: '' },
      response: { type: String, default: '' },
      respondedAt: Date,
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // ─── Department Operator Assignment ────────────────────────────
    assignedOperator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedOperatorName: {
      type: String,
      trim: true,
      default: '',
    },
    assignedAt: {
      type: Date,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ─── Service Level Agreement (SLA) ────────────────────────────
    slaMinutes: {
      type: Number,
      default: 240, // default 4 hours
    },
    dueAt: {
      type: Date,
      index: true,
    },
    slaBreached: {
      type: Boolean,
      default: false,
      index: true,
    },
    slaBreachedAt: {
      type: Date,
    },

    // ─── Immutable Chronological Timeline ──────────────────────────
    timeline: [
      {
        action: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        actorName: { type: String, default: 'System' },
        actorDept: { type: String, default: '' },
        actorRole: { type: String, default: '' },
        previousStatus: { type: String, default: '' },
        newStatus: { type: String, default: '' },
        remarks: { type: String, default: '' },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],

    // ─── Evidence Attachment & Resolution ─────────────────────────
    evidence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Evidence',
    },
    evidenceId: {
      type: String,
      trim: true,
      default: '',
    },
    integrityStatus: {
      type: String,
      enum: ['unverified', 'verified', 'compromised'],
      default: 'unverified',
    },
    footageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    mediaHash: {
      type: String,
      trim: true,
      default: '', // SHA-256 evidence integrity hash
    },
    evidenceFileDetails: {
      format: { type: String, default: 'MP4 / H.264' },
      fileSizeBytes: { type: Number, default: 0 },
      checksumAlgorithm: { type: String, default: 'SHA-256' },
    },
    expiresAt: {
      type: Date,
    },
    reviewRemarks: {
      type: String,
      trim: true,
      default: '',
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    dispatchedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for fast searching and department filtering
footageTicketSchema.index({ requestingDepartment: 1, status: 1 });
footageTicketSchema.index({ targetDepartment: 1, status: 1 });
footageTicketSchema.index({ assignedOperator: 1, status: 1 });
footageTicketSchema.index({ dueAt: 1, status: 1 });
footageTicketSchema.index({ cameraId: 1 });
footageTicketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FootageTicket', footageTicketSchema);

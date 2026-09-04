const mongoose = require('mongoose');

const footageAuditLogSchema = new mongoose.Schema(
  {
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
    action: {
      type: String,
      enum: [
        'TICKET_CREATED',
        'TICKET_ASSIGNED',
        'TICKET_ACCEPTED',
        'TICKET_REJECTED',
        'TICKET_PROCESSING',
        'STATUS_UPDATED',
        'EVIDENCE_UPLOAD_STARTED',
        'EVIDENCE_ENCRYPTED',
        'SHA256_GENERATED',
        'EVIDENCE_STORED_CLOUDINARY',
        'EVIDENCE_VIEWED',
        'EVIDENCE_DOWNLOADED',
        'EVIDENCE_VERIFIED',
        'RESPONSE_ADDED',
        'NOTIFICATION_SENT',
        'TICKET_CLOSED',
        // Legacy
        'REVIEW_STARTED',
        'TICKET_APPROVED',
        'FOOTAGE_ATTACHED',
        'FOOTAGE_DISPATCHED',
        'FOOTAGE_ACCESSED',
        'CONFIDENTIALITY_ACKNOWLEDGED',
      ],
      required: true,
    },
    evidenceId: {
      type: String,
      default: '',
      index: true,
    },
    actionResult: {
      type: String,
      enum: ['SUCCESS', 'FAILURE', 'COMPROMISED'],
      default: 'SUCCESS',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorName: {
      type: String,
      required: true,
    },
    actorDepartment: {
      type: String,
      required: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    actorPhone: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '127.0.0.1',
    },
    userAgent: {
      type: String,
      default: '',
    },
    previousStatus: {
      type: String,
      default: '',
    },
    newStatus: {
      type: String,
      default: '',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    integrityHash: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // Strict immutable timestamp from `timestamp` field
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

footageAuditLogSchema.index({ ticketId: 1, timestamp: -1 });
footageAuditLogSchema.index({ actorDepartment: 1, timestamp: -1 });

module.exports = mongoose.model('FootageAuditLog', footageAuditLogSchema);

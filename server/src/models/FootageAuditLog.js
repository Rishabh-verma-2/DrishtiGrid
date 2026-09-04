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
        'STATUS_UPDATED',
        'REVIEW_STARTED',
        'TICKET_APPROVED',
        'TICKET_REJECTED',
        'FOOTAGE_ATTACHED',
        'FOOTAGE_DISPATCHED',
        'FOOTAGE_ACCESSED',
        'CONFIDENTIALITY_ACKNOWLEDGED',
        'TICKET_CLOSED',
      ],
      required: true,
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

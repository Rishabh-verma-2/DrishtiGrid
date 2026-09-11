const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FootageTicket',
      index: true,
    },
    ticketId: {
      type: String,
      index: true,
    },
    caseId: {
      type: String,
      index: true,
    },
    recipientDepartment: {
      type: String,
      required: true,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE', 'ALL'],
      default: 'ALL',
    },
    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    senderUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    senderName: {
      type: String,
      default: 'System',
    },
    senderDepartment: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        'TICKET_CREATED',
        'TICKET_ACCEPTED',
        'TICKET_REJECTED',
        'TICKET_PROCESSING',
        'EVIDENCE_UPLOADED',
        'EVIDENCE_VIEWED',
        'RESPONSE_ADDED',
        'TICKET_CLOSED',
        'ALERT',
        // Department Report escalation types
        'DEPT_REPORT_CREATED',
        'DEPT_REPORT_REPLY',
        'DEPT_REPORT_STATUS_CHANGED',
        // FIR & Investigation Workflow types
        'FIR_SUBMITTED',
        'FIR_APPROVED',
        'FIR_REJECTED',
        'FIR_CORRECTION_REQUIRED',
        'INVESTIGATION_ASSIGNED',
        'INVESTIGATION_MATCH_FOUND',
        'INVESTIGATION_RESULT_SUBMITTED',
        'INVESTIGATION_RESULT_FORWARDED',
        'INVESTIGATION_RESOLVED',
        // GIS Gap Analysis types
        'GAP_ANALYSIS_REPORT',
        'GAP_ANALYSIS_STATUS_CHANGED',
      ],
      required: true,
    },
    priority: {
      type: String,
      enum: ['urgent', 'high', 'medium', 'low'],
      default: 'medium',
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    actionUrl: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

notificationSchema.index({ recipientDepartment: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientUser: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

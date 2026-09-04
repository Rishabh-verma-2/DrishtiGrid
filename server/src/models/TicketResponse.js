const mongoose = require('mongoose');

const ticketResponseSchema = new mongoose.Schema(
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
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    senderRole: {
      type: String,
      required: true,
    },
    senderDepartment: {
      type: String,
      required: true,
    },
    senderDesignation: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      required: [true, 'Response message text is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['comment', 'status_change', 'evidence_upload'],
      default: 'comment',
    },
    metadata: {
      previousStatus: { type: String },
      newStatus: { type: String },
      evidenceId: { type: String },
      fileName: { type: String },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ticketResponseSchema.index({ ticketId: 1, createdAt: 1 });

module.exports = mongoose.model('TicketResponse', ticketResponseSchema);

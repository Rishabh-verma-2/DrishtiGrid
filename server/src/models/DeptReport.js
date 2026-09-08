const mongoose = require('mongoose');

/**
 * DeptReport — formal escalation ticket raised by Admin on a Maintenance/Offline camera
 * to the owning department, with a two-way reply thread.
 */
const threadMessageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
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
      default: '',
    },
    message: {
      type: String,
      required: true,
    },
    attachment: {
      type: String,
      default: null,
    },
  },
  { _id: false, timestamps: { createdAt: 'timestamp', updatedAt: false } }
);

const deptReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Camera snapshot at time of report
    cameraId: {
      type: String,
      required: true,
      index: true,
    },
    cameraSnapshot: {
      locationName:   { type: String, default: '' },
      landmark:       { type: String, default: '' },
      statusAtReport: {
        type: String,
        enum: ['online', 'offline', 'maintenance', 'fault'],
        required: true,
      },
      departmentName: { type: String, default: '' },
      district:       { type: String, default: '' },
    },

    // Who raised it
    raisedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name:   { type: String, required: true },
      role:   { type: String, required: true },
    },

    // Department resolution
    recipientDepartment: {
      type: String,
      required: true,
      index: true,
    },
    recipientResolved: {
      type: Boolean,
      default: false,
    },
    recipientUsers: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name:   { type: String },
        email:  { type: String },
      },
    ],

    // Report content
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    category: {
      type: String,
      enum: [
        'Camera Offline',
        'Feed Malfunction',
        'Hardware Maintenance',
        'Power/Connectivity',
        'Vandalism/Physical Damage',
        'Other',
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
      minlength: [20, 'Description must be at least 20 characters'],
    },
    attachments: [{ type: String }],

    // Status lifecycle
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Action Taken', 'Resolved', 'Closed'],
      default: 'Open',
      index: true,
    },

    // Thread messages
    thread: [threadMessageSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

deptReportSchema.index({ recipientDepartment: 1, status: 1, createdAt: -1 });
deptReportSchema.index({ cameraId: 1, status: 1 });
deptReportSchema.index({ 'raisedBy.userId': 1, createdAt: -1 });

module.exports = mongoose.model('DeptReport', deptReportSchema);

const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema(
  {
    incidentId: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: [true, 'Incident title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'crime',
        'accident',
        'fire',
        'medical_emergency',
        'public_disorder',
        'natural_disaster',
        'vip_movement',
        'protest',
        'missing_person',
        'theft',
        'vandalism',
        'other',
      ],
      required: true,
    },
    priority: {
      type: String,
      enum: ['P1', 'P2', 'P3', 'P4'],
      default: 'P3',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed', 'false_alarm'],
      default: 'open',
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number], // [lng, lat]
    },
    address: {
      street: String,
      area: String,
      city: String,
      district: String,
      state: { type: String, default: 'Gujarat' },
      pincode: String,
    },
    relatedCameras: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Camera',
      },
    ],
    relatedAlerts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Alert',
      },
    ],
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    team: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Timeline/activity log
    timeline: [
      {
        action: String,
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    attachments: [
      {
        url: String,
        type: { type: String, enum: ['image', 'video', 'document'] },
        name: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: Date,
    closedAt: Date,
    district: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

incidentSchema.index({ location: '2dsphere' });
incidentSchema.index({ status: 1, priority: 1 });
incidentSchema.index({ district: 1 });
incidentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Incident', incidentSchema);

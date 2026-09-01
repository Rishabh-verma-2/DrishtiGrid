const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    alertId: {
      type: String,
      required: true,
      unique: true,
    },
    camera: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camera',
      required: true,
    },
    cameraId: String, // denormalized for quick lookup
    type: {
      type: String,
      enum: [
        'motion_detected',
        'crowd_surge',
        'camera_offline',
        'camera_tamper',
        'anpr_match',
        'face_match',
        'sos',
        'fire_smoke',
        'intrusion',
        'loitering',
        'weapon_detected',
        'accident_detected',
        'system_fault',
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'info'],
      default: 'medium',
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number],
    },
    address: {
      district: String,
      area: String,
      city: String,
    },
    snapshot: String, // URL to snapshot image
    videoClipUrl: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed, // extra data per alert type
    },
    // Status lifecycle
    status: {
      type: String,
      enum: ['active', 'acknowledged', 'resolved', 'false_alarm', 'escalated'],
      default: 'active',
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    acknowledgedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: Date,
    resolutionNote: String,
    // Escalation
    escalatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    escalatedAt: Date,
    escalationReason: String,
    // Dispatch
    dispatchedUnits: [String], // patrol units / police vehicles
    district: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

alertSchema.index({ location: '2dsphere' });
alertSchema.index({ status: 1, severity: 1 });
alertSchema.index({ camera: 1 });
alertSchema.index({ type: 1 });
alertSchema.index({ district: 1 });
alertSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);

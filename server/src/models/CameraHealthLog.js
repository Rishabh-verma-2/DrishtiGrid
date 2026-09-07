const mongoose = require('mongoose');

const cameraHealthLogSchema = new mongoose.Schema(
  {
    cameraId: {
      type: String,
      required: true,
      index: true,
    },
    cameraRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camera',
      required: false,
      index: true,
    },
    previousStatus: {
      type: String,
      enum: ['online', 'offline', 'maintenance', 'fault', 'unknown'],
      default: 'unknown',
    },
    currentStatus: {
      type: String,
      enum: ['online', 'offline', 'maintenance', 'fault'],
      required: true,
      index: true,
    },
    eventTimestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    downtimeDurationSeconds: {
      type: Number,
      default: 0,
    },
    reason: {
      type: String,
      default: 'Routine telemetry monitor check',
    },
    pingLatencyMs: {
      type: Number,
      default: 24,
    },
    packetLossPercent: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

cameraHealthLogSchema.index({ cameraId: 1, eventTimestamp: -1 });
cameraHealthLogSchema.index({ currentStatus: 1, eventTimestamp: -1 });

module.exports = mongoose.model('CameraHealthLog', cameraHealthLogSchema);

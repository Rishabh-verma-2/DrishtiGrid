const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema(
  {
    cameraId: {
      type: String,
      required: [true, 'Camera ID is required'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Camera name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // GIS Location
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Coordinates are required'],
        index: '2dsphere',
      },
    },
    latitude: Number,
    longitude: Number,
    cameraName: String,
    address: {
      full: String,
      street: String,
      area: String,
      city: String,
      district: {
        type: String,
        required: [true, 'District is required'],
      },
      taluka: String,
      state: {
        type: String,
        default: 'Gujarat',
      },
      pincode: String,
    },
    // Location & Placement Details
    locationName: String,
    landmark: String,
    roadName: String,
    locationType: String,
    city: String,
    taluka: String,
    pincode: String,
    heading: Number,
    fieldOfView: Number,
    mountingHeight: Number,
    // Stream & Hardware
    streamId: String,
    streamType: String,
    streamStatus: String,
    camera_model: String,
    fps: Number,
    recording_history_days: Number,
    // Administrative
    departmentName: String,
    departmentCode: {
      type: String,
      enum: ['POLICE', 'TRAFFIC', 'HOME_DEPT', 'SMART_CITY', 'MUNICIPAL', 'TRANSPORT', 'HIGHWAY_PATROL', 'OTHER'],
      default: 'POLICE',
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    dataSource: String,
    verified: {
      type: Boolean,
      default: false,
    },
    // Camera metadata
    type: {
      type: String,
      enum: ['PTZ', 'Fixed', 'Dome', 'Bullet', 'Fisheye', 'Thermal'],
      default: 'Fixed',
    },
    brand: String,
    model: String,
    resolution: {
      type: String,
      enum: ['720p', '1080p', '2K', '4K', '8K'],
      default: '1080p',
    },
    // Status & Health
    status: {
      type: String,
      enum: ['online', 'offline', 'maintenance', 'fault'],
      default: 'offline',
    },
    lastHeartbeat: {
      type: Date,
    },
    uptime: {
      type: Number, // percentage
      default: 0,
    },
    healthMetrics: {
      uptime24h: { type: Number, default: 98.4 },
      uptime7d: { type: Number, default: 97.8 },
      uptime30d: { type: Number, default: 96.5 },
      lastOfflineAt: Date,
      totalOutagesCount: { type: Number, default: 0 },
      longestOutageMinutes: { type: Number, default: 0 },
      meanTimeToRepairMinutes: { type: Number, default: 28 },
    },
    // Coverage
    coverageAngle: {
      type: Number, // degrees
      default: 90,
    },
    coverageRadius: {
      type: Number, // meters
      default: 50,
    },
    // Classification / Tags
    zone: {
      type: String,
      enum: [
        'Traffic',
        'Public Space',
        'Market',
        'School Zone',
        'Hospital',
        'Religious Site',
        'Border',
        'Industrial',
        'Residential',
        'Other',
      ],
      default: 'Public Space',
    },
    tags: [String],
    // Alerts enabled
    alertsEnabled: {
      motionDetection: { type: Boolean, default: true },
      crowdDetection: { type: Boolean, default: false },
      nightVision: { type: Boolean, default: false },
      anprEnabled: { type: Boolean, default: false }, // Number Plate Recognition
      faceRecognition: { type: Boolean, default: false },
    },
    // Assignments
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    district: {
      type: String,
      required: true,
    },
    policeStation: String,
    // Maintenance
    installationDate: Date,
    lastMaintenance: Date,
    nextMaintenance: Date,
    warrantyExpiry: Date,
    // Soft delete
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes (cameraId is already indexed via unique:true)
cameraSchema.index({ location: '2dsphere' });
cameraSchema.index({ district: 1, status: 1 });
cameraSchema.index({ status: 1 });
cameraSchema.index({ zone: 1 });

// Virtual: days since last maintenance
cameraSchema.virtual('daysSinceLastMaintenance').get(function () {
  if (!this.lastMaintenance) return null;
  return Math.floor((Date.now() - this.lastMaintenance) / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model('Camera', cameraSchema);

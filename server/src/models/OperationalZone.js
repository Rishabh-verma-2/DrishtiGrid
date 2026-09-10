const mongoose = require('mongoose');

const operationalZoneSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Zone name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['RESTRICTED', 'EVENT', 'VIP', 'EMERGENCY', 'SURVEILLANCE', 'OPERATIONAL', 'CUSTOM'],
      default: 'OPERATIONAL',
      index: true,
    },
    department: {
      type: String,
      default: 'Gujarat Police Department',
    },
    departmentCode: {
      type: String,
      enum: ['POLICE', 'TRAFFIC', 'HOME_DEPT', 'SMART_CITY', 'MUNICIPAL', 'OTHER'],
      default: 'POLICE',
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    // GeoJSON Polygon or Point with radius
    geometry: {
      type: {
        type: String,
        enum: ['Polygon', 'Point'],
        default: 'Polygon',
      },
      coordinates: {
        type: mongoose.Schema.Types.Mixed, // [[[lng, lat], ...]] for Polygon, [lng, lat] for Point
        required: true,
      },
    },
    // Radius in meters (when geometry is Point)
    radiusMeters: {
      type: Number,
      default: 500,
    },
    district: {
      type: String,
      required: true,
      index: true,
    },
    city: String,
    taluka: String,
    description: String,
    // Zone Specific Rules & Thresholds
    rules: {
      crowdThreshold: {
        type: Number,
        default: 100, // Trigger crowd alert if crowd count exceeds threshold inside zone
      },
      speedLimitKmh: {
        type: Number,
        default: 50,
      },
      alertOnRestrictedEntry: {
        type: Boolean,
        default: true,
      },
      watchlistVehicleAlert: {
        type: Boolean,
        default: true,
      },
      loiteringThresholdSeconds: {
        type: Number,
        default: 300,
      },
      notifyDepartments: [String],
    },
    // Operational Schedule
    schedule: {
      startTime: String, // e.g. "18:00"
      endTime: String,   // e.g. "01:00"
      startDate: Date,
      endDate: Date,
      daysOfWeek: [Number], // 0 = Sun, 1 = Mon ...
      isAlwaysActive: {
        type: Boolean,
        default: true,
      },
    },
    // Statistics & Caches
    assignedCameraCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

operationalZoneSchema.index({ geometry: '2dsphere' });
operationalZoneSchema.index({ district: 1, active: 1 });
operationalZoneSchema.index({ type: 1, severity: 1 });

module.exports = mongoose.model('OperationalZone', operationalZoneSchema);

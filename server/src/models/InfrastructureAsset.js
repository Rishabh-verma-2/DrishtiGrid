const mongoose = require('mongoose');

const infrastructureAssetSchema = new mongoose.Schema(
  {
    assetId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Asset name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'POLICE_STATION',
        'HOSPITAL',
        'FIRE_STATION',
        'RAILWAY_STATION',
        'AIRPORT',
        'GOVERNMENT_OFFICE',
        'BRIDGE',
        'TUNNEL',
        'SCHOOL',
        'CRITICAL_INFRASTRUCTURE',
      ],
      required: true,
      index: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    latitude: Number,
    longitude: Number,
    address: {
      full: String,
      street: String,
      area: String,
      city: String,
      district: {
        type: String,
        required: true,
        index: true,
      },
      pincode: String,
      state: {
        type: String,
        default: 'Gujarat',
      },
    },
    district: {
      type: String,
      required: true,
      index: true,
    },
    department: {
      type: String,
      default: 'Government of Gujarat',
    },
    emergencyContact: {
      phone: String,
      altPhone: String,
      email: String,
      nodalOfficer: String,
      controlRoomNumber: String,
    },
    operatingStatus: {
      type: String,
      enum: ['ACTIVE', 'MAINTENANCE', 'ALERT', 'STANDBY'],
      default: 'ACTIVE',
    },
    capacityDetails: {
      bedsCount: Number,        // For Hospitals
      personnelStrength: Number,// For Police / Fire
      vehiclesCount: Number,    // For Fire Station / Police PS
      dailyFootfall: Number,    // For Railway / Airport / Market
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
    dataSource: {
      type: String,
      default: 'OFFICIAL_GOVERNMENT_GIS',
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

infrastructureAssetSchema.index({ location: '2dsphere' });
infrastructureAssetSchema.index({ district: 1, type: 1 });
infrastructureAssetSchema.index({ operatingStatus: 1 });

module.exports = mongoose.model('InfrastructureAsset', infrastructureAssetSchema);

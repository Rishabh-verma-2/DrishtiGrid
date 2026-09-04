const mongoose = require('mongoose');

const PlateRecordSchema = new mongoose.Schema(
  {
    recordId: {
      type: String,
      unique: true,
      index: true,
    },
    plate_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    normalized_plate_number: {
      type: String,
      required: true,
      index: true,
      trim: true,
      uppercase: true,
    },
    category: {
      type: String,
      enum: ['STOLEN', 'SUSPECT', 'VIP', 'WANTED', 'BLACKLISTED', 'FLEET', 'RESTRICTED', 'OTHER'],
      default: 'SUSPECT',
      index: true,
    },
    priority: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW'],
      default: 'HIGH',
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    reference_id: {
      type: String, // e.g. FIR number, Case ID, Officer Reference
      default: '',
      trim: true,
    },
    ownerName: {
      type: String,
      default: '',
      trim: true,
    },
    vehicleModel: {
      type: String,
      default: '',
      trim: true,
    },
    vehicleColor: {
      type: String,
      default: '',
      trim: true,
    },
    total_alerts: {
      type: Number,
      default: 0,
    },
    last_detected_at: {
      type: Date,
    },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.created_at = ret.createdAt;
        ret.updated_at = ret.updatedAt;
        ret.alert_count = ret.total_alerts || 0;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Auto-generate recordId (PR-0001, PR-0002, etc.) if not set
PlateRecordSchema.pre('validate', async function (next) {
  if (this.plate_number && !this.normalized_plate_number) {
    this.normalized_plate_number = this.plate_number.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  if (!this.recordId) {
    const count = await mongoose.model('PlateRecord').countDocuments();
    this.recordId = `PR-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('PlateRecord', PlateRecordSchema);

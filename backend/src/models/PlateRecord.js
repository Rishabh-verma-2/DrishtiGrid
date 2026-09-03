const mongoose = require("mongoose");
const { normalizePlateNumber } = require("../utils/plateUtils");

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
    },
    normalized_plate_number: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["STOLEN", "SUSPECT", "VIP", "WANTED", "BLACKLISTED", "FLEET", "OTHER", "Watchlist", "Restricted", "Stolen", "Vehicle"],
      default: "OTHER",
      index: true,
    },
    priority: {
      type: String,
      enum: ["HIGH", "MEDIUM", "LOW"],
      default: "HIGH",
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    reference_id: {
      type: String,
      default: "",
      trim: true,
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
PlateRecordSchema.pre("validate", async function (next) {
  if (this.plate_number && !this.normalized_plate_number) {
    this.normalized_plate_number = normalizePlateNumber(this.plate_number);
  }

  if (!this.recordId) {
    const count = await mongoose.model("PlateRecord").countDocuments();
    const nextNum = count + 1;
    this.recordId = `PR-${String(nextNum).padStart(4, "0")}`;
  }
  next();
});

module.exports = mongoose.model("PlateRecord", PlateRecordSchema);

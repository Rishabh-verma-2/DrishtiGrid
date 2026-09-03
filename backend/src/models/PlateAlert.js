const mongoose = require("mongoose");

const PlateAlertSchema = new mongoose.Schema(
  {
    alertId: {
      type: String,
      unique: true,
      index: true,
    },
    plate_record_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlateRecord",
      index: true,
    },
    plate_record_ref: {
      type: String, // String representation e.g. PR-0001
      index: true,
    },
    category: {
      type: String,
      default: "Watchlist",
    },
    detected_plate_number: {
      type: String,
      required: true,
      index: true,
    },
    raw_ocr: {
      type: String,
      default: "",
    },
    ocr_confidence: {
      type: Number,
      default: 0.0,
    },
    detection_confidence: {
      type: Number,
      default: 0.0,
    },
    overall_confidence: {
      type: Number,
      default: 0.0,
    },
    source_image_name: {
      type: String,
      default: "source_image.jpg",
    },
    original_image: {
      type: String, // Base64 data URI of the full vehicle image
      default: "",
    },
    original_crop: {
      type: String, // Base64 data URI of raw plate crop
      default: "",
    },
    enhanced_crop: {
      type: String, // Base64 data URI of enhanced plate crop
      default: "",
    },
    detected_at: {
      type: Date,
      default: Date.now,
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
      enum: ["NEW", "ACKNOWLEDGED", "RESOLVED"],
      default: "NEW",
      index: true,
    },
    acknowledged_at: {
      type: Date,
    },
    resolved_at: {
      type: Date,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-generate alertId (ALT-0001, ALT-0002, etc.)
PlateAlertSchema.pre("validate", async function (next) {
  if (!this.alertId) {
    const count = await mongoose.model("PlateAlert").countDocuments();
    const nextNum = count + 1;
    this.alertId = `ALT-${String(nextNum).padStart(4, "0")}`;
  }
  next();
});

module.exports = mongoose.model("PlateAlert", PlateAlertSchema);

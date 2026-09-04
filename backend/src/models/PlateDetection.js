/**
 * Mongoose model for individual plate detections extracted during video analysis.
 * Stored in "platedetections" collection, distinct from the watchlist ("platerecords").
 */

const mongoose = require("mongoose");

const PlateDetectionSchema = new mongoose.Schema(
  {
    detectionId: {
      type: String,
      unique: true,
      index: true,
    },
    video_id: {
      type: String,
      required: false,
      default: null,
      index: true,
    },
    source_type: {
      type: String,
      enum: ["VIDEO", "IMAGE"],
      default: "VIDEO",
      index: true,
    },
    source_name: {
      type: String,
      default: "",
    },
    frame_second: {
      type: Number,
      default: 0,
      index: true,
    },
    first_seen_second: {
      type: Number,
      default: 0,
    },
    last_seen_second: {
      type: Number,
      default: 0,
    },
    occurrence_count: {
      type: Number,
      default: 1,
    },
    seen_seconds: {
      type: [Number],
      default: [],
    },
    plate_number: {
      type: String,
      required: true,
      index: true,
    },
    raw_ocr: {
      type: String,
      default: "",
    },
    timestamp: {
      type: String, // ISO wall-clock timestamp
      required: true,
      index: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    location_address: {
      type: String,
      default: null,
    },
    cropped_image_url: {
      type: String,
      default: null,
    },
    cropped_image_public_id: {
      type: String,
      default: null,
    },
    source_video_url: {
      type: String,
      default: "",
    },
    car_color: {
      type: String,
      default: null,
    },
    car_model: {
      type: String,
      default: null,
    },
    detection_confidence: {
      type: Number,
      default: 0.0,
    },
    ocr_confidence: {
      type: Number,
      default: 0.0,
    },
    overall_confidence: {
      type: Number,
      default: 0.0,
    },
    match_status: {
      type: String,
      enum: ["MATCH_FOUND", "POSSIBLE_MATCH", "NO_MATCH", "OCR_UNCERTAIN"],
      default: "NO_MATCH",
      index: true,
    },
    matched_record: {
      type: Object,
      default: null,
    },
    image_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

PlateDetectionSchema.pre("validate", function (next) {
  if (!this.detectionId) {
    this.detectionId = `DET-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model("PlateDetection", PlateDetectionSchema, "platedetections");

const mongoose = require("mongoose");

const StoredPlateSchema = new mongoose.Schema(
  {
    plate_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    raw_ocr: {
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
    video_id: {
      type: String,
      default: null,
      index: true,
    },
    frame_second: {
      type: Number,
      default: 0,
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
    overall_confidence: {
      type: Number,
      default: 0.0,
    },
    detection_confidence: {
      type: Number,
      default: 0.0,
    },
    ocr_confidence: {
      type: Number,
      default: 0.0,
    },
    match_status: {
      type: String,
      enum: ["MATCH_FOUND", "POSSIBLE_MATCH", "NO_MATCH", "OCR_UNCERTAIN"],
      default: "NO_MATCH",
      index: true,
    },
    location_address: {
      type: String,
      default: null,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    cropped_image_url: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "storedplates",
  }
);

module.exports =
  mongoose.models.StoredPlate ||
  mongoose.model("StoredPlate", StoredPlateSchema);

const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    entity_type: {
      type: String,
      enum: ["RECORD", "ALERT", "BATCH", "SYSTEM"],
      required: true,
    },
    entity_id: {
      type: String,
      default: "",
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);

const mongoose = require('mongoose');

const reportDispatchLogSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: ['HEALTH_AUDIT', 'COVERAGE_GAP', 'COMBINED_DEPARTMENT_AUDIT', 'INCIDENT_SUMMARY'],
      required: true,
    },
    targetDepartment: {
      type: String,
      required: true,
    },
    recipientEmails: [
      {
        type: String,
        required: true,
      },
    ],
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    generationTrigger: {
      type: String,
      enum: ['MANUAL_USER', 'SCHEDULED_CRON', 'HEALTH_ALERT_AUTOMATION'],
      default: 'MANUAL_USER',
    },
    format: {
      type: String,
      enum: ['PDF', 'EXCEL', 'CSV'],
      default: 'PDF',
    },
    parameters: {
      district: String,
      timeframe: String,
      minUptimeThreshold: Number,
      gapSeverity: String,
    },
    fileMetadata: {
      fileName: String,
      fileSizeBytes: Number,
      storagePath: String,
      hashSha256: String,
    },
    deliveryStatus: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED', 'SIMULATED'],
      default: 'PENDING',
    },
    smtpMessageId: String,
    errorMessage: String,
  },
  { timestamps: true }
);

reportDispatchLogSchema.index({ targetDepartment: 1, createdAt: -1 });
reportDispatchLogSchema.index({ deliveryStatus: 1 });

module.exports = mongoose.model('ReportDispatchLog', reportDispatchLogSchema);

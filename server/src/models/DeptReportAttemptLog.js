const mongoose = require('mongoose');

/**
 * DeptReportAttemptLog — audit record for BLOCKED report attempts
 * where the target department had no registered user.
 * These are never live tickets but are kept for coverage-gap analytics.
 */
const deptReportAttemptLogSchema = new mongoose.Schema(
  {
    attemptId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cameraId: {
      type: String,
      required: true,
      index: true,
    },
    attemptedDepartment: {
      type: String,
      required: true,
    },
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    result: {
      type: String,
      enum: ['department_unresolved'],
      default: 'department_unresolved',
    },
    message: {
      type: String,
      default: 'No registered user found for this department.',
    },
  },
  { timestamps: true }
);

deptReportAttemptLogSchema.index({ attemptedDepartment: 1, createdAt: -1 });

module.exports = mongoose.model('DeptReportAttemptLog', deptReportAttemptLogSchema);

const mongoose = require('mongoose');

const investigationAssignmentSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    case: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FirCase',
      required: true,
      index: true,
    },
    caseId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    watchlistEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WatchlistEntry',
      index: true,
    },
    watchlistId: {
      type: String,
      default: '',
    },
    departmentCode: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    departmentName: {
      type: String,
      required: true,
      trim: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedByName: {
      type: String,
      default: 'Admin Authority',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'HIGH',
    },
    instructions: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['ASSIGNED', 'SEARCHING', 'MATCH_FOUND', 'RESULT_SUBMITTED', 'COMPLETED', 'CLOSED'],
      default: 'ASSIGNED',
      index: true,
    },
    searchesCount: {
      type: Number,
      default: 0,
    },
    matchesCount: {
      type: Number,
      default: 0,
    },
    lastSearchedAt: {
      type: Date,
    },
    assignedOfficer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedOfficerName: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

investigationAssignmentSchema.index({ departmentCode: 1, status: 1 });
investigationAssignmentSchema.index({ caseId: 1, departmentCode: 1 });

module.exports = mongoose.model('InvestigationAssignment', investigationAssignmentSchema);

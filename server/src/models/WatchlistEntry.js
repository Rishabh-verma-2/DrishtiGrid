const mongoose = require('mongoose');

const watchlistEntrySchema = new mongoose.Schema(
  {
    watchlistId: {
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
    firNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    subjectType: {
      type: String,
      enum: ['STOLEN_VEHICLE', 'MISSING_PERSON', 'WANTED_PERSON', 'SUSPECTED_PERSON', 'OTHER'],
      required: true,
      index: true,
    },
    subjectIdentifier: {
      type: String, // Vehicle registration number OR Person Full Name
      required: true,
      trim: true,
      index: true,
    },
    normalizedIdentifier: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'HIGH',
      index: true,
    },
    originatingStation: {
      type: String,
      required: true,
      index: true,
    },
    originatingRegion: {
      type: String,
      default: 'Gujarat',
    },
    originatingDistrict: {
      type: String,
      default: '',
    },

    // Reference images for AI detection engines
    referenceImages: [
      {
        url: { type: String, required: true },
        category: { type: String, default: 'REFERENCE' },
        sha256Hash: { type: String, default: '' },
      },
    ],
    referenceDocuments: [
      {
        url: { type: String, required: true },
        title: { type: String, default: 'Document' },
      },
    ],

    // Target departments assigned by Admin
    assignedDepartments: [
      {
        departmentCode: { type: String, required: true },
        departmentName: { type: String, required: true },
        assignedAt: { type: Date, default: Date.now },
        assignmentId: { type: String },
        status: { type: String, enum: ['ASSIGNED', 'SEARCHING', 'MATCH_FOUND', 'COMPLETED'], default: 'ASSIGNED' },
      },
    ],

    detectionCount: {
      type: Number,
      default: 0,
    },
    lastDetectionAt: {
      type: Date,
    },
    lastDetectionCamera: {
      type: String,
      default: '',
    },
    lastDetectionLocation: {
      type: String,
      default: '',
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'UNDER_INVESTIGATION', 'MATCH_FOUND', 'NO_MATCH', 'RESOLVED', 'CLOSED', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdByName: {
      type: String,
      default: 'Admin',
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

watchlistEntrySchema.index({ status: 1, priority: 1 });
watchlistEntrySchema.index({ normalizedIdentifier: 1, isArchived: 1 });

watchlistEntrySchema.pre('save', function () {
  if (this.subjectIdentifier) {
    this.normalizedIdentifier = this.subjectIdentifier.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
});

module.exports = mongoose.model('WatchlistEntry', watchlistEntrySchema);

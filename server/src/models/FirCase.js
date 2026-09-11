const mongoose = require('mongoose');
const { INVESTIGATION_STATES } = require('../utils/investigationStateMachine');

const firCaseSchema = new mongoose.Schema(
  {
    caseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    requestType: {
      type: String,
      enum: ['STOLEN_VEHICLE', 'MISSING_PERSON', 'WANTED_PERSON', 'SUSPECTED_PERSON', 'OTHER'],
      required: [true, 'Investigation request type is required'],
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(INVESTIGATION_STATES),
      default: INVESTIGATION_STATES.SUBMITTED,
      index: true,
    },

    // ─── FIR & Police Station Information ──────────────────────────────
    firNumber: {
      type: String,
      required: [true, 'FIR Number is mandatory'],
      trim: true,
      index: true,
    },
    firDate: {
      type: Date,
      required: [true, 'FIR registration date is mandatory'],
    },
    policeStation: {
      type: String,
      required: [true, 'Originating Police Station is mandatory'],
      trim: true,
      index: true,
    },
    district: {
      type: String,
      required: [true, 'District is mandatory'],
      trim: true,
      index: true,
    },
    region: {
      type: String,
      default: 'Gujarat',
      trim: true,
      index: true,
    },
    officerName: {
      type: String,
      required: [true, 'Investigating Officer Name is mandatory'],
      trim: true,
    },
    officerId: {
      type: String,
      trim: true,
      default: '',
    },
    contactNumber: {
      type: String,
      required: [true, 'Contact Phone is mandatory'],
      trim: true,
    },
    caseDescription: {
      type: String,
      required: [true, 'Case description is mandatory'],
      trim: true,
    },
    investigationRemarks: {
      type: String,
      trim: true,
      default: '',
    },

    // ─── Stolen Vehicle Specific Fields ────────────────────────────────
    vehicleDetails: {
      registrationNumber: { type: String, uppercase: true, trim: true, default: '' },
      normalizedRegistration: { type: String, uppercase: true, trim: true, default: '' },
      vehicleType: { type: String, trim: true, default: '' }, // e.g. Car, Motorcycle, Truck, SUV, Auto
      make: { type: String, trim: true, default: '' }, // Hyundai, Maruti, Tata
      model: { type: String, trim: true, default: '' }, // Creta, Swift, Nexon
      color: { type: String, trim: true, default: '' }, // White, Black, Silver
      variant: { type: String, trim: true, default: '' },
      manufacturingYear: { type: Number },
      chassisNumber: { type: String, uppercase: true, trim: true, default: '' },
      engineNumber: { type: String, uppercase: true, trim: true, default: '' },
      ownerName: { type: String, trim: true, default: '' },
      additionalIdentifiers: { type: String, trim: true, default: '' },
    },

    // ─── Missing / Wanted / Suspected Person Specific Fields ───────────
    personDetails: {
      fullName: { type: String, trim: true, default: '' },
      age: { type: Number },
      gender: { type: String, enum: ['Male', 'Female', 'Other', 'Unknown', ''], default: '' },
      height: { type: String, trim: true, default: '' }, // e.g. "5 ft 10 in"
      weight: { type: String, trim: true, default: '' }, // e.g. "72 kg"
      skinTone: { type: String, trim: true, default: '' },
      hairDescription: { type: String, trim: true, default: '' },
      clothingDescription: { type: String, trim: true, default: '' },
      lastKnownLocation: { type: String, trim: true, default: '' },
      lastSeenDate: { type: Date },
      identificationMarks: { type: String, trim: true, default: '' },
      knownAliases: { type: String, trim: true, default: '' },
      contactFamilyInfo: { type: String, trim: true, default: '' },
      investigationNotes: { type: String, trim: true, default: '' },
    },

    // ─── Attachments (Images, RC, FIR Copy, Supporting Docs) ───────────
    attachments: [
      {
        fileId: { type: String, required: true },
        originalName: { type: String, required: true },
        fileType: { type: String, default: 'image/jpeg' },
        fileCategory: {
          type: String,
          enum: [
            'VEHICLE_PHOTO',
            'NUMBER_PLATE_PHOTO',
            'RC_DOCUMENT',
            'FIR_COPY',
            'PERSON_FRONT_FACE',
            'PERSON_SIDE_FACE',
            'PERSON_FULL_BODY',
            'SUPPORTING_DOC',
          ],
          default: 'SUPPORTING_DOC',
        },
        fileUrl: { type: String, required: true },
        fileSizeBytes: { type: Number, default: 0 },
        sha256Hash: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // ─── GIS Geolocation Information ──────────────────────────────────
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [72.5714, 23.0225], // Default to Ahmedabad center
      },
    },
    locationAddress: {
      type: String,
      default: '',
      trim: true,
    },

    // ─── Originating Submitter & Ownership ─────────────────────────────
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    submittedByName: {
      type: String,
      required: true,
      trim: true,
    },
    submittedByStation: {
      type: String,
      required: true,
      trim: true,
    },
    submittedByDepartment: {
      type: String,
      default: 'Gujarat Police Department',
    },

    // ─── SLA & Escalation ─────────────────────────────────────────────
    slaHours: {
      type: Number,
      default: 24,
    },
    dueAt: {
      type: Date,
      index: true,
    },
    slaBreached: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ─── Admin Review Metadata ────────────────────────────────────────
    adminReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedByName: { type: String, default: '' },
      reviewedAt: { type: Date },
      decision: { type: String, enum: ['APPROVED', 'REJECTED', 'CORRECTION_REQUIRED', 'PENDING'], default: 'PENDING' },
      rejectionReason: { type: String, default: '' },
      correctionComment: { type: String, default: '' },
    },

    // ─── Master Watchlist Binding ─────────────────────────────────────
    isWatchlistActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    watchlistEntryId: {
      type: String,
      default: '',
      index: true,
    },

    // ─── Duplicate Reference Warning Flag ─────────────────────────────
    duplicateFlag: {
      hasDuplicate: { type: Boolean, default: false },
      duplicateCaseId: { type: String, default: '' },
      duplicateReason: { type: String, default: '' },
    },

    // ─── Forwarding to Origin Status ──────────────────────────────────
    resultForwardedToOrigin: {
      type: Boolean,
      default: false,
    },
    forwardedAt: {
      type: Date,
    },
    originAcknowledgedAt: {
      type: Date,
    },
    originAcknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    originRemarks: {
      type: String,
      default: '',
    },
    resolutionDate: {
      type: Date,
    },

    // ─── Immutable Chronological Timeline ─────────────────────────────
    timeline: [
      {
        action: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        actorName: { type: String, default: 'System' },
        actorRole: { type: String, default: '' },
        actorDepartment: { type: String, default: '' },
        previousStatus: { type: String, default: '' },
        newStatus: { type: String, default: '' },
        remarks: { type: String, default: '' },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for high performance querying across thousands of records
firCaseSchema.index({ location: '2dsphere' });
firCaseSchema.index({ policeStation: 1, status: 1 });
firCaseSchema.index({ district: 1, status: 1 });
firCaseSchema.index({ requestType: 1, status: 1 });
firCaseSchema.index({ 'vehicleDetails.normalizedRegistration': 1 });
firCaseSchema.index({ 'personDetails.fullName': 'text', firNumber: 'text', caseDescription: 'text' });
firCaseSchema.index({ createdAt: -1 });

// Helper to normalize registration number before save
firCaseSchema.pre('save', function () {
  if (this.vehicleDetails && this.vehicleDetails.registrationNumber) {
    this.vehicleDetails.normalizedRegistration = this.vehicleDetails.registrationNumber
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }
});

module.exports = mongoose.model('FirCase', firCaseSchema);

const mongoose = require('mongoose');

const gridCellSchema = new mongoose.Schema(
  {
    cellId: { type: String, required: true },
    center: { type: [Number], required: true }, // [lat, lng]
    bounds: { type: [[Number]], default: [] }, // [[minLat, minLng], [maxLat, maxLng]]
    cameraCount: { type: Number, default: 0 },
    activeCameraCount: { type: Number, default: 0 },
    inactiveCameraCount: { type: Number, default: 0 },
    nearestCameraDistanceMeters: { type: Number, default: 0 },
    density: { type: Number, default: 0 },
    classification: {
      type: String,
      enum: ['Good Coverage', 'Moderate Coverage', 'Low Coverage', 'Critical Gap'],
      default: 'Moderate Coverage',
    },
  },
  { _id: false }
);

const gapItemSchema = new mongoose.Schema(
  {
    gapId: { type: String, required: true },
    coordinates: { type: [Number], required: true }, // [lat, lng]
    zoneName: { type: String, default: '' },
    severity: {
      type: String,
      enum: ['Critical', 'High', 'Medium', 'Low'],
      default: 'Medium',
    },
    nearbyCamerasCount: { type: Number, default: 0 },
    nearestCameraDistanceMeters: { type: Number, default: 0 },
    recommendation: { type: String, default: '' },
    coverageClassification: { type: String, default: '' },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: String, default: 'System' },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const departmentResponseSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, default: '' },
    senderRole: { type: String, default: '' },
    senderDepartment: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const gapAnalysisReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    location: {
      name: { type: String, required: true },
      address: { type: String, default: '' },
      district: { type: String, default: 'Ahmedabad' },
      city: { type: String, default: '' },
      coordinates: {
        type: [Number], // [lng, lat] GeoJSON convention
        required: true,
      },
    },
    radiusMeters: {
      type: Number,
      required: true,
      min: [50, 'Radius must be at least 50 meters'],
      max: [50000, 'Radius cannot exceed 50 kilometers'],
    },
    filters: {
      cameraType: { type: String, default: 'all' },
      cameraStatus: { type: String, default: 'all' },
      departmentCode: { type: String, default: 'all' },
    },
    summary: {
      totalCameras: { type: Number, default: 0 },
      activeCameras: { type: Number, default: 0 },
      inactiveCameras: { type: Number, default: 0 },
      coveredZones: { type: Number, default: 0 },
      lowCoverageZones: { type: Number, default: 0 },
      criticalGaps: { type: Number, default: 0 },
      coverageScore: { type: Number, default: 0 },
      totalAreaSqKm: { type: Number, default: 0 },
      densityCamerasPerSqKm: { type: Number, default: 0 },
    },
    scoreFactors: [{ type: String }],
    clusteringAnalysis: {
      quadrants: { type: mongoose.Schema.Types.Mixed, default: {} },
      description: { type: String, default: '' },
    },
    gridCells: [gridCellSchema],
    gaps: [gapItemSchema],
    responsibleDepartment: {
      code: { type: String, required: true, index: true },
      name: { type: String, required: true },
      contactEmail: { type: String, default: '' },
      nodalOfficer: {
        name: { type: String, default: '' },
        designation: { type: String, default: '' },
        phone: { type: String, default: '' },
      },
      departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    },
    candidateDepartments: [
      {
        code: { type: String },
        name: { type: String },
        contactEmail: { type: String },
        reason: { type: String },
      },
    ],
    status: {
      type: String,
      enum: ['DRAFT', 'GENERATED', 'SENT', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'],
      default: 'GENERATED',
      index: true,
    },
    adminMessage: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name: { type: String, required: true },
      role: { type: String, required: true },
      email: { type: String, default: '' },
    },
    sentAt: { type: Date },
    sentBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
    acknowledgedAt: { type: Date },
    acknowledgedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      department: { type: String },
    },
    resolvedAt: { type: Date },
    resolvedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
    statusHistory: [statusHistorySchema],
    departmentResponses: [departmentResponseSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
gapAnalysisReportSchema.index({ 'responsibleDepartment.code': 1, status: 1, createdAt: -1 });
gapAnalysisReportSchema.index({ status: 1, createdAt: -1 });
gapAnalysisReportSchema.index({ 'createdBy.userId': 1, createdAt: -1 });

module.exports = mongoose.model('GapAnalysisReport', gapAnalysisReportSchema);

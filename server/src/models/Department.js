const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Law Enforcement', 'Traffic Management', 'Municipal Corporation', 'Emergency Services', 'Transport', 'Other'],
      default: 'Law Enforcement',
    },
    contactEmail: {
      type: String,
      required: true,
      trim: true,
    },
    secondaryEmail: {
      type: String,
      trim: true,
    },
    nodalOfficer: {
      name: { type: String, default: 'Department Nodal Officer' },
      designation: { type: String, default: 'Superintendent / Nodal Coordinator' },
      phone: { type: String, default: '+91 79 2325 0000' },
    },
    jurisdictionDistricts: [{ type: String }],
    reportSchedule: {
      enabled: { type: Boolean, default: true },
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
      timeOfDay: { type: String, default: '08:00' },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Department', departmentSchema);

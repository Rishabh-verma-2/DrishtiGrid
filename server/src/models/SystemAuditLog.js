const mongoose = require('mongoose');

const systemAuditLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    userName: {
      type: String,
      default: 'System',
    },
    userEmail: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE', 'SYSTEM'],
      default: 'SYSTEM',
    },
    department: {
      type: String,
      default: 'Government of Gujarat',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resource: {
      type: String,
      default: 'System',
    },
    resourceId: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      default: '127.0.0.1',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

systemAuditLogSchema.index({ action: 1, timestamp: -1 });
systemAuditLogSchema.index({ user: 1, timestamp: -1 });

// Helper function to easily log any action anywhere in the server
systemAuditLogSchema.statics.record = async function ({
  req,
  user,
  action,
  resource = 'System',
  resourceId = '',
  description,
}) {
  try {
    const actor = user || req?.user;
    const ipAddress =
      req?.headers?.['x-forwarded-for'] ||
      req?.socket?.remoteAddress ||
      '127.0.0.1';
    const userAgent = req?.headers?.['user-agent'] || '';

    return await this.create({
      user: actor?._id,
      userName: actor?.name || 'System / Automated Process',
      userEmail: actor?.email || '',
      role: actor?.role || 'SYSTEM',
      department: actor?.department || 'Government of Gujarat',
      action,
      resource,
      resourceId: String(resourceId || ''),
      description,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });
  } catch (err) {
    // Non-blocking fallback
    console.error('Failed to write SystemAuditLog:', err.message);
  }
};

module.exports = mongoose.model('SystemAuditLog', systemAuditLogSchema);

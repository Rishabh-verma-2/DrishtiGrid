const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'],
      default: 'POLICE',
      set: (val) => {
        if (!val) return 'POLICE';
        const upper = String(val).toUpperCase();
        if (['SUPERADMIN', 'ADMIN'].includes(upper)) return 'ADMIN';
        if (['OPERATOR', 'VIEWER', 'POLICE'].includes(upper)) return 'POLICE';
        if (['TRAFFIC', 'TRAFFIC_POLICE', 'TRAFFICPOLICE'].includes(upper)) return 'TRAFFIC_POLICE';
        return upper;
      },
    },
    department: {
      type: String,
      trim: true,
    },
    designation: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
    },
    district: {
      type: String,
      trim: true,
    },
    permissions: {
      type: [String],
      default: undefined,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    passwordChangedAt: {
      type: Date,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes (email is already indexed via unique:true — no duplicate needed)
userSchema.index({ role: 1 });
userSchema.index({ district: 1 });

// Virtual: is account locked
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save: hash password
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (this.isNew) return; // only set on update
  this.passwordChangedAt = new Date(Date.now() - 1000);
});

// Method: compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method: check if password changed after JWT was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Method: increment login attempts
userSchema.methods.incLoginAttempts = async function () {
  const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours
  const MAX_ATTEMPTS = 5;

  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= MAX_ATTEMPTS && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + LOCK_TIME };
  }
  return this.updateOne(updates);
};

const ALL_PERMISSIONS = [
  'camera_add',
  'bulk_import',
  'anpr',
  'crowd',
  'camera_monitoring',
  'gis_map',
  'footage_requests',
  'reports',
  'system_health',
  'audit_logs',
  'camera_management',
];

const ROLE_DEFAULT_PERMISSIONS = {
  ADMIN: ALL_PERMISSIONS,
  POLICE: ['gis_map', 'camera_monitoring', 'footage_requests', 'reports'],
  TRAFFIC_POLICE: ['gis_map', 'camera_monitoring', 'anpr', 'footage_requests', 'reports'],
};

// Method: get effective permissions (explicit array or role defaults)
userSchema.methods.getEffectivePermissions = function () {
  const role = String(this.role || 'POLICE').toUpperCase();
  if (role === 'ADMIN' || role === 'SUPERADMIN') {
    return ALL_PERMISSIONS;
  }
  if (Array.isArray(this.permissions) && this.permissions.length > 0) {
    return this.permissions;
  }
  return ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.POLICE;
};

const User = mongoose.model('User', userSchema);
User.ALL_PERMISSIONS = ALL_PERMISSIONS;
User.ROLE_DEFAULT_PERMISSIONS = ROLE_DEFAULT_PERMISSIONS;

module.exports = User;


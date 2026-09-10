const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Authenticate - verify JWT and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token missing or malformed',
      });
    }
    const decoded = verifyAccessToken(token);
    const userId = decoded.id || decoded.userId || decoded._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    const user = await User.findById(userId).select('-password -refreshToken');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    if (user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        message: 'Password was recently changed. Please log in again.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

/**
 * Authorize - restrict to specific roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const userRole = String(req.user.role || '').toUpperCase();
    const allowed = roles.map((r) => String(r).toUpperCase());

    // Normalize legacy role names
    const normalizedUserRole =
      ['SUPERADMIN', 'ADMIN'].includes(userRole) ? 'ADMIN' :
      ['OPERATOR', 'VIEWER', 'POLICE'].includes(userRole) ? 'POLICE' :
      ['TRAFFIC', 'TRAFFIC_POLICE'].includes(userRole) ? 'TRAFFIC_POLICE' : userRole;

    if (!allowed.includes(normalizedUserRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user.role}' is not authorized to access this resource`,
      });
    }
    next();
  };
};

/**
 * Socket.IO authentication middleware
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select('-password -refreshToken');

    if (!user || !user.isActive) {
      return next(new Error('Authentication error: Invalid user'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error(`Authentication error: ${error.message}`));
  }
};

/**
 * Require Permission - check if user has feature authority
 * ADMIN/SUPERADMIN always has full access
 */
const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const role = String(req.user.role || '').toUpperCase();
    if (['SUPERADMIN', 'ADMIN'].includes(role)) {
      return next();
    }

    const effective = typeof req.user.getEffectivePermissions === 'function'
      ? req.user.getEffectivePermissions()
      : (Array.isArray(req.user.permissions) && req.user.permissions.length > 0
          ? req.user.permissions
          : (User.ROLE_DEFAULT_PERMISSIONS?.[role] || []));

    const hasAccess = permissions.some((p) => effective.includes(p));
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: You do not have permission for feature '${permissions.join(', ')}'. Contact Administrator.`,
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize, requirePermission, authenticateSocket };

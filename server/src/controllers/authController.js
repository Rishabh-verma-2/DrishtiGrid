const User = require('../models/User');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');
const logger = require('../utils/logger');

/**
 * @desc    Register a new user (superadmin only in production)
 * @route   POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role, department, designation, phone, district } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'viewer',
      department,
      designation,
      phone,
      district,
    });

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    user.password = undefined;
    user.refreshToken = undefined;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user, accessToken, refreshToken },
    });
  } catch (error) {
    logger.error(`Register error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Login
 * @route   POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password +refreshToken');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts',
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    // Reset login attempts on success
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    user.password = undefined;
    user.refreshToken = undefined;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user, accessToken, refreshToken },
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(user._id, user.role);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    logger.error(`Refresh token error: ${error.message}`);
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

/**
 * @desc    Logout
 * @route   POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.refreshToken = undefined;
      await user.save({ validateBeforeSave: false });
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 */
const getMe = async (req, res) => {
  res.status(200).json({ success: true, data: req.user });
};

module.exports = { register, login, refreshToken, logout, getMe };

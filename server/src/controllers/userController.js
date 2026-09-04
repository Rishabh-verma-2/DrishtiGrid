const bcrypt = require('bcryptjs');
const User = require('../models/User');
const SystemAuditLog = require('../models/SystemAuditLog');
const logger = require('../utils/logger');

/**
 * @desc    Get all users with search & filters (Admin Only)
 * @route   GET /api/users
 */
const getUsers = async (req, res) => {
  try {
    const { search, role, department, status, page = 1, limit = 50 } = req.query;

    const filter = {};

    if (role && role !== 'all') {
      filter.role = role.toUpperCase();
    }

    if (department && department !== 'all') {
      filter.department = department;
    }

    if (status && status !== 'all') {
      filter.isActive = status === 'active';
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { department: { $regex: q, $options: 'i' } },
        { designation: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -refreshToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: users,
    });
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create a new user (Admin Only)
 * @route   POST /api/users
 */
const createUser = async (req, res) => {
  try {
    const { name, email, password, role, department, designation, phone, district } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `User with email '${normalizedEmail}' already exists`,
      });
    }

    // Validate role strictly to the 3 permitted roles
    const validRoles = ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'];
    const assignedRole = String(role || 'POLICE').toUpperCase();
    if (!validRoles.includes(assignedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles are: ${validRoles.join(', ')}`,
      });
    }

    // Create user (pre-save hook will hash password)
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: assignedRole,
      department: department || (assignedRole === 'TRAFFIC_POLICE' ? 'Gujarat Traffic Police' : assignedRole === 'POLICE' ? 'Gujarat Police Department' : 'Gujarat Home Department'),
      designation: designation || 'Surveillance Officer',
      phone: phone || '',
      district: district || 'Gujarat',
      isActive: true,
    });

    // Record system audit log
    await SystemAuditLog.record({
      req,
      action: 'USER_CREATED',
      resource: 'User',
      resourceId: user._id,
      description: `User '${user.name}' (${user.email}) created with role '${user.role}' in department '${user.department}'.`,
    });

    logger.info(`Admin created user ${user.email} (${user.role})`);

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userObj,
    });
  } catch (error) {
    logger.error(`Error creating user: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update user details / role (Admin Only)
 * @route   PUT /api/users/:id
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department, designation, phone, district, role, password } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const prevRole = user.role;

    if (name) user.name = name.trim();
    if (department) user.department = department.trim();
    if (designation) user.designation = designation.trim();
    if (phone) user.phone = phone.trim();
    if (district) user.district = district.trim();

    if (role) {
      const validRoles = ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'];
      const newRole = String(role).toUpperCase();
      if (validRoles.includes(newRole)) {
        user.role = newRole;
      }
    }

    if (password && password.trim().length >= 8) {
      user.password = password; // pre-save will hash
    }

    await user.save();

    // Audit log
    if (prevRole !== user.role) {
      await SystemAuditLog.record({
        req,
        action: 'ROLE_CHANGED',
        resource: 'User',
        resourceId: user._id,
        description: `Role for '${user.name}' changed from '${prevRole}' to '${user.role}' by Admin.`,
      });
    } else {
      await SystemAuditLog.record({
        req,
        action: 'USER_UPDATED',
        resource: 'User',
        resourceId: user._id,
        description: `User details updated for '${user.name}' (${user.email}).`,
      });
    }

    const updatedUser = await User.findById(id).select('-password -refreshToken');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    logger.error(`Error updating user: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Toggle activate / deactivate user status (Admin Only)
 * @route   PATCH /api/users/:id/status
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent deactivating own account
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account',
      });
    }

    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });

    await SystemAuditLog.record({
      req,
      action: user.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      resource: 'User',
      resourceId: user._id,
      description: `Account for '${user.name}' (${user.email}) was ${user.isActive ? 'activated' : 'deactivated'} by Admin.`,
    });

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { _id: user._id, isActive: user.isActive },
    });
  } catch (error) {
    logger.error(`Error toggling user status: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  toggleUserStatus,
};

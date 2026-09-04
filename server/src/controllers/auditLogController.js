const SystemAuditLog = require('../models/SystemAuditLog');
const logger = require('../utils/logger');

/**
 * @desc    Get all system audit logs (Admin Only)
 * @route   GET /api/audit-logs
 */
const getAuditLogs = async (req, res) => {
  try {
    const { action, role, search, page = 1, limit = 50 } = req.query;

    const filter = {};

    if (action && action !== 'all') {
      filter.action = action;
    }

    if (role && role !== 'all') {
      filter.role = role.toUpperCase();
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { userName: { $regex: q, $options: 'i' } },
        { userEmail: { $regex: q, $options: 'i' } },
        { department: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { resource: { $regex: q, $options: 'i' } },
        { resourceId: { $regex: q, $options: 'i' } },
        { action: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      SystemAuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SystemAuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: logs.length,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: logs,
    });
  } catch (error) {
    logger.error(`Error fetching audit logs: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAuditLogs,
};

const Alert = require('../models/Alert');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * @desc    Get alerts with filters
 * @route   GET /api/alerts
 */
const getAlerts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      severity,
      type,
      district,
      camera,
      from,
      to,
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (type) filter.type = type;
    if (district) filter.district = district;
    if (camera) filter.camera = camera;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const total = await Alert.countDocuments(filter);
    const alerts = await Alert.find(filter)
      .populate('camera', 'name cameraId address location')
      .populate('acknowledgedBy', 'name')
      .populate('resolvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: alerts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create alert
 * @route   POST /api/alerts
 */
const createAlert = async (req, res) => {
  try {
    const alert = await Alert.create({
      alertId: `ALT-${uuidv4().split('-')[0].toUpperCase()}`,
      ...req.body,
    });

    const populated = await alert.populate('camera', 'name cameraId address location');

    // Emit real-time alert
    req.io?.emit('alert:new', populated);

    // Emit to district room
    if (alert.district) {
      req.io?.to(`district:${alert.district}`).emit('alert:new', populated);
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    logger.error(`Create alert error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Acknowledge alert
 * @route   PATCH /api/alerts/:id/acknowledge
 */
const acknowledgeAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        status: 'acknowledged',
        acknowledgedBy: req.user._id,
        acknowledgedAt: new Date(),
      },
      { new: true }
    ).populate('camera', 'name cameraId');

    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    req.io?.emit('alert:updated', alert);
    res.status(200).json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Resolve alert
 * @route   PATCH /api/alerts/:id/resolve
 */
const resolveAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        status: 'resolved',
        resolvedBy: req.user._id,
        resolvedAt: new Date(),
        resolutionNote: req.body.note,
      },
      { new: true }
    ).populate('camera', 'name cameraId');

    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    req.io?.emit('alert:updated', alert);
    res.status(200).json({ success: true, data: alert });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get alert statistics
 * @route   GET /api/alerts/stats
 */
const getAlertStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, active, critical, todayCount, bySeverity, byType, byDistrict] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ status: 'active' }),
      Alert.countDocuments({ status: 'active', severity: 'critical' }),
      Alert.countDocuments({ createdAt: { $gte: today } }),
      Alert.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 } } }]),
      Alert.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      Alert.aggregate([{ $group: { _id: '$district', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);

    res.status(200).json({
      success: true,
      data: { total, active, critical, todayCount, bySeverity, byType, byDistrict },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAlerts, createAlert, acknowledgeAlert, resolveAlert, getAlertStats };

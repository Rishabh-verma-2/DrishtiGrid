const Camera = require('../models/Camera');
const Alert = require('../models/Alert');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * @desc    Get all cameras (with filters & pagination)
 * @route   GET /api/cameras
 */
const getCameras = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      district,
      zone,
      type,
      search,
      lat,
      lng,
      radius, // in meters
    } = req.query;

    const filter = { isActive: true };
    if (status) filter.status = status;
    if (district) filter.district = district;
    if (zone) filter.zone = zone;
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { cameraId: { $regex: search, $options: 'i' } },
        { 'address.area': { $regex: search, $options: 'i' } },
      ];
    }

    // GIS near query
    if (lat && lng && radius) {
      filter.location = {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(radius),
        },
      };
    }

    const total = await Camera.countDocuments(filter);
    const cameras = await Camera.find(filter)
      .populate('assignedTo', 'name email')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: cameras,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Get cameras error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get single camera
 * @route   GET /api/cameras/:id
 */
const getCamera = async (req, res) => {
  try {
    const camera = await Camera.findById(req.params.id).populate('assignedTo', 'name email role');
    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }
    res.status(200).json({ success: true, data: camera });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create camera
 * @route   POST /api/cameras
 */
const createCamera = async (req, res) => {
  try {
    const camera = await Camera.create({
      cameraId: req.body.cameraId || `CAM-${uuidv4().split('-')[0].toUpperCase()}`,
      ...req.body,
    });

    // Emit via socket
    req.io?.emit('camera:new', camera);

    res.status(201).json({ success: true, data: camera });
  } catch (error) {
    logger.error(`Create camera error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update camera
 * @route   PUT /api/cameras/:id
 */
const updateCamera = async (req, res) => {
  try {
    const camera = await Camera.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }
    req.io?.emit('camera:updated', camera);
    res.status(200).json({ success: true, data: camera });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Delete camera (soft delete)
 * @route   DELETE /api/cameras/:id
 */
const deleteCamera = async (req, res) => {
  try {
    const camera = await Camera.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }
    req.io?.emit('camera:deleted', { id: req.params.id });
    res.status(200).json({ success: true, message: 'Camera deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update camera heartbeat / status
 * @route   PATCH /api/cameras/:id/heartbeat
 */
const updateHeartbeat = async (req, res) => {
  try {
    const { status } = req.body;
    const camera = await Camera.findByIdAndUpdate(
      req.params.id,
      { status: status || 'online', lastHeartbeat: new Date() },
      { new: true }
    );
    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }
    req.io?.emit('camera:status', { cameraId: camera.cameraId, status: camera.status });
    res.status(200).json({ success: true, data: camera });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get camera statistics
 * @route   GET /api/cameras/stats
 */
const getCameraStats = async (req, res) => {
  try {
    const [total, online, offline, maintenance, fault, byDistrict, byZone] = await Promise.all([
      Camera.countDocuments({ isActive: true }),
      Camera.countDocuments({ isActive: true, status: 'online' }),
      Camera.countDocuments({ isActive: true, status: 'offline' }),
      Camera.countDocuments({ isActive: true, status: 'maintenance' }),
      Camera.countDocuments({ isActive: true, status: 'fault' }),
      Camera.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$district', count: { $sum: 1 }, online: { $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
      ]),
      Camera.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$zone', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        online,
        offline,
        maintenance,
        fault,
        uptime: total > 0 ? ((online / total) * 100).toFixed(1) : 0,
        byDistrict,
        byZone,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  updateHeartbeat,
  getCameraStats,
};

const Camera = require('../models/Camera');
const Alert = require('../models/Alert');
const { randomUUID: uuidv4 } = require('crypto');
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
      department,
      lat,
      lng,
      radius, // in meters
    } = req.query;

    const filter = { isActive: true };
    if (status) filter.status = status;
    if (district) filter.district = district;
    if (zone) filter.zone = zone;
    if (type) filter.type = type;
    if (department && department !== 'all') {
      const d = department.toUpperCase();
      if (['POLICE', 'TRAFFIC', 'HOME_DEPT', 'SMART_CITY', 'MUNICIPAL'].includes(d)) {
        filter.departmentCode = d;
      } else {
        filter.$or = [
          { departmentCode: d },
          { departmentName: { $regex: department, $options: 'i' } },
        ];
      }
    }
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

const SystemAuditLog = require('../models/SystemAuditLog');

/**
 * Sanitizes and normalizes incoming camera payload to ensure MongoDB schema compliance
 */
const sanitizeCameraPayload = (body, existing = null) => {
  const data = { ...body };

  // 1. Coordinates & GeoJSON Point
  const rawLat = data.latitude !== undefined && data.latitude !== null && data.latitude !== '' 
    ? parseFloat(data.latitude) 
    : (existing ? (existing.latitude ?? existing.location?.coordinates?.[1]) : 23.0225);
  const rawLng = data.longitude !== undefined && data.longitude !== null && data.longitude !== '' 
    ? parseFloat(data.longitude) 
    : (existing ? (existing.longitude ?? existing.location?.coordinates?.[0]) : 72.5714);

  const lat = isNaN(rawLat) ? 23.0225 : rawLat;
  const lng = isNaN(rawLng) ? 72.5714 : rawLng;

  data.latitude = lat;
  data.longitude = lng;
  data.location = {
    type: 'Point',
    coordinates: [lng, lat],
  };

  // 2. Name & CameraName sync
  const name = data.name || data.cameraName || (existing ? (existing.name || existing.cameraName) : 'Surveillance Camera');
  data.name = name;
  data.cameraName = name;

  // 3. District & Address sync
  const district = data.district || (typeof data.address === 'object' ? data.address?.district : null) || (existing ? existing.district : 'Ahmedabad');
  data.district = district;

  const prevAddr = existing?.address || {};
  const inAddr = typeof data.address === 'object' && data.address !== null ? data.address : {};
  data.address = {
    full: typeof data.address === 'string' && data.address.trim() 
      ? data.address.trim() 
      : (inAddr.full || prevAddr.full || `${data.locationName || inAddr.area || prevAddr.area || 'City Area'}, ${district}, Gujarat`),
    street: data.roadName || inAddr.street || prevAddr.street || '',
    area: data.locationName || inAddr.area || prevAddr.area || '',
    city: data.city || inAddr.city || prevAddr.city || district,
    district: district,
    taluka: data.taluka || inAddr.taluka || prevAddr.taluka || '',
    state: inAddr.state || prevAddr.state || 'Gujarat',
    pincode: data.pincode || inAddr.pincode || prevAddr.pincode || '',
  };

  data.city = data.address.city;
  data.taluka = data.address.taluka;
  data.pincode = data.address.pincode;

  // 4. Validate and normalize Enums
  const VALID_TYPES = ['PTZ', 'Fixed', 'Dome', 'Bullet', 'Fisheye', 'Thermal'];
  if (data.type) {
    const matched = VALID_TYPES.find((t) => t.toLowerCase() === String(data.type).toLowerCase());
    data.type = matched || 'Fixed';
  } else if (!existing) {
    data.type = 'Fixed';
  }

  const VALID_ZONES = [
    'Traffic', 'Public Space', 'Market', 'School Zone', 'Hospital',
    'Religious Site', 'Border', 'Industrial', 'Residential', 'Other'
  ];
  if (data.zone) {
    const matchedZone = VALID_ZONES.find((z) => z.toLowerCase() === String(data.zone).toLowerCase());
    data.zone = matchedZone || 'Traffic';
  } else if (!existing) {
    data.zone = 'Traffic';
  }

  const VALID_STATUSES = ['online', 'offline', 'maintenance', 'fault'];
  if (data.status) {
    const matchedStatus = VALID_STATUSES.find((s) => s.toLowerCase() === String(data.status).toLowerCase());
    data.status = matchedStatus || 'online';
  } else if (!existing) {
    data.status = 'online';
  }

  const VALID_RESOLUTIONS = ['720p', '1080p', '2K', '4K', '8K'];
  if (data.resolution) {
    const matchedRes = VALID_RESOLUTIONS.find((r) => r.toLowerCase() === String(data.resolution).toLowerCase());
    data.resolution = matchedRes || '1080p';
  }

  // 5. Hardware / Brand / Model
  if (data.model && !data.camera_model) {
    data.camera_model = data.model;
  } else if (data.camera_model && !data.model) {
    data.model = data.camera_model;
  }

  if (!data.streamId && !existing) {
    data.streamId = `cam${Math.floor(Math.random() * 30 + 1).toString().padStart(2, '0')}`;
  }
  if (!data.streamType) data.streamType = existing?.streamType || 'HLS';
  if (!data.departmentName) data.departmentName = existing?.departmentName || 'Gujarat Police Department';

  // 6. Alerts
  if (data.alertsEnabled && typeof data.alertsEnabled === 'object') {
    data.alertsEnabled = {
      motionDetection: data.alertsEnabled.motionDetection !== undefined ? Boolean(data.alertsEnabled.motionDetection) : (existing?.alertsEnabled?.motionDetection ?? true),
      crowdDetection: data.alertsEnabled.crowdDetection !== undefined ? Boolean(data.alertsEnabled.crowdDetection) : (existing?.alertsEnabled?.crowdDetection ?? false),
      nightVision: data.alertsEnabled.nightVision !== undefined ? Boolean(data.alertsEnabled.nightVision) : (existing?.alertsEnabled?.nightVision ?? false),
      anprEnabled: data.alertsEnabled.anprEnabled !== undefined ? Boolean(data.alertsEnabled.anprEnabled) : (existing?.alertsEnabled?.anprEnabled ?? false),
      faceRecognition: data.alertsEnabled.faceRecognition !== undefined ? Boolean(data.alertsEnabled.faceRecognition) : (existing?.alertsEnabled?.faceRecognition ?? false),
    };
  }

  return data;
};

/**
 * @desc    Create camera
 * @route   POST /api/cameras
 */
const createCamera = async (req, res) => {
  try {
    const sanitized = sanitizeCameraPayload(req.body);
    if (!sanitized.cameraId) {
      sanitized.cameraId = `GJ-CAM-${uuidv4().split('-')[0].toUpperCase()}`;
    }

    const existingCam = await Camera.findOne({ cameraId: sanitized.cameraId });
    if (existingCam) {
      return res.status(400).json({
        success: false,
        message: `Camera ID '${sanitized.cameraId}' already exists. Please choose a unique ID.`,
      });
    }

    const camera = await Camera.create(sanitized);

    // Audit log
    await SystemAuditLog.record({
      req,
      action: 'CAMERA_CREATED',
      resource: 'Camera',
      resourceId: camera.cameraId,
      description: `Camera ${camera.cameraId} (${camera.name}) was registered in ${camera.district}`,
    });

    // Emit via socket
    req.io?.emit('camera:new', camera);

    res.status(201).json({ success: true, data: camera });
  } catch (error) {
    logger.error(`Create camera error: ${error.message}`);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Camera ID already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update camera
 * @route   PUT /api/cameras/:id
 */
const updateCamera = async (req, res) => {
  try {
    const existing = await Camera.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }

    // Check duplicate cameraId if changed
    if (req.body.cameraId && req.body.cameraId !== existing.cameraId) {
      const duplicate = await Camera.findOne({
        cameraId: req.body.cameraId,
        _id: { $ne: req.params.id },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Camera ID '${req.body.cameraId}' already belongs to another camera.`,
        });
      }
    }

    const sanitized = sanitizeCameraPayload(req.body, existing);

    const camera = await Camera.findByIdAndUpdate(req.params.id, sanitized, {
      returnDocument: 'after',
      new: true,
      runValidators: true,
    });

    // Audit log
    await SystemAuditLog.record({
      req,
      action: 'CAMERA_UPDATED',
      resource: 'Camera',
      resourceId: camera.cameraId,
      description: `Camera ${camera.cameraId} details updated (District: ${camera.district}, Status: ${camera.status})`,
    });

    req.io?.emit('camera:updated', camera);
    res.status(200).json({ success: true, data: camera });
  } catch (error) {
    logger.error(`Update camera error: ${error.message}`);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Camera ID already exists' });
    }
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
      { returnDocument: 'after', new: true }
    );
    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }

    // Audit log
    await SystemAuditLog.record({
      req,
      action: 'CAMERA_DELETED',
      resource: 'Camera',
      resourceId: camera.cameraId,
      description: `Camera ${camera.cameraId} (${camera.name}) was deactivated / removed`,
    });

    req.io?.emit('camera:deleted', { id: req.params.id, cameraId: camera.cameraId });
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

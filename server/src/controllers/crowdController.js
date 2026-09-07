/**
 * Crowd Detection Controller
 * ==========================
 * Exposes REST endpoints consumed by the DrishtiGrid frontend and external systems.
 *
 * Routes
 * ------
 *  POST /api/crowd/analyze       — Upload a single frame for on-demand crowd analysis
 *  GET  /api/crowd/alerts        — Fetch recent crowd_surge alerts from the DB
 *  GET  /api/crowd/stats         — Aggregated crowd statistics
 *  POST /api/crowd/reset/:camId  — Reset per-camera surge baseline in the AI service
 */

const multer = require('multer');
const axios = require('axios');
const Camera = require('../models/Camera');
const Alert = require('../models/Alert');
const { analyzeCrowdFrame, resetCrowdAlertCooldown } = require('../services/crowdDetectionService');
const logger = require('../utils/logger');

// Multer memory storage for crowd frame uploads (max 20 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    cb(null, allowed.includes((file.mimetype || '').toLowerCase()));
  },
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';


/**
 * @desc    On-demand crowd analysis for a single uploaded frame
 * @route   POST /api/crowd/analyze
 * @access  Private (authenticated users)
 */
const analyzeFrame = [
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file provided.' });
      }

      const {
        camera_id: cameraId = 'default',
        conf_threshold: confThresholdStr = '0.30',
        grid_rows: gridRowsStr = '3',
        grid_cols: gridColsStr = '4',
      } = req.body;

      const confThreshold = parseFloat(confThresholdStr) || 0.30;
      const gridRows = parseInt(gridRowsStr, 10) || 3;
      const gridCols = parseInt(gridColsStr, 10) || 4;

      // Optional: look up the camera document for richer context
      let cameraDoc = null;
      if (cameraId && cameraId !== 'default') {
        cameraDoc = await Camera.findOne({ cameraId }).lean().catch(() => null);
      }

      const result = await analyzeCrowdFrame({
        imageBuffer: req.file.buffer,
        cameraId,
        cameraDoc,
        io: req.io,
        confThreshold,
        gridRows,
        gridCols,
      });

      if (!result.success) {
        return res.status(502).json({
          success: false,
          message: result.error || 'Crowd analysis failed.',
          data: result,
        });
      }

      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      logger.error(`[CrowdController] analyzeFrame error: ${err.message}`);
      return res.status(500).json({ success: false, message: err.message });
    }
  },
];


/**
 * @desc    Fetch recent crowd_surge alerts with pagination
 * @route   GET /api/crowd/alerts
 * @access  Private
 */
const getCrowdAlerts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      severity,
      cameraId,
      from,
      to,
    } = req.query;

    const filter = { type: 'crowd_surge' };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (cameraId) filter.cameraId = cameraId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const total = await Alert.countDocuments(filter);
    const alerts = await Alert.find(filter)
      .populate('camera', 'name cameraId address location')
      .populate('acknowledgedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((parseInt(page, 10) - 1) * parseInt(limit, 10))
      .limit(parseInt(limit, 10));

    return res.status(200).json({
      success: true,
      data: alerts,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error(`[CrowdController] getCrowdAlerts error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};


/**
 * @desc    Get crowd detection statistics
 * @route   GET /api/crowd/stats
 * @access  Private
 */
const getCrowdStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalAlerts,
      activeAlerts,
      criticalAlerts,
      todayAlerts,
      bySeverity,
      byCamera,
    ] = await Promise.all([
      Alert.countDocuments({ type: 'crowd_surge' }),
      Alert.countDocuments({ type: 'crowd_surge', status: 'active' }),
      Alert.countDocuments({ type: 'crowd_surge', severity: 'critical', status: 'active' }),
      Alert.countDocuments({ type: 'crowd_surge', createdAt: { $gte: today } }),
      Alert.aggregate([
        { $match: { type: 'crowd_surge' } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Alert.aggregate([
        { $match: { type: 'crowd_surge' } },
        { $group: { _id: '$cameraId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalAlerts,
        activeAlerts,
        criticalAlerts,
        todayAlerts,
        bySeverity,
        byCamera,
      },
    });
  } catch (err) {
    logger.error(`[CrowdController] getCrowdStats error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};


/**
 * @desc    Reset the crowd surge baseline for a specific camera in the AI service
 * @route   POST /api/crowd/reset/:camId
 * @access  Private (admin/operator)
 */
const resetCameraBaseline = async (req, res) => {
  try {
    const { camId } = req.params;

    // Reset the server-side alert cooldown
    resetCrowdAlertCooldown(camId);

    // Inform AI service to reset its in-memory baseline
    try {
      await axios.post(
        `${AI_SERVICE_URL}/crowd/reset/${encodeURIComponent(camId)}`,
        {},
        { timeout: 5000 }
      );
    } catch (aiErr) {
      // Non-fatal — AI service endpoint may not exist yet
      logger.debug(`[CrowdController] AI baseline reset call: ${aiErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: `Crowd baseline reset for camera '${camId}'.`,
    });
  } catch (err) {
    logger.error(`[CrowdController] resetCameraBaseline error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};


module.exports = {
  analyzeFrame,
  getCrowdAlerts,
  getCrowdStats,
  resetCameraBaseline,
};

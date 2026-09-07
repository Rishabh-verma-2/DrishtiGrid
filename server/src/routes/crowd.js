/**
 * Crowd Detection Routes
 * ======================
 * Mounted at /api/crowd in app.js
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  analyzeFrame,
  getCrowdAlerts,
  getCrowdStats,
  resetCameraBaseline,
} = require('../controllers/crowdController');

/**
 * @route   POST /api/crowd/analyze
 * @desc    Upload an image frame for on-demand crowd density analysis
 * @access  Private
 *
 * Form-data fields:
 *   image         : File  (JPEG/PNG, required)
 *   camera_id     : string (optional, default "default")
 *   conf_threshold: float  (optional, 0.15–0.95, default 0.30)
 *   grid_rows     : int   (optional, 1–8, default 3)
 *   grid_cols     : int   (optional, 1–8, default 4)
 */
router.post('/analyze', authenticate, ...analyzeFrame);

/**
 * @route   GET /api/crowd/alerts
 * @desc    Fetch recent crowd_surge alerts with pagination and filters
 * @access  Private
 *
 * Query params:
 *   page, limit, status, severity, cameraId, from, to
 */
router.get('/alerts', authenticate, getCrowdAlerts);

/**
 * @route   GET /api/crowd/stats
 * @desc    Aggregate crowd alert statistics
 * @access  Private
 */
router.get('/stats', authenticate, getCrowdStats);

/**
 * @route   POST /api/crowd/reset/:camId
 * @desc    Reset crowd surge baseline and alert cooldown for a camera
 * @access  Private
 */
router.post('/reset/:camId', authenticate, resetCameraBaseline);

module.exports = router;

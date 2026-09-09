/**
 * Crowd Detection Service
 * =======================
 * Orchestrates the flow from the Node.js server to the Python AI service's
 * /crowd endpoint. Handles:
 *
 *  - Sending a frame (image buffer) to the AI service for crowd analysis
 *  - Persisting crowd_surge Alerts to MongoDB when thresholds are breached
 *  - Emitting real-time Socket.IO events for the frontend dashboard
 *  - Per-camera cooldown logic to avoid alert flooding (one alert per 60 seconds)
 *
 * Usage
 * -----
 *  const { analyzeCrowdFrame } = require('./crowdDetectionService');
 *
 *  // Inside a scheduled job or frame handler:
 *  const result = await analyzeCrowdFrame({
 *    imageBuffer, cameraId, cameraDoc, io
 *  });
 */

const axios = require('axios');
const FormData = require('form-data');
const Alert = require('../models/Alert');
const logger = require('../utils/logger');
const { randomUUID: uuidv4 } = require('crypto');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// Per-camera last-alert timestamps to enforce cooldown (avoid alert spam)
// Map<cameraId, lastAlertTimestamp(ms)>
const _lastAlertTimestamps = new Map();

// Minimum gap between consecutive crowd alerts for the same camera (ms)
const ALERT_COOLDOWN_MS = 60 * 1000; // 60 seconds

// Crowd level → alert severity mapping
const CROWD_SEVERITY_MAP = {
  LOW:      'info',
  MEDIUM:   'low',
  HIGH:     'medium',
  CRITICAL: 'critical',
};

// Only generate an Alert document for these crowd levels
const ALERTABLE_LEVELS = new Set(['HIGH', 'CRITICAL']);


/**
 * Send an image buffer to the AI service's /crowd endpoint and return the result.
 *
 * @param {Buffer} imageBuffer      - JPEG/PNG frame bytes
 * @param {string} cameraId         - Camera identifier (for per-camera surge baseline in AI)
 * @param {number} [confThreshold]  - YOLO confidence threshold (0.15-0.95)
 * @param {number} [gridRows]       - Density grid rows (1-8)
 * @param {number} [gridCols]       - Density grid columns (1-8)
 * @returns {Promise<Object>}       - Raw AI service response
 */
async function callCrowdAIService(
  imageBuffer,
  cameraId = 'default',
  confThreshold = 0.15,
  gridRows = 3,
  gridCols = 4,
  roi = null
) {
  const form = new FormData();
  form.append('image', imageBuffer, {
    filename: `crowd_frame_${cameraId}_${Date.now()}.jpg`,
    contentType: 'image/jpeg',
  });
  form.append('camera_id', String(cameraId));
  form.append('conf_threshold', String(Math.max(0.15, confThreshold)));
  form.append('grid_rows', String(gridRows));
  form.append('grid_cols', String(gridCols));
  if (roi) {
    form.append('roi', typeof roi === 'string' ? roi : JSON.stringify(roi));
  }

  const response = await axios.post(`${AI_SERVICE_URL}/crowd`, form, {
    headers: form.getHeaders(),
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024,
  });

  return response.data;
}


/**
 * Main entry point: analyze a single frame for crowd density.
 *
 * Steps:
 *  1. Call AI service /crowd endpoint for actual YOLOv8 person detection
 *  2. Emit Socket.IO event crowd:analysis with actual metrics to all connected clients
 *  3. If crowd level is HIGH or CRITICAL and cooldown has elapsed:
 *     a. Create a crowd_surge Alert in MongoDB
 *     b. Emit Socket.IO events alert:new and crowd:alert
 *  4. Return structured result
 *
 * @param {Object} params
 * @param {Buffer}  params.imageBuffer   - Raw image bytes
 * @param {string}  params.cameraId      - Camera ID string (e.g. "cam01")
 * @param {Object}  [params.cameraDoc]   - Mongoose Camera document (for location/metadata)
 * @param {Object}  [params.io]          - Socket.IO server instance
 * @param {number}  [params.confThreshold] - Detection confidence threshold
 * @param {number}  [params.gridRows]    - Grid rows for zone map
 * @param {number}  [params.gridCols]    - Grid columns for zone map
 * @param {Object}  [params.roi]         - Optional Camera ROI coordinates
 * @returns {Promise<Object>} Combined result: AI metrics + alert info
 */
async function analyzeCrowdFrame({
  imageBuffer,
  cameraId = 'default',
  cameraDoc = null,
  io = null,
  confThreshold = 0.15,
  gridRows = 3,
  gridCols = 4,
  roi = null,
}) {
  const analysisResult = {
    success:             false,
    cameraId,
    detected_count:      0,
    occluded_est:        0,
    total_count:         0,
    crowd_level:         'ZERO',
    density_score:       0.0,
    zones:               [],
    person_detections:   [],
    object_inventory:    {},
    surge:               { surge_detected: false, baseline_avg: 0, surge_percent: 0 },
    alert_created:       false,
    alert_id:            null,
    annotated_image_b64: '',
    processing_time_ms:  0,
    error:               null,
  };

  try {
    // ---- 1. Call Python AI service for actual YOLO person detection ----
    let aiResult;
    try {
      const activeRoi = roi || cameraDoc?.roi || null;
      aiResult = await callCrowdAIService(
        imageBuffer,
        cameraId,
        confThreshold,
        gridRows,
        gridCols,
        activeRoi
      );
    } catch (aiErr) {
      const errMsg = aiErr.response?.data?.detail || aiErr.message;
      logger.error(`[CrowdService] AI service call error for camera ${cameraId}: ${errMsg}`);
      analysisResult.error = `AI service error: ${errMsg}`;
      return analysisResult;
    }

    if (!aiResult || !aiResult.success) {
      analysisResult.error = aiResult?.error || 'AI detection returned unsuccessful result';
      return analysisResult;
    }

    analysisResult.success = true;
    analysisResult.detected_count = aiResult.detected_count || 0;
    analysisResult.occluded_est   = aiResult.occluded_est   || 0;
    analysisResult.total_count    = aiResult.total_count    || aiResult.person_count || 0;
    analysisResult.crowd_level    = aiResult.crowd_level    || 'LOW';
    analysisResult.density_score  = aiResult.density_score  || 0;
    analysisResult.zones              = aiResult.zones              || [];
    analysisResult.person_detections  = aiResult.person_detections  || aiResult.detections || [];
    analysisResult.object_inventory   = aiResult.object_inventory   || {};
    analysisResult.surge              = aiResult.surge              || {};
    analysisResult.annotated_image_b64 = aiResult.annotated_image_b64 || '';
    analysisResult.processing_time_ms  = aiResult.processing_time_ms  || 0;

    // ---- 2. Emit real-time crowd analysis to all dashboard clients ----
    if (io) {
      io.emit('crowd:analysis', {
        cameraId,
        cameraName:           cameraDoc?.name || cameraId,
        detected_count:       aiResult.detected_count,
        occluded_est:         aiResult.occluded_est,
        total_count:          aiResult.total_count,
        crowd_level:          aiResult.crowd_level,
        density_score:        aiResult.density_score,
        zones:                aiResult.zones,
        surge:                aiResult.surge,
        object_inventory:     aiResult.object_inventory,
        annotated_image_b64:  aiResult.annotated_image_b64,
        timestamp:            new Date().toISOString(),
      });
    }

    // ---- 3. Alert generation ----
    const crowdLevel    = aiResult.crowd_level    || 'LOW';
    const totalCount    = aiResult.total_count    || aiResult.person_count || 0;
    const surgeDetected = aiResult.surge?.surge_detected || false;
    const shouldAlert   = ALERTABLE_LEVELS.has(crowdLevel) || surgeDetected;

    if (shouldAlert) {
      const lastAlert = _lastAlertTimestamps.get(cameraId) || 0;
      const cooldownElapsed = Date.now() - lastAlert >= ALERT_COOLDOWN_MS;

      if (cooldownElapsed) {
        try {
          const severity   = CROWD_SEVERITY_MAP[crowdLevel] || 'medium';
          const detected   = aiResult.detected_count  || 0;
          const occluded   = aiResult.occluded_est     || 0;
          const vehicles   = aiResult.object_inventory?.vehicle_total || 0;
          const surgeNote  = surgeDetected
            ? ` Surge: +${(aiResult.surge?.surge_percent || 0).toFixed(0)}% above baseline.`
            : '';
          const vehNote    = vehicles > 0 ? ` Vehicles in frame: ${vehicles}.` : '';
          const alertTitle = crowdLevel === 'CRITICAL'
            ? `Critical Crowd Density — ${totalCount} persons (est.)`
            : `High Crowd Density — ${totalCount} persons (est.)`;

          const alertLocation = cameraDoc?.location?.coordinates?.length === 2
            ? cameraDoc.location
            : { type: 'Point', coordinates: [72.5714, 23.0225] };
          const alertAddress = cameraDoc?.address || {
            district: cameraDoc?.district || 'Ahmedabad',
            city: 'Ahmedabad',
            area: 'Command Grid',
          };
          const alertDistrict = cameraDoc?.district || cameraDoc?.address?.district || 'Ahmedabad';
          const alertSnapshot = aiResult.annotated_image_b64
            ? (aiResult.annotated_image_b64.startsWith('data:')
                ? aiResult.annotated_image_b64
                : `data:image/jpeg;base64,${aiResult.annotated_image_b64}`)
            : (imageBuffer ? `data:image/jpeg;base64,${imageBuffer.toString('base64')}` : '');

          const alertDoc = await Alert.create({
            alertId:     `ALT-${uuidv4().split('-')[0].toUpperCase()}`,
            type:        'crowd_surge',
            title:       alertTitle,
            description:
              `Camera: ${cameraDoc?.name || cameraId}. ` +
              `Detected: ${detected} persons (+${occluded} estimated hidden). ` +
              `Level: ${crowdLevel}, Density: ${Math.round((aiResult.density_score || 0) * 100)}%.` +
              surgeNote + vehNote,
            severity,
            status:      'active',
            camera:      cameraDoc?._id     || undefined,
            cameraId:    String(cameraDoc?.cameraId || cameraId),
            location:    alertLocation,
            address:     alertAddress,
            district:    alertDistrict,
            snapshot:    alertSnapshot,
            metadata: {
              detected_count:   detected,
              occluded_est:     occluded,
              total_count:      totalCount,
              crowd_level:      crowdLevel,
              density_score:    aiResult.density_score,
              surge:            aiResult.surge,
              zones:            aiResult.zones,
              object_inventory: aiResult.object_inventory,
              annotated_image_b64: aiResult.annotated_image_b64,
              camera_id:        cameraId,
            },
          });

          analysisResult.alert_created = true;
          analysisResult.alert_id = alertDoc.alertId;
          _lastAlertTimestamps.set(cameraId, Date.now());

          // Emit alert events
          if (io) {
            io.emit('alert:new', alertDoc);
            io.emit('crowd:alert', {
              alertId:       alertDoc.alertId,
              cameraId,
              cameraName:    cameraDoc?.name || cameraId,
              crowd_level:   crowdLevel,
              detected_count: detected,
              occluded_est:  occluded,
              total_count:   totalCount,
              density_score: aiResult.density_score,
              vehicle_total: aiResult.object_inventory?.vehicle_total || 0,
              surge:         aiResult.surge,
              severity,
              timestamp:     new Date().toISOString(),
            });

            // Also emit to district room if available
            const district = cameraDoc?.district || cameraDoc?.address?.district;
            if (district) {
              io.to(`district:${district}`).emit('alert:new', alertDoc);
            }
          }

          logger.info(
            `[CrowdService] Alert created for camera ${cameraId}: ` +
            `${crowdLevel} (${aiResult.person_count} persons)`
          );
        } catch (alertErr) {
          logger.error(`[CrowdService] Failed to create crowd alert: ${alertErr.message}`);
        }
      } else {
        logger.debug(
          `[CrowdService] Alert suppressed for camera ${cameraId} — cooldown active ` +
          `(${Math.round((ALERT_COOLDOWN_MS - (Date.now() - lastAlert)) / 1000)}s remaining)`
        );
      }
    }

    return analysisResult;
  } catch (err) {
    const isNetworkError = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET';
    if (isNetworkError) {
      logger.warn(`[CrowdService] AI service unreachable for camera ${cameraId}: ${err.message}`);
    } else {
      logger.error(`[CrowdService] Analysis error for camera ${cameraId}: ${err.message}`);
    }
    analysisResult.error = err.message;
    return analysisResult;
  }
}


/**
 * Reset the per-camera alert cooldown (e.g., when camera config changes).
 * @param {string} cameraId
 */
function resetCrowdAlertCooldown(cameraId) {
  _lastAlertTimestamps.delete(cameraId);
}


module.exports = {
  analyzeCrowdFrame,
  callCrowdAIService,
  resetCrowdAlertCooldown,
};

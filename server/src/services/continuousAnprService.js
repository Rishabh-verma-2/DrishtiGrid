/**
 * Continuous ANPR Service
 *
 * Runs continuous server-side frame sampling on active CCTV streams at a configurable
 * inference rate (ANPR_INFERENCE_FPS, default 1-2 FPS).
 *
 * Architecture:
 * Live Stream -> Controlled Frame Sampling (ffmpeg-static) ->
 * AI Service (/process: YOLOv8 + Zero-DCE + PaddleOCR + Vehicle Attributes) ->
 * Temporal Vehicle Tracking & Consensus Deduplication ->
 * Real-time Normalized Events Emitted via Socket.IO to camera:${cameraId} room
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');
const { randomUUID: uuidv4 } = require('crypto');
const logger = require('../utils/logger');
const {
  normalizePlateNumber,
  canonicalPlateNumber,
  computeTemporalConsensusPlate,
  arePlatesSimilar,
  getConsensusColor,
} = require('../utils/plateUtils');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const INFERENCE_FPS = Math.max(1, parseInt(process.env.ANPR_INFERENCE_FPS || '1', 10));
const SAMPLING_INTERVAL_MS = Math.round(1000 / INFERENCE_FPS);
const TRACK_EXPIRY_MS = 10000; // Finalize track 10s after vehicle exits scene

// In-memory active continuous ANPR loops:
// cameraId -> { camera, timer, tracks: Map, isSampling, lastFrameTime }
const activeLoops = new Map();

// Lazy-resolve ffmpeg path
let ffmpegBinary = null;
try {
  ffmpegBinary = require('ffmpeg-static');
} catch (e) {
  logger.warn('[ContinuousANPR] ffmpeg-static not found, using "ffmpeg" command');
  ffmpegBinary = 'ffmpeg';
}

/**
 * Capture a single JPEG frame from a stream URL using ffmpeg
 */
async function captureFrameFromStream(streamUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!ffmpegBinary) {
      return reject(new Error('FFmpeg binary not available'));
    }

    const isRtsp = String(streamUrl).startsWith('rtsp://');
    const args = [
      '-y',
      '-loglevel', 'error',
    ];

    if (isRtsp) {
      args.push(
        '-rtsp_transport', 'tcp',
        '-fflags', 'nobuffer',
        '-flags', 'low_delay'
      );
    } else {
      args.push(
        '-fflags', 'nobuffer+discardcorrupt',
        '-flags', 'low_delay'
      );
    }

    args.push(
      '-i', streamUrl,
      '-vf', 'scale=960:-1',
      '-vframes', '1',
      '-f', 'image2',
      '-q:v', '4',
      'pipe:1'
    );

    const proc = spawn(ffmpegBinary, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
      reject(new Error(`Frame capture timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (c) => chunks.push(c));
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Call Python FastAPI AI Service /process
 */
async function runFrameInference(imageBuffer) {
  try {
    const form = new FormData();
    form.append('image', imageBuffer, {
      filename: 'continuous_cctv_frame.jpg',
      contentType: 'image/jpeg',
    });

    const response = await axios.post(`${AI_SERVICE_URL}/process`, form, {
      headers: form.getHeaders(),
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return response.data;
  } catch (err) {
    logger.debug?.(`[ContinuousANPR] AI Service frame call note: ${err.message}`);
    return null;
  }
}

/**
 * Format and normalize vehicle type names (Car, Bus, Truck, Rickshaw, Bike)
 */
function formatVehicleType(rawType, bbox, color) {
  if (!rawType) return 'Car';
  const t = String(rawType).toLowerCase().trim();
  if (t.includes('rickshaw') || t.includes('auto') || t.includes('three') || t.includes('tuk')) return 'Rickshaw';
  if (t.includes('bus')) return 'Bus';
  if (t.includes('truck') || t.includes('lorry')) return 'Truck';
  if (t.includes('bike') || t.includes('motorcycle') || t.includes('scooter') || t.includes('two')) return 'Bike';
  
  // Heuristic for Indian traffic: auto-rickshaws frequently have yellow/green colors or compact geometry
  if (bbox && bbox.width && bbox.height) {
    const ratio = bbox.width / bbox.height;
    const isYellowGreen = String(color || '').toLowerCase().includes('yellow') || String(color || '').toLowerCase().includes('green');
    if (ratio > 0.65 && ratio < 1.35 && bbox.width < 140 && isYellowGreen) {
      return 'Rickshaw';
    }
  }
  return 'Car';
}

/**
 * Calculate IoU between two bounding boxes
 */
function computeIoU(boxA, boxB) {
  if (!boxA || !boxB) return 0;
  const ax1 = boxA.x !== undefined ? boxA.x : (boxA.x1 || 0);
  const ay1 = boxA.y !== undefined ? boxA.y : (boxA.y1 || 0);
  const ax2 = boxA.x2 !== undefined ? boxA.x2 : (ax1 + (boxA.width || 0));
  const ay2 = boxA.y2 !== undefined ? boxA.y2 : (ay1 + (boxA.height || 0));

  const bx1 = boxB.x !== undefined ? boxB.x : (boxB.x1 || 0);
  const by1 = boxB.y !== undefined ? boxB.y : (boxB.y1 || 0);
  const bx2 = boxB.x2 !== undefined ? boxB.x2 : (bx1 + (boxB.width || 0));
  const by2 = boxB.y2 !== undefined ? boxB.y2 : (by1 + (boxB.height || 0));

  const xLeft = Math.max(ax1, bx1);
  const yTop = Math.max(ay1, by1);
  const xRight = Math.min(ax2, bx2);
  const yBottom = Math.min(ay2, by2);

  if (xRight <= xLeft || yBottom <= yTop) return 0;

  const intersection = (xRight - xLeft) * (yBottom - yTop);
  const areaA = (ax2 - ax1) * (ay2 - ay1);
  const areaB = (bx2 - bx1) * (by2 - by1);
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Socket.IO emitter helper
 */
function emitToCameraRoom(cameraId, event, data) {
  try {
    const { getIO } = require('../socket/socketHandler');
    const io = getIO ? getIO() : null;
    if (io) {
      io.to(`camera:${cameraId}`).emit(event, data);
    }
  } catch (err) {
    logger.warn(`[ContinuousANPR] Error emitting to camera room: ${err.message}`);
  }
}

class ContinuousAnprService {
  /**
   * Start continuous ANPR for a live camera
   */
  async startCameraAnpr(camera) {
    const cid = camera.cameraId;
    if (activeLoops.has(cid)) {
      logger.info(`[ContinuousANPR] Loop already active for camera ${cid}`);
      return;
    }

    const streamId = camera.streamId || (camera.cameraId && /^cam/i.test(camera.cameraId) ? camera.cameraId : 'cam01');
    const isSentinel = /^cam([0-2][0-9]|30)$/i.test(streamId);

    const email = process.env.SENTINEL_EMAIL || 'rishabh.verma2626@gmail.com';
    const password = process.env.SENTINEL_PASSWORD || 'A6DR-CG63-ZSEU';
    const STREAM_IP = '103.250.160.189';
    const serverPort = process.env.PORT || 5001;

    let primaryStreamUrl = '';
    let fallbackStreamUrl = '';

    if (isSentinel) {
      primaryStreamUrl = `rtsp://${encodeURIComponent(email)}:${password}@${STREAM_IP}:8554/stream/${streamId}`;
      fallbackStreamUrl = `http://127.0.0.1:${serverPort}/api/stream/sentinel/${streamId}/index.m3u8`;
    } else if (camera.stream?.rtspUrl) {
      primaryStreamUrl = camera.stream.rtspUrl;
      fallbackStreamUrl = camera.stream.playbackUrl || '';
    } else {
      primaryStreamUrl = camera.stream?.playbackUrl || `http://127.0.0.1:${serverPort}/api/stream/sentinel/${streamId}/index.m3u8`;
    }

    const state = {
      camera,
      streamUrl: primaryStreamUrl,
      fallbackStreamUrl,
      tracks: new Map(), // trackId -> TrackObject
      isSampling: false,
      timer: null,
      startedAt: new Date(),
    };

    activeLoops.set(cid, state);
    logger.info(`[ContinuousANPR] Started continuous ANPR worker for ${cid} at ${INFERENCE_FPS} FPS`);

    emitToCameraRoom(cid, 'anpr:stream_status', {
      cameraId: cid,
      status: 'LIVE',
      sourceType: camera.sourceType || 'LIVE',
      inferenceFps: INFERENCE_FPS,
      message: 'Continuous ANPR stream inference active',
    });

    // Schedule frame sampling with self-chaining timer
    const scheduleNextSample = (delayMs = 100) => {
      const currentState = activeLoops.get(cid);
      if (!currentState) return;
      currentState.timer = setTimeout(() => {
        this.sampleAndProcessFrame(cid).finally(() => {
          scheduleNextSample(150);
        });
      }, delayMs);
    };

    scheduleNextSample(50);
  }

  /**
   * Stop continuous ANPR for a camera
   */
  stopCameraAnpr(cameraId) {
    const state = activeLoops.get(cameraId);
    if (!state) return;

    if (state.timer) {
      clearTimeout(state.timer);
    }

    // Finalize all remaining active tracks before exiting
    this.finalizeAllTracks(state);

    activeLoops.delete(cameraId);
    logger.info(`[ContinuousANPR] Stopped continuous ANPR worker for ${cameraId}`);

    emitToCameraRoom(cameraId, 'anpr:stream_status', {
      cameraId,
      status: 'OFFLINE',
      message: 'Continuous ANPR session stopped',
    });
  }

  /**
   * Main single-frame sampling and inference pipeline
   */
  async sampleAndProcessFrame(cameraId) {
    const state = activeLoops.get(cameraId);
    if (!state || state.isSampling) return;

    state.isSampling = true;
    try {
      let imageBuffer = null;

      try {
        imageBuffer = await captureFrameFromStream(state.streamUrl, 8000);
      } catch (streamErr) {
        if (state.fallbackStreamUrl && state.streamUrl !== state.fallbackStreamUrl) {
          logger.debug?.(`[ContinuousANPR] Primary capture failed for ${cameraId}, attempting fallback: ${streamErr.message}`);
          try {
            imageBuffer = await captureFrameFromStream(state.fallbackStreamUrl, 15000);
          } catch (fbErr) {
            logger.debug?.(`[ContinuousANPR] Fallback capture also failed for ${cameraId}: ${fbErr.message}`);
          }
        } else {
          logger.debug?.(`[ContinuousANPR] Capture note for ${cameraId}: ${streamErr.message}`);
        }
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        state.isSampling = false;
        this.checkTrackExpiries(state);
        return;
      }

      // Run image through FastAPI ANPR pipeline
      const aiResult = await runFrameInference(imageBuffer);
      if (aiResult && aiResult.success) {
        this.processDetections(state, aiResult);
      }

      // Expire old tracks that have left the camera view
      this.checkTrackExpiries(state);
    } catch (err) {
      logger.debug?.(`[ContinuousANPR] Sample error for ${cameraId}: ${err.message}`);
    } finally {
      state.isSampling = false;
    }
  }

  /**
   * Process raw AI detections, associate with tracks, deduplicate, and emit events
   */
  processDetections(state, aiResult) {
    const now = new Date();
    const camera = state.camera;
    const plates = aiResult.plates || [];
    const vehicles = aiResult.vehicles || aiResult.vehicle_results || [];

    const candidateDetections = [];

    // 1. Process vehicles from the AI pipeline
    if (vehicles.length > 0) {
      for (const v of vehicles) {
        const hasPlate = Boolean(v.has_plate && v.number_plate && v.number_plate !== 'NO PLATE DETECTED');
        const plateText = hasPlate ? (v.number_plate || v.normalized_plate || '') : '';
        const ocrConf = hasPlate ? ((v.plate_confidence || v.overall_confidence || 85) / 100) : 0;
        const isUnreadable = !hasPlate || !plateText;
        const vColor = v.car_color || v.color || 'Unknown';
        const vBbox = v.vehicle_bbox || v.bbox;
        const vType = formatVehicleType(v.vehicle_type, vBbox, vColor);

        candidateDetections.push({
          rawOcr: plateText,
          plateText: plateText,
          ocrConfidence: ocrConf,
          isUnreadable,
          vehicleType: vType,
          vehicleColor: vColor,
          bbox: v.plate_bbox || null,
          vehicleBbox: vBbox,
          plateCrop: v.plate_crop || '',
          vehicleCrop: v.vehicle_crop || '',
        });
      }
    }

    // 2. Also incorporate any validated plate candidates
    if (plates.length > 0) {
      for (const p of plates) {
        const pText = p.corrected_plate || p.normalized_plate || p.raw_ocr || '';
        const alreadyIncluded = candidateDetections.some((c) => c.plateText && c.plateText === pText);
        if (!alreadyIncluded) {
          const vColor = p.car_color || 'Unknown';
          const vBbox = p.vehicle_bbox || p.bbox;
          const vType = formatVehicleType(p.vehicle_type, vBbox, vColor);

          candidateDetections.push({
            rawOcr: p.raw_ocr || '',
            plateText: pText,
            ocrConfidence: p.ocr_confidence || p.overall_confidence || 0.85,
            isUnreadable: !p.normalized_plate || (p.ocr_confidence && p.ocr_confidence < 0.50),
            vehicleType: vType,
            vehicleColor: vColor,
            bbox: p.bbox,
            vehicleBbox: vBbox,
            plateCrop: p.enhanced_crop_b64 || p.original_crop_b64 || '',
            vehicleCrop: p.vehicle_crop_b64 || '',
          });
        }
      }
    }

    for (const cand of candidateDetections) {
      // Find matching track among active tracks
      let matchedTrack = null;

      for (const [tId, track] of state.tracks.entries()) {
        const iou = cand.vehicleBbox && track.lastBbox ? computeIoU(cand.vehicleBbox, track.lastBbox) : 0;
        const plateMatch = cand.plateText && track.plate?.text ? arePlatesSimilar(cand.plateText, track.plate.text) : false;

        if (iou > 0.30 || plateMatch) {
          matchedTrack = track;
          break;
        }
      }

      if (matchedTrack) {
        // Update existing track (Temporal Deduplication)
        const prevSeen = matchedTrack.lastSeen ? new Date(matchedTrack.lastSeen).getTime() : now.getTime();
        const dtSec = Math.max(0.1, (now.getTime() - prevSeen) / 1000);

        let velocity = matchedTrack.velocity || { vx: 0, vy: 0 };
        if (cand.vehicleBbox && matchedTrack.lastBbox) {
          const pb = matchedTrack.lastBbox;
          const cb = cand.vehicleBbox;
          const px = pb.x !== undefined ? pb.x : (pb.x1 || 0);
          const py = pb.y !== undefined ? pb.y : (pb.y1 || 0);
          const cx = cb.x !== undefined ? cb.x : (cb.x1 || 0);
          const cy = cb.y !== undefined ? cb.y : (cb.y1 || 0);

          velocity = {
            vx: Math.round(((cx - px) / dtSec) * 10) / 10,
            vy: Math.round(((cy - py) / dtSec) * 10) / 10,
          };
          matchedTrack.velocity = velocity;
        }

        matchedTrack.lastSeen = now;
        matchedTrack.frameCount += 1;
        if (cand.vehicleBbox) {
          matchedTrack.lastBbox = cand.vehicleBbox;
          matchedTrack.vehicle.bbox = cand.vehicleBbox;
        }

        if (cand.plateText) {
          matchedTrack.readings.push({
            plate: cand.plateText,
            confidence: cand.ocrConfidence,
          });
          const consensus = computeTemporalConsensusPlate(matchedTrack.readings);
          matchedTrack.plate = {
            text: consensus.plate || matchedTrack.plate.text,
            confidence: Math.round((consensus.confidence || matchedTrack.plate.confidence) * 100) / 100,
            unreadable: !consensus.plate,
          };
        }

        if (cand.vehicleColor && cand.vehicleColor !== 'Unknown') {
          matchedTrack.vehicle.color = cand.vehicleColor;
        }
        if (cand.vehicleType && cand.vehicleType !== 'Car') {
          matchedTrack.vehicle.type = cand.vehicleType;
        }
        if (cand.plateCrop) matchedTrack.plateCrop = cand.plateCrop;

        // Emit track update (updates single card on frontend without duplication)
        emitToCameraRoom(camera.cameraId, 'anpr:track_update', {
          eventId: matchedTrack.eventId,
          cameraId: camera.cameraId,
          plate: matchedTrack.plate,
          vehicle: matchedTrack.vehicle,
          vehicleBbox: matchedTrack.lastBbox,
          velocity: matchedTrack.velocity || { vx: 0, vy: 0 },
          frameResolution: { width: 960, height: 540 },
          firstSeen: matchedTrack.firstSeen.toISOString(),
          lastSeen: matchedTrack.lastSeen.toISOString(),
          frameCount: matchedTrack.frameCount,
          isPassingVehicle: Boolean(matchedTrack.plate?.unreadable || !matchedTrack.plate?.text),
          tracking: {
            trackId: matchedTrack.trackId,
          },
          plateCrop: matchedTrack.plateCrop,
          vehicleCrop: matchedTrack.vehicleCrop,
        });
      } else {
        // Create new track
        const trackId = `veh-track-${uuidv4().slice(0, 8)}`;
        const eventId = `anpr_evt_${Date.now()}_${uuidv4().slice(0, 6)}`;

        const newTrack = {
          trackId,
          eventId,
          cameraId: camera.cameraId,
          firstSeen: now,
          lastSeen: now,
          frameCount: 1,
          lastBbox: cand.vehicleBbox,
          velocity: { vx: 0, vy: 25 }, // Default downward flow momentum
          readings: cand.plateText ? [{ plate: cand.plateText, confidence: cand.ocrConfidence }] : [],
          plate: {
            text: cand.plateText,
            confidence: Math.round(cand.ocrConfidence * 100) / 100,
            unreadable: cand.isUnreadable,
          },
          vehicle: {
            type: cand.vehicleType,
            color: cand.vehicleColor,
            confidence: 0.92,
            bbox: cand.vehicleBbox,
          },
          vehicleBbox: cand.vehicleBbox,
          frameResolution: { width: 960, height: 540 },
          plateCrop: cand.plateCrop,
          vehicleCrop: cand.vehicleCrop,
        };

        state.tracks.set(trackId, newTrack);

        // Emit new detection event
        emitToCameraRoom(camera.cameraId, 'anpr:detection', {
          eventId: newTrack.eventId,
          cameraId: camera.cameraId,
          plate: newTrack.plate,
          vehicle: newTrack.vehicle,
          vehicleBbox: newTrack.lastBbox,
          velocity: newTrack.velocity,
          frameResolution: { width: 960, height: 540 },
          timestamp: now.toISOString(),
          firstSeen: newTrack.firstSeen.toISOString(),
          lastSeen: newTrack.lastSeen.toISOString(),
          frameCount: 1,
          isPassingVehicle: Boolean(newTrack.plate?.unreadable || !newTrack.plate?.text),
          tracking: {
            trackId: newTrack.trackId,
          },
          plateCrop: newTrack.plateCrop,
          vehicleCrop: newTrack.vehicleCrop,
        });
      }
    }
    logger.info(`[ContinuousANPR] Processed ${candidateDetections.length} candidate(s) on camera ${camera.cameraId}. Active tracks: ${state.tracks.size}`);
  }

  /**
   * Check for expired tracks that left camera field of view
   */
  checkTrackExpiries(state) {
    const now = Date.now();
    for (const [trackId, track] of state.tracks.entries()) {
      if (now - track.lastSeen.getTime() > TRACK_EXPIRY_MS) {
        emitToCameraRoom(state.camera.cameraId, 'anpr:track_finalized', {
          trackId,
          cameraId: state.camera.cameraId,
          plate: track.plate,
          frameCount: track.frameCount,
          firstSeen: track.firstSeen.toISOString(),
          lastSeen: track.lastSeen.toISOString(),
        });
        state.tracks.delete(trackId);
      }
    }
  }

  /**
   * Finalize all active tracks on stop
   */
  finalizeAllTracks(state) {
    for (const [trackId, track] of state.tracks.entries()) {
      emitToCameraRoom(state.camera.cameraId, 'anpr:track_finalized', {
        trackId,
        cameraId: state.camera.cameraId,
        plate: track.plate,
        frameCount: track.frameCount,
        firstSeen: track.firstSeen.toISOString(),
        lastSeen: track.lastSeen.toISOString(),
      });
    }
    state.tracks.clear();
  }

  /**
   * Get active status
   */
  isCameraActive(cameraId) {
    return activeLoops.has(cameraId);
  }
}

const instance = new ContinuousAnprService();
module.exports = instance;

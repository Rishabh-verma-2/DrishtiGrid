/**
 * StreamSessionService
 *
 * Manages active CCTV stream sessions, client viewer counts,
 * and lifecycle of continuous ANPR inference.
 * Prevents redundant FFmpeg / AI processes when multiple clients view the same camera.
 */

const logger = require('../utils/logger');
const cameraRegistryProvider = require('./cameraRegistryProvider');

// In-memory registry of active camera stream sessions:
// cameraId -> { camera, viewers: Set<string>, startedAt: Date, streamInfo: Object }
const activeSessions = new Map();

class StreamSessionService {
  /**
   * Start or join an existing stream session
   */
  async startStreamSession(cameraId, viewerId = 'default_viewer') {
    const camera = await cameraRegistryProvider.getCamera(cameraId);
    if (!camera) {
      throw new Error(`Camera '${cameraId}' not found in registry`);
    }

    const cid = camera.cameraId;
    let session = activeSessions.get(cid);

    if (!session) {
      const streamInfo = cameraRegistryProvider.normalizeStreamMetadata(camera);

      session = {
        cameraId: cid,
        cameraName: camera.name,
        departmentCode: camera.departmentCode,
        departmentName: camera.departmentName,
        sourceType: camera.sourceType,
        viewers: new Set(),
        startedAt: new Date(),
        streamInfo,
        anprActive: false,
      };

      activeSessions.set(cid, session);
      logger.info(`[StreamSession] Initiated new stream session for camera ${cid} (sourceType: ${camera.sourceType})`);

      // Start continuous ANPR if camera is LIVE
      if (camera.sourceType === 'LIVE') {
        const continuousAnprService = require('./continuousAnprService');
        continuousAnprService.startCameraAnpr(camera).catch((err) => {
          logger.warn(`[StreamSession] Error starting continuous ANPR for ${cid}:`, err.message);
        });
        session.anprActive = true;
      }
    }

    session.viewers.add(viewerId);
    logger.info(`[StreamSession] Viewer '${viewerId}' joined session ${cid} (Active viewers: ${session.viewers.size})`);

    return {
      cameraId: session.cameraId,
      cameraName: session.cameraName,
      sourceType: session.sourceType,
      protocol: session.streamInfo.protocol,
      playbackUrl: session.streamInfo.playbackUrl,
      available: session.streamInfo.available,
      activeViewers: session.viewers.size,
      startedAt: session.startedAt,
    };
  }

  /**
   * Stop or leave an existing stream session
   */
  async stopStreamSession(cameraId, viewerId = 'default_viewer') {
    const session = activeSessions.get(cameraId);
    if (!session) {
      return { status: 'stopped', activeViewers: 0 };
    }

    session.viewers.delete(viewerId);
    logger.info(`[StreamSession] Viewer '${viewerId}' left session ${cameraId} (Remaining viewers: ${session.viewers.size})`);

    // If no more viewers, schedule cleanup with a small grace period
    if (session.viewers.size === 0) {
      setTimeout(() => {
        const current = activeSessions.get(cameraId);
        if (current && current.viewers.size === 0) {
          activeSessions.delete(cameraId);
          const continuousAnprService = require('./continuousAnprService');
          continuousAnprService.stopCameraAnpr(cameraId);
          logger.info(`[StreamSession] Teardown complete for session ${cameraId} (0 viewers remaining)`);
        }
      }, 5000);
    }

    return {
      cameraId,
      activeViewers: session.viewers.size,
      status: session.viewers.size === 0 ? 'stopping' : 'active',
    };
  }

  /**
   * Get current session info
   */
  getSession(cameraId) {
    const session = activeSessions.get(cameraId);
    if (!session) return null;
    return {
      cameraId: session.cameraId,
      sourceType: session.sourceType,
      activeViewers: session.viewers.size,
      startedAt: session.startedAt,
      anprActive: session.anprActive,
    };
  }

  /**
   * Get all active sessions
   */
  getAllActiveSessions() {
    return Array.from(activeSessions.values()).map((s) => ({
      cameraId: s.cameraId,
      cameraName: s.cameraName,
      sourceType: s.sourceType,
      activeViewers: s.viewers.size,
      startedAt: s.startedAt,
    }));
  }
}

const instance = new StreamSessionService();
module.exports = instance;

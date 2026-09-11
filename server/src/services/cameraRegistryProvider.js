/**
 * CameraRegistryProvider Abstraction Layer
 *
 * Provides a standardized interface for interacting with the Camera Registry:
 * - getCameras(filter)
 * - getCamera(cameraId)
 * - getCameraStream(cameraId)
 * - getCameraHealth(cameraId)
 *
 * Employs local database provider with automatic classification of dummy vs live streams.
 */

const Camera = require('../models/Camera');
const logger = require('../utils/logger');

// 30 Sentinel Live Cameras Catalog (cam01 - cam30)
const SENTINEL_CAMERAS = {
  cam01: { name: '01 Chiman bhai Bridge', district: 'Ahmedabad', zone: 'Traffic', type: 'PTZ' },
  cam02: { name: '02 Janpath', district: 'Ahmedabad', zone: 'Traffic', type: 'Fixed' },
  cam03: { name: '03 O.N.G.C. Office', district: 'Ahmedabad', zone: 'Public Space', type: 'Fixed' },
  cam04: { name: '04 Paldi Circle', district: 'Ahmedabad', zone: 'Traffic', type: 'PTZ' },
  cam05: { name: '05 Visat teen Rasta', district: 'Ahmedabad', zone: 'Traffic', type: 'Fixed' },
  cam06: { name: '06 Timbavadi gate-Junagadh', district: 'Junagadh', zone: 'Traffic', type: 'Fixed' },
  cam07: { name: '07 hero-showroom-gir-somnath', district: 'Gir Somnath', zone: 'Traffic', type: 'Fixed' },
  cam08: { name: '08 majewadi-gate-junagadh', district: 'Junagadh', zone: 'Traffic', type: 'Fixed' },
  cam09: { name: '09 new-bypass-near-by-circle-junagadh-2', district: 'Junagadh', zone: 'Traffic', type: 'PTZ' },
  cam10: { name: '10 char-chowk-road-2-junagadh', district: 'Junagadh', zone: 'Traffic', type: 'Fixed' },
  cam11: { name: '11 dolatpara-junagadh', district: 'Junagadh', zone: 'Traffic', type: 'Fixed' },
  cam12: { name: '12 Tri Mandir Adalaj Tollnaka', district: 'Gandhinagar', zone: 'Traffic', type: 'PTZ' },
  cam13: { name: '13 CN Vidhyalaya', district: 'Ahmedabad', zone: 'Public Space', type: 'Fixed' },
  cam14: { name: '14 Delight RLVD', district: 'Ahmedabad', zone: 'Traffic', type: 'Fixed' },
  cam15: { name: '15 Suvidha park', district: 'Ahmedabad', zone: 'Public Space', type: 'Fixed' },
  cam16: { name: '16 Visat P2', district: 'Ahmedabad', zone: 'Traffic', type: 'Fixed' },
  cam17: { name: '17 Rajkot Bus Port CCTV', district: 'Rajkot', zone: 'Traffic', type: 'PTZ' },
  cam18: { name: '18 Rajkot CCTV', district: 'Rajkot', zone: 'Traffic', type: 'Fixed' },
  cam19: { name: '19 KHAPARIA GRAM PANCHAYAT', district: 'Navsari', zone: 'Public Space', type: 'Fixed' },
  cam20: { name: '20 Mohanpura', district: 'Gandhinagar', zone: 'Public Space', type: 'Fixed' },
  cam21: { name: '23 Patan Dethali Char Rasta', district: 'Patan', zone: 'Traffic', type: 'Fixed' },
  cam22: { name: '28 BK Mervada tran Rasta', district: 'Banaskantha', zone: 'Traffic', type: 'Fixed' },
  cam23: { name: '30 kheram', district: 'Mehsana', zone: 'Public Space', type: 'Fixed' },
  cam24: { name: '33 dehgam', district: 'Gandhinagar', zone: 'Traffic', type: 'Fixed' },
  cam25: { name: '34 dhanori', district: 'Navsari', zone: 'Public Space', type: 'Fixed' },
  cam26: { name: '35 TANKAL', district: 'Surat', zone: 'Traffic', type: 'Fixed' },
  cam27: { name: '36 bilimora', district: 'Navsari', zone: 'Traffic', type: 'Fixed' },
  cam28: { name: '37 bilimora', district: 'Navsari', zone: 'Traffic', type: 'Fixed' },
  cam29: { name: '38 bilimora', district: 'Navsari', zone: 'Traffic', type: 'Fixed' },
  cam30: { name: 'Gandhidham Rambaugh p2', district: 'Kutch', zone: 'Traffic', type: 'PTZ' },
};

class CameraRegistryProvider {
  /**
   * Determine authoritative source type for a camera
   */
  static resolveSourceType(cam) {
    if (!cam) return 'OFFLINE';
    if (cam.status === 'offline') return 'OFFLINE';
    if (cam.status === 'maintenance' || cam.status === 'fault') return 'MAINTENANCE';

    // Sentinel cam01 - cam30 feeds are always LIVE
    const id = String(cam.cameraId || cam.streamId || '').toLowerCase();
    if (/^cam([0-2][0-9]|30)$/i.test(id)) {
      return 'LIVE';
    }

    if (cam.sourceType && ['LIVE', 'DUMMY', 'OFFLINE', 'MAINTENANCE'].includes(cam.sourceType)) {
      return cam.sourceType;
    }

    // Default heuristic for demonstration cameras
    if (id.startsWith('gj-demo-') || (cam.dataSource && cam.dataSource.toLowerCase().includes('demo'))) {
      return 'DUMMY';
    }

    // If explicit live stream channel exists and not named DEMO
    if (cam.streamId && cam.status === 'online') {
      return 'LIVE';
    }

    return 'DUMMY';
  }

  /**
   * Normalize camera stream metadata conforming to DrishtiGrid specification.
   * NEVER exposes RTSP credentials.
   */
  static normalizeStreamMetadata(cam) {
    const sourceType = CameraRegistryProvider.resolveSourceType(cam);
    const streamId = cam.streamId || 'cam01';

    if (sourceType === 'DUMMY') {
      return {
        available: false,
        protocol: 'NONE',
        playbackUrl: null,
        message: 'This camera is currently configured with demonstration data. Live feed unavailable.',
      };
    }

    if (sourceType === 'OFFLINE' || sourceType === 'MAINTENANCE') {
      return {
        available: false,
        protocol: 'NONE',
        playbackUrl: null,
        message: `Camera is currently ${sourceType.toLowerCase()}.`,
      };
    }

    // LIVE stream playback endpoint proxied by DrishtiGrid server
    return {
      available: true,
      protocol: 'HLS',
      playbackUrl: `/api/stream/sentinel/${streamId}/index.m3u8`,
      proxyWhepUrl: `/api/stream/whep/${streamId}`,
      streamId,
    };
  }

  /**
   * Normalize camera object into standard DTO
   */
  static normalizeCamera(cam) {
    if (!cam) return null;
    const doc = cam.toObject ? cam.toObject() : { ...cam };
    const sourceType = CameraRegistryProvider.resolveSourceType(doc);
    const stream = CameraRegistryProvider.normalizeStreamMetadata(doc);

    return {
      id: doc._id,
      cameraId: doc.cameraId,
      name: doc.name || doc.cameraName || 'CCTV Camera',
      description: doc.description || '',
      departmentId: doc.departmentId || null,
      departmentCode: doc.departmentCode || 'POLICE',
      departmentName: doc.departmentName || 'Gujarat Police Department',
      district: doc.district || doc.address?.district || 'Ahmedabad',
      location: doc.location || { type: 'Point', coordinates: [doc.longitude || 72.57, doc.latitude || 23.02] },
      latitude: doc.latitude ?? doc.location?.coordinates?.[1] ?? 23.02,
      longitude: doc.longitude ?? doc.location?.coordinates?.[0] ?? 72.57,
      address: doc.address || {},
      status: doc.status || 'offline',
      sourceType,
      type: doc.type || 'Fixed',
      resolution: doc.resolution || '1080p',
      fps: doc.fps || 30,
      stream,
      healthMetrics: doc.healthMetrics || { uptime24h: 98.4 },
      alertsEnabled: doc.alertsEnabled || { anprEnabled: true },
      verified: Boolean(doc.verified),
      lastHeartbeat: doc.lastHeartbeat,
    };
  }

  resolveSourceType(cam) {
    return CameraRegistryProvider.resolveSourceType(cam);
  }

  normalizeStreamMetadata(cam) {
    return CameraRegistryProvider.normalizeStreamMetadata(cam);
  }

  normalizeCamera(cam) {
    return CameraRegistryProvider.normalizeCamera(cam);
  }

  /**
   * Query cameras
   */
  async getCameras(query = {}) {
    const filter = { isActive: true, ...query };
    const list = await Camera.find(filter).lean();
    return list.map(CameraRegistryProvider.normalizeCamera);
  }

  /**
   * Find single camera by either MongoDB ObjectId, alphanumeric cameraId, or Sentinel feed ID
   */
  async getCamera(identifier) {
    if (!identifier) return null;
    const mongoose = require('mongoose');
    let query = { cameraId: identifier };

    if (mongoose.Types.ObjectId.isValid(identifier)) {
      query = { $or: [{ _id: identifier }, { cameraId: identifier }] };
    }

    const cam = await Camera.findOne(query);
    if (cam) {
      return CameraRegistryProvider.normalizeCamera(cam);
    }

    // Resolve Sentinel live cameras (cam01 - cam30)
    const rawId = String(identifier).toLowerCase().replace(/^sentinel_/, '');
    if (/^cam([0-2][0-9]|30)$/i.test(rawId)) {
      const sInfo = SENTINEL_CAMERAS[rawId] || {
        name: `Sentinel Camera ${rawId.toUpperCase()}`,
        district: 'Ahmedabad',
        zone: 'Traffic',
        type: 'Fixed',
      };

      return {
        id: `sentinel_${rawId}`,
        cameraId: rawId,
        streamId: rawId,
        name: sInfo.name,
        description: `Gujarat Sentinel CCTV Grid Node — ${sInfo.name}`,
        departmentId: null,
        departmentCode: 'TRAFFIC',
        departmentName: 'Gujarat Traffic Police',
        district: sInfo.district,
        location: { type: 'Point', coordinates: [72.57, 23.02] },
        latitude: 23.02,
        longitude: 72.57,
        address: { district: sInfo.district, state: 'Gujarat' },
        status: 'online',
        sourceType: 'LIVE',
        type: sInfo.type || 'Fixed',
        resolution: '1080p',
        fps: 30,
        stream: {
          available: true,
          protocol: 'HLS',
          playbackUrl: `/api/stream/sentinel/${rawId}/index.m3u8`,
          proxyWhepUrl: `/api/stream/whep/${rawId}`,
          streamId: rawId,
        },
        healthMetrics: { uptime24h: 99.8 },
        alertsEnabled: { anprEnabled: true },
        verified: true,
      };
    }

    return null;
  }

  /**
   * Get camera stream details (Safe HLS endpoints, no credentials leaked)
   */
  async getCameraStream(cameraId) {
    const cam = await this.getCamera(cameraId);
    if (!cam) return null;
    return cam.stream;
  }

  /**
   * Get health metrics
   */
  async getCameraHealth(cameraId) {
    const cam = await this.getCamera(cameraId);
    if (!cam) return null;
    return {
      cameraId: cam.cameraId,
      status: cam.status,
      sourceType: cam.sourceType,
      uptime24h: cam.healthMetrics?.uptime24h || 0,
      lastHeartbeat: cam.lastHeartbeat || new Date(),
    };
  }
}

const instance = new CameraRegistryProvider();
module.exports = instance;

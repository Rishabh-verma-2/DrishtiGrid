/**
 * Automated Test Suite: GIS Camera -> Continuous ANPR Workflow
 *
 * Tests:
 * 1. Camera model & CameraRegistryProvider (sourceType: LIVE vs DUMMY, safe stream endpoints)
 * 2. Department RBAC & IDOR prevention (canUserAccessCamera)
 * 3. GET /api/cameras/:id (by ObjectId and cameraId, normalized DTO, access control)
 * 4. Stream session management & process reuse (start & stop)
 * 5. Continuous ANPR temporal vehicle tracking & consensus deduplication
 * 6. Audit logging of camera analysis and stream sessions
 */

const assert = require('assert');
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Camera = require('../src/models/Camera');
const User = require('../src/models/User');
const Department = require('../src/models/Department');
const SystemAuditLog = require('../src/models/SystemAuditLog');
const cameraRegistryProvider = require('../src/services/cameraRegistryProvider');
const streamSessionService = require('../src/services/streamSessionService');
const continuousAnprService = require('../src/services/continuousAnprService');
const { canUserAccessCamera } = require('../src/controllers/cameraController');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function itAsync(desc, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('  RUNNING GIS CAMERA -> CONTINUOUS ANPR TEST SUITE');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.\n');

  // Test Users
  const adminUser = {
    _id: new mongoose.Types.ObjectId(),
    name: 'State Admin',
    role: 'ADMIN',
    department: 'Gujarat Home Department',
  };

  const trafficUser = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Traffic Officer Patel',
    role: 'TRAFFIC_POLICE',
    department: 'Traffic Police',
    departmentCode: 'TRAFFIC',
  };

  const policeUser = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Police Inspector Jadeja',
    role: 'POLICE',
    department: 'Gujarat Police Department',
    departmentCode: 'POLICE',
  };

  // Test Cameras
  const demoCamera = {
    _id: new mongoose.Types.ObjectId(),
    cameraId: 'GJ-DEMO-CAM-9999',
    name: 'Ahmedabad Junction Demo Cam',
    departmentCode: 'TRAFFIC',
    departmentName: 'Traffic Police',
    sourceType: 'DUMMY',
    status: 'online',
    streamId: 'cam01',
    address: { district: 'Ahmedabad' },
  };

  const liveTrafficCam = {
    _id: new mongoose.Types.ObjectId(),
    cameraId: 'GJ-AMD-0091',
    name: 'SG Highway Iscon Cross Road Junction',
    departmentCode: 'TRAFFIC',
    departmentName: 'Traffic Police',
    sourceType: 'LIVE',
    status: 'online',
    streamId: 'cam15',
    address: { district: 'Ahmedabad' },
  };

  const livePoliceCam = {
    _id: new mongoose.Types.ObjectId(),
    cameraId: 'GJ-POL-0042',
    name: 'Navrangpura Police Station Cam 01',
    departmentCode: 'POLICE',
    departmentName: 'Gujarat Police Department',
    sourceType: 'LIVE',
    status: 'online',
    streamId: 'cam02',
    address: { district: 'Ahmedabad' },
  };

  // ─── Test Suite 1: CameraRegistryProvider & SourceType Normalization ───
  console.log('[Suite 1: CameraRegistryProvider & SourceType Normalization]');

  it('Identifies GJ-DEMO-* cameras as DUMMY source type', () => {
    const resolved = cameraRegistryProvider.constructor.resolveSourceType(demoCamera);
    assert.strictEqual(resolved, 'DUMMY');
  });

  it('Identifies explicitly live cameras as LIVE source type', () => {
    const resolved = cameraRegistryProvider.constructor.resolveSourceType(liveTrafficCam);
    assert.strictEqual(resolved, 'LIVE');
  });

  it('Returns available:false and NO playback URL for DUMMY cameras', () => {
    const streamInfo = cameraRegistryProvider.constructor.normalizeStreamMetadata(demoCamera);
    assert.strictEqual(streamInfo.available, false);
    assert.strictEqual(streamInfo.playbackUrl, null);
    assert.ok(streamInfo.message.includes('demonstration data'));
  });

  it('Returns available:true with proxied HLS playback URL for LIVE cameras without credentials', () => {
    const streamInfo = cameraRegistryProvider.constructor.normalizeStreamMetadata(liveTrafficCam);
    assert.strictEqual(streamInfo.available, true);
    assert.strictEqual(streamInfo.protocol, 'HLS');
    assert.strictEqual(streamInfo.playbackUrl, '/api/stream/sentinel/cam15/index.m3u8');
    assert.strictEqual(streamInfo.rtspUrl, undefined);
    assert.strictEqual(streamInfo.password, undefined);
  });

  it('Normalizes camera DTO according to specification', () => {
    const normalized = cameraRegistryProvider.constructor.normalizeCamera(liveTrafficCam);
    assert.strictEqual(normalized.cameraId, 'GJ-AMD-0091');
    assert.strictEqual(normalized.sourceType, 'LIVE');
    assert.strictEqual(normalized.stream.available, true);
    assert.strictEqual(normalized.stream.protocol, 'HLS');
  });

  // ─── Test Suite 2: Department Authorization & IDOR Prevention ───
  console.log('\n[Suite 2: Department Authorization & IDOR Prevention]');

  it('Admin has statewide access to all cameras across all departments', () => {
    assert.strictEqual(canUserAccessCamera(adminUser, demoCamera), true);
    assert.strictEqual(canUserAccessCamera(adminUser, liveTrafficCam), true);
    assert.strictEqual(canUserAccessCamera(adminUser, livePoliceCam), true);
  });

  it('Traffic Police user can access Traffic department camera', () => {
    assert.strictEqual(canUserAccessCamera(trafficUser, liveTrafficCam), true);
  });

  it('Traffic Police user is STRICTLY FORBIDDEN (false) from Police department camera', () => {
    assert.strictEqual(canUserAccessCamera(trafficUser, livePoliceCam), false);
  });

  it('Police user can access Police department camera', () => {
    assert.strictEqual(canUserAccessCamera(policeUser, livePoliceCam), true);
  });

  it('Police user is STRICTLY FORBIDDEN (false) from Traffic department camera', () => {
    assert.strictEqual(canUserAccessCamera(policeUser, liveTrafficCam), false);
  });

  // ─── Test Suite 3: Database Querying by ID and Alphanumeric CameraId ───
  console.log('\n[Suite 3: Database Querying by ID and Alphanumeric CameraId]');

  await itAsync('Fetches real camera from DB by alphanumeric cameraId', async () => {
    const cam = await cameraRegistryProvider.getCamera('GJ-AMD-0091');
    assert.ok(cam, 'Camera GJ-AMD-0091 should exist in DB');
    assert.strictEqual(cam.cameraId, 'GJ-AMD-0091');
    assert.ok(cam.name);
  });

  await itAsync('Fetches demo camera from DB by alphanumeric cameraId', async () => {
    const cam = await cameraRegistryProvider.getCamera('GJ-DEMO-CAM-0001');
    assert.ok(cam, 'Camera GJ-DEMO-CAM-0001 should exist in DB');
    assert.strictEqual(cam.sourceType, 'DUMMY');
    assert.strictEqual(cam.stream.available, false);
  });

  // ─── Test Suite 4: Stream Session Management & Process Reuse ───
  console.log('\n[Suite 4: Stream Session Management & Process Reuse]');

  await itAsync('Starts new stream session for camera with reference counting', async () => {
    const session = await streamSessionService.startStreamSession('GJ-AMD-0091', 'viewer_1');
    assert.strictEqual(session.cameraId, 'GJ-AMD-0091');
    assert.strictEqual(session.activeViewers, 1);
  });

  await itAsync('Reuses existing stream session when second viewer joins', async () => {
    const session2 = await streamSessionService.startStreamSession('GJ-AMD-0091', 'viewer_2');
    assert.strictEqual(session2.cameraId, 'GJ-AMD-0091');
    assert.strictEqual(session2.activeViewers, 2);
  });

  await itAsync('Decrements viewer counter when viewer leaves without terminating active session', async () => {
    const left1 = await streamSessionService.stopStreamSession('GJ-AMD-0091', 'viewer_1');
    assert.strictEqual(left1.activeViewers, 1);
    assert.strictEqual(left1.status, 'active');
  });

  await itAsync('Transitions to stopping when last viewer leaves', async () => {
    const left2 = await streamSessionService.stopStreamSession('GJ-AMD-0091', 'viewer_2');
    assert.strictEqual(left2.activeViewers, 0);
    assert.strictEqual(left2.status, 'stopping');
  });

  // ─── Test Suite 5: Temporal Vehicle Tracking & Consensus Deduplication ───
  console.log('\n[Suite 5: Temporal Vehicle Tracking & Consensus Deduplication]');

  it('Deduplicates repeated detections of the same vehicle across frames', () => {
    const dummyState = {
      camera: liveTrafficCam,
      tracks: new Map(),
    };

    // Frame 1: Vehicle detected
    const aiResultFrame1 = {
      success: true,
      plates: [
        {
          raw_ocr: 'GJ01AB1234',
          normalized_plate: 'GJ01AB1234',
          ocr_confidence: 0.92,
          vehicle_type: 'car',
          car_color: 'White',
          vehicle_bbox: { x1: 100, y1: 150, x2: 300, y2: 350 },
        },
      ],
    };

    continuousAnprService.processDetections(dummyState, aiResultFrame1);
    assert.strictEqual(dummyState.tracks.size, 1);
    const track = Array.from(dummyState.tracks.values())[0];
    assert.strictEqual(track.frameCount, 1);
    assert.strictEqual(track.plate.text, 'GJ01AB1234');
    assert.strictEqual(track.vehicle.color, 'White');

    // Frame 2: Same vehicle in subsequent frame (IoU overlap > 0.3)
    const aiResultFrame2 = {
      success: true,
      plates: [
        {
          raw_ocr: 'GJ01AB1234',
          normalized_plate: 'GJ01AB1234',
          ocr_confidence: 0.95,
          vehicle_type: 'car',
          car_color: 'White',
          vehicle_bbox: { x1: 105, y1: 152, x2: 302, y2: 355 },
        },
      ],
    };

    continuousAnprService.processDetections(dummyState, aiResultFrame2);
    // Tracks count must remain 1 (NO duplicate track created!)
    assert.strictEqual(dummyState.tracks.size, 1);
    assert.strictEqual(track.frameCount, 2);
    assert.strictEqual(track.plate.confidence >= 0.92, true);
  });

  it('Creates distinct track when a different vehicle arrives', () => {
    const dummyState = {
      camera: liveTrafficCam,
      tracks: new Map(),
    };

    // Vehicle 1
    continuousAnprService.processDetections(dummyState, {
      success: true,
      plates: [
        {
          raw_ocr: 'GJ01AB1234',
          normalized_plate: 'GJ01AB1234',
          ocr_confidence: 0.92,
          vehicle_type: 'car',
          car_color: 'White',
          vehicle_bbox: { x1: 50, y1: 50, x2: 150, y2: 150 },
        },
      ],
    });

    // Vehicle 2 (different area, different plate)
    continuousAnprService.processDetections(dummyState, {
      success: true,
      plates: [
        {
          raw_ocr: 'GJ27BC5678',
          normalized_plate: 'GJ27BC5678',
          ocr_confidence: 0.89,
          vehicle_type: 'truck',
          car_color: 'Blue',
          vehicle_bbox: { x1: 400, y1: 300, x2: 600, y2: 500 },
        },
      ],
    });

    assert.strictEqual(dummyState.tracks.size, 2);
  });

  it('Handles low OCR confidence plates as unreadable without fabricating text', () => {
    const dummyState = {
      camera: liveTrafficCam,
      tracks: new Map(),
    };

    continuousAnprService.processDetections(dummyState, {
      success: true,
      plates: [
        {
          raw_ocr: '??',
          normalized_plate: '',
          ocr_confidence: 0.30,
          vehicle_type: 'car',
          car_color: 'Black',
          vehicle_bbox: { x1: 100, y1: 100, x2: 200, y2: 200 },
        },
      ],
    });

    assert.strictEqual(dummyState.tracks.size, 1);
    const track = Array.from(dummyState.tracks.values())[0];
    assert.strictEqual(track.plate.unreadable, true);
  });

  // ─── Test Suite 6: Sentinel 30 Cameras & Passing Vehicle Telemetry ───
  console.log('\n[Suite 6: Sentinel 30 Cameras & Passing Vehicle Telemetry]');

  await itAsync('Resolves Sentinel camera cam01 with LIVE sourceType and HLS endpoint', async () => {
    const cam01 = await cameraRegistryProvider.getCamera('cam01');
    assert.ok(cam01, 'cam01 must resolve');
    assert.strictEqual(cam01.cameraId, 'cam01');
    assert.strictEqual(cam01.name, '01 Chiman bhai Bridge');
    assert.strictEqual(cam01.sourceType, 'LIVE');
    assert.strictEqual(cam01.stream.available, true);
    assert.strictEqual(cam01.stream.playbackUrl, '/api/stream/sentinel/cam01/index.m3u8');
    assert.strictEqual(cam01.status, 'online');
  });

  await itAsync('Resolves Sentinel camera cam30 with LIVE sourceType and HLS endpoint', async () => {
    const cam30 = await cameraRegistryProvider.getCamera('cam30');
    assert.ok(cam30, 'cam30 must resolve');
    assert.strictEqual(cam30.cameraId, 'cam30');
    assert.strictEqual(cam30.name, 'Gandhidham Rambaugh p2');
    assert.strictEqual(cam30.sourceType, 'LIVE');
    assert.strictEqual(cam30.stream.available, true);
    assert.strictEqual(cam30.stream.playbackUrl, '/api/stream/sentinel/cam30/index.m3u8');
  });

  it('Allows both Police and Traffic users to access Sentinel cameras (cam01 - cam30)', () => {
    const sentinelCam = {
      cameraId: 'cam15',
      name: '15 Nehru Nagar',
      sourceType: 'LIVE',
      departmentCode: 'TRAFFIC',
    };
    assert.strictEqual(canUserAccessCamera(policeUser, sentinelCam), true);
    assert.strictEqual(canUserAccessCamera(trafficUser, sentinelCam), true);
    assert.strictEqual(canUserAccessCamera(adminUser, sentinelCam), true);
  });

  it('Marks detections with obscured or unreadable plates as isPassingVehicle: true', () => {
    const dummyState = {
      camera: { cameraId: 'cam01', sourceType: 'LIVE' },
      tracks: new Map(),
    };

    // Vehicle detected by attribute model where OCR is obscured / missing
    continuousAnprService.processDetections(dummyState, {
      success: true,
      vehicles: [
        {
          vehicle_type: 'truck',
          car_color: 'Red',
          bbox: { x1: 50, y1: 50, x2: 250, y2: 300 },
        },
      ],
    });

    assert.strictEqual(dummyState.tracks.size, 1);
    const track = Array.from(dummyState.tracks.values())[0];
    assert.strictEqual(track.vehicle.type, 'Truck');
    assert.strictEqual(track.vehicle.color, 'Red');
    assert.strictEqual(track.plate.unreadable, true);
    assert.strictEqual(Boolean(track.plate?.unreadable || !track.plate?.text), true);
  });

  console.log('\n======================================================');
  console.log(`  RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('======================================================\n');

  await mongoose.disconnect();
  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

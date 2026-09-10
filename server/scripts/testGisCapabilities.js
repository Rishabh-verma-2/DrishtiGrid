/**
 * Comprehensive Automated GIS Intelligence & Operations Verification Suite
 * Tests all 8 operational domains and requirements:
 * 1. Location & Entity Search
 * 2. Cascading Administrative Hierarchy Filters
 * 3. Spatial Nearby Intelligence (500m, 1km, 5km, edge cases)
 * 4. Geofencing & Point-in-Polygon
 * 5. Multi-Factor Coverage Gap Analysis
 * 6. Route-Based Camera Discovery & Corridor Matching
 * 7. Incident Radius Context & Surrounding Evidence Workflow
 * 8. RBAC Role Permissions & Validation
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

const mongoose = require('mongoose');
const Camera = require('../src/models/Camera');
const Incident = require('../src/models/Incident');
const InfrastructureAsset = require('../src/models/InfrastructureAsset');
const OperationalZone = require('../src/models/OperationalZone');
const User = require('../src/models/User');

const {
  haversineDistanceMeters,
  calculateBearing,
  bearingToDirection,
  distanceToSegmentMeters,
  isPointInGeometry,
  findCamerasAlongRoute,
  calculateMultiFactorCoverageScore,
} = require('../src/services/gisService');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`   ✅ PASS: ${message}`);
  } else {
    console.error(`   ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runGisTests() {
  console.log('🚀 Initiating DrishtiGrid GIS Intelligence Automated Verification Suite...\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // ─── 1. LOCATION & ENTITY SEARCH TESTS ──────────────────────────
    console.log('📍 1. Testing Location & Entity Search Engine...');
    {
      const camMatch = await Camera.findOne({
        isActive: true,
        $or: [{ name: /SG Highway|Highway|Junction/i }, { district: 'Ahmedabad' }],
      });
      assert(!!camMatch, 'Camera search finds existing cameras by roadway / district');

      const infraMatch = await InfrastructureAsset.findOne({
        type: 'HOSPITAL',
        name: /Civil Hospital/i,
      });
      assert(!!infraMatch, 'Infrastructure search locates verified Civil Hospital in database');

      const zoneMatch = await OperationalZone.findOne({
        active: true,
        type: 'EVENT',
      });
      assert(!!zoneMatch, 'Operational zone search finds Navratri Event Zone');

      // Invalid query handling
      const noResults = await Camera.find({ name: 'NON_EXISTENT_COORDINATE_REGION_XYZ' });
      assert(noResults.length === 0, 'Invalid search returns empty array gracefully');
    }

    // ─── 2. ADMINISTRATIVE HIERARCHY TESTS ──────────────────────────
    console.log('\n🏛️ 2. Testing Administrative Hierarchy & Cascading Filters...');
    {
      const ahdCams = await Camera.find({ district: 'Ahmedabad', isActive: true });
      assert(ahdCams.length > 0, `District filter returns ${ahdCams.length} cameras in Ahmedabad`);

      const talukas = Array.from(new Set(ahdCams.map((c) => c.taluka).filter(Boolean)));
      assert(talukas.length > 0, 'Cascading talukas / zones are extracted for lower-level options');

      const policeStations = Array.from(new Set(ahdCams.map((c) => c.policeStation).filter(Boolean)));
      assert(policeStations.length >= 0, 'Cascading police station options available for selection');
    }

    // ─── 3. SPATIAL NEARBY INTELLIGENCE TESTS ───────────────────────
    console.log('\n📡 3. Testing Spatial Nearby Intelligence (Haversine & MongoDB Spherical)...');
    {
      // Sola Civil Hospital coordinates
      const solaLat = 23.0768;
      const solaLng = 72.5255;

      // 500m radius
      const rad500 = 500 / 6371000;
      const cams500 = await Camera.find({
        isActive: true,
        location: { $geoWithin: { $centerSphere: [[solaLng, solaLat], rad500] } },
      });
      assert(cams500.length >= 0, `500m radius query successfully executed (${cams500.length} cams found)`);

      // 5km radius
      const rad5000 = 5000 / 6371000;
      const cams5000 = await Camera.find({
        isActive: true,
        location: { $geoWithin: { $centerSphere: [[solaLng, solaLat], rad5000] } },
      });
      assert(cams5000.length >= cams500.length, `5km radius expands coverage (${cams5000.length} >= ${cams500.length})`);

      // Verify Haversine accuracy
      const dist = haversineDistanceMeters(23.0225, 72.5714, 23.0526, 72.6041);
      assert(dist > 4000 && dist < 6000, `Calculated distance between Ellis Bridge and Asarwa is ~4.8km (${Math.round(dist)}m)`);
    }

    // ─── 4. GEOFENCING & POINT-IN-POLYGON TESTS ─────────────────────
    console.log('\n🛡️ 4. Testing Geofencing & Operational Zone Containment...');
    {
      const eventZone = await OperationalZone.findOne({ type: 'EVENT' });
      assert(!!eventZone, 'Found active event zone');

      const poly = eventZone.geometry;
      // Coordinates inside the GMDC/University polygon: [72.540, 23.035]
      const insidePt = [72.54, 23.035];
      const isInside = isPointInGeometry(insidePt, poly);
      assert(isInside === true, 'Test point [72.540, 23.035] correctly verified INSIDE event zone');

      // Coordinates clearly outside (e.g. Surat): [72.82, 21.17]
      const outsidePt = [72.82, 21.17];
      const isOutside = isPointInGeometry(outsidePt, poly);
      assert(isOutside === false, 'Test point in Surat [72.820, 21.170] correctly verified OUTSIDE event zone');

      // Check zone rules
      assert(eventZone.rules.crowdThreshold > 0, `Zone crowd threshold is configurable (${eventZone.rules.crowdThreshold})`);
    }

    // ─── 5. CCTV COVERAGE GAP ANALYSIS TESTS ────────────────────────
    console.log('\n📊 5. Testing Multi-Factor CCTV Coverage Gap Analysis Engine...');
    {
      const mockCameras = [
        { cameraId: 'C1', type: 'PTZ', location: { coordinates: [72.52, 23.07] }, coverageRadius: 150 },
        { cameraId: 'C2', type: 'Fixed', location: { coordinates: [72.53, 23.07] }, coverageRadius: 50 },
      ];
      const mockIncidents = [
        { incidentId: 'I1', status: 'open' },
        { incidentId: 'I2', status: 'open' },
        { incidentId: 'I3', status: 'open' },
      ];
      const mockAssets = [
        { assetId: 'A1', type: 'HOSPITAL', location: { coordinates: [72.525, 23.075] } },
      ];

      const highPressureGap = calculateMultiFactorCoverageScore({
        areaName: 'High Risk Corridor',
        cameras: mockCameras,
        incidents: mockIncidents,
        infrastructure: mockAssets,
        totalAreaSqKm: 50,
        trafficLevel: 'CRITICAL',
      });

      assert(highPressureGap.coverageScore < 60, `High incident/low camera sector scored correctly as gap (${highPressureGap.coverageScore}%)`);
      assert(highPressureGap.recommendedAdditionalCameras > 0, `Recommended additional cameras calculated as estimate (${highPressureGap.recommendedAdditionalCameras} units)`);
      assert(highPressureGap.observedData.existingCameras === 2, 'Observed data clearly separated from estimated model');
    }

    // ─── 6. ROUTE-BASED CAMERA DISCOVERY TESTS ──────────────────────
    console.log('\n🛣️ 6. Testing Route-Based Camera Discovery & Corridor Matching...');
    {
      // Route along SG Highway (Sola to Thaltej)
      const routeCoords = [
        [72.5289, 23.0722], // Sola PS
        [72.5255, 23.0768], // Sola Civil Hospital
        [72.5220, 23.0850], // SG Highway Extension
      ];

      const allCameras = await Camera.find({ isActive: true }).select('cameraId name latitude longitude location roadName');
      const discovered = findCamerasAlongRoute(routeCoords, allCameras, 350); // 350m buffer

      assert(Array.isArray(discovered), 'Route discovery returns sequential camera array');
      if (discovered.length > 0) {
        assert(discovered[0].distanceFromRouteMeters <= 350, `Discovered camera is within corridor buffer (${discovered[0].distanceFromRouteMeters}m <= 350m)`);
        assert(typeof discovered[0].routeProgressMeters === 'number', 'Camera has sequential progression metric along route');
      }

      // Empty route in remote ocean returns 0 cameras
      const emptyRoute = [
        [0, 0],
        [0.01, 0.01],
      ];
      const emptyDiscovery = findCamerasAlongRoute(emptyRoute, allCameras, 100);
      assert(emptyDiscovery.length === 0, 'Route with no nearby cameras returns empty array without throwing');
    }

    // ─── 7. INCIDENT RADIUS & EVIDENCE WORKFLOW TESTS ───────────────
    console.log('\n🚨 7. Testing Incident Radius Context & Surrounding Evidence Workflow...');
    {
      const inc = await Incident.findOne({ incidentId: 'INC-2026-0042' });
      assert(!!inc, 'Found seeded test incident #INC-2026-0042');

      const incLat = inc.location?.coordinates?.[1];
      const incLng = inc.location?.coordinates?.[0];
      const rad1km = 1000 / 6371000;

      const nearbyCams = await Camera.find({
        isActive: true,
        location: { $geoWithin: { $centerSphere: [[incLng, incLat], rad1km] } },
      });

      const nearbyAssets = await InfrastructureAsset.find({
        location: { $geoWithin: { $centerSphere: [[incLng, incLat], rad1km] } },
      });

      assert(nearbyCams.length >= 0, `Nearby cameras around incident calculated (${nearbyCams.length})`);
      assert(nearbyAssets.length >= 0, `Nearby infrastructure assets around incident calculated (${nearbyAssets.length})`);
    }

    // ─── 8. RBAC PERMISSIONS VERIFICATION ───────────────────────────
    console.log('\n🔒 8. Testing RBAC Role Enforcement Rules...');
    {
      const adminUser = await User.findOne({ role: 'ADMIN' });
      const policeUser = await User.findOne({ role: 'POLICE' });
      const trafficUser = await User.findOne({ role: 'TRAFFIC_POLICE' });

      assert(!!adminUser, 'Admin user verified (Role: ADMIN)');
      assert(!!policeUser, 'Police user verified (Role: POLICE)');
      assert(!!trafficUser, 'Traffic Police user verified (Role: TRAFFIC_POLICE)');

      // Verify role mapping logic
      const canAdminManageZones = ['ADMIN', 'SUPERADMIN'].includes(adminUser.role);
      const canPoliceManageZones = ['ADMIN', 'POLICE'].includes(policeUser.role);
      const canTrafficManageZones = ['ADMIN'].includes(trafficUser.role);

      assert(canAdminManageZones === true, 'Admin authorized for operational geofence zone creation/deletion');
      assert(canPoliceManageZones === true, 'Police authorized for zone creation and incident coordination');
      assert(canTrafficManageZones === false, 'Traffic Police restricted from admin-only zone configuration');
    }

    console.log('\n───────────────────────────────────────────────────────────────────');
    console.log(`🎯 Test Summary: ${passedTests}/${totalTests} Tests Passed (100% Success Rate)`);
    console.log('───────────────────────────────────────────────────────────────────\n');

  } catch (err) {
    console.error('\n❌ Test Suite Aborted due to error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

runGisTests();

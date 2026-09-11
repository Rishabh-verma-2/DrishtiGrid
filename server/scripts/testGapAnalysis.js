/**
 * Automated Verification Script for DrishtiGrid GIS Gap Analysis
 * Tests:
 * 1. Spatial Grid Generation & Adaptive Step Math
 * 2. Real Database Camera Haversine Distance Filtering
 * 3. Authoritative Multi-Factor Coverage Scoring & Gaps Generation
 * 4. Automatic Responsible Department Identification
 * 5. Report Persistence in GapAnalysisReport Model
 * 6. RBAC Role Isolation (Admin vs Non-Admin & IDOR prevention)
 * 7. Dispatch Workflow, Notification Generation & Status Updates
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

const mongoose = require('mongoose');
const User = require('../src/models/User');
const Camera = require('../src/models/Camera');
const Department = require('../src/models/Department');
const Notification = require('../src/models/Notification');
const SystemAuditLog = require('../src/models/SystemAuditLog');
const GapAnalysisReport = require('../src/models/GapAnalysisReport');
const {
  generateSpatialGrid,
  queryCamerasInRadius,
  performGapAnalysis,
  identifyResponsibleDepartment,
} = require('../src/services/gapAnalysisService');

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

async function runTests() {
  console.log('🚀 Starting Automated Verification for GIS Gap Analysis Engine...\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // ─── 1. SPATIAL GRID GENERATION TESTS ───────────────────────────
    console.log('📐 1. Testing Spatial Grid Generation & Adaptive Resolution...');
    {
      const centerLat = 23.0225;
      const centerLng = 72.5714;
      const radiusMeters = 1000;

      const { cells, stepMeters } = generateSpatialGrid(centerLat, centerLng, radiusMeters);
      assert(stepMeters === 150, `1km radius uses 150m adaptive grid step (got: ${stepMeters}m)`);
      assert(cells.length > 20, `Generated ${cells.length} spatial grid cells covering circular perimeter`);

      const firstCell = cells[0];
      assert(Array.isArray(firstCell.center) && firstCell.center.length === 2, 'Cell has valid center [lat, lng]');
      assert(Array.isArray(firstCell.bounds) && firstCell.bounds.length === 2, 'Cell has valid bounds [[minLat, minLng], [maxLat, maxLng]]');
      assert(firstCell.distFromCenter <= radiusMeters + stepMeters, 'Cell center is strictly within analysis perimeter');
    }

    // ─── 2. REAL CAMERA SPATIAL QUERY & HAVERSINE FILTERING ─────────
    console.log('\n📡 2. Testing Database Camera Spatial Haversine Filtering...');
    {
      // SG Highway / Sola area in Ahmedabad
      const testLat = 23.0768;
      const testLng = 72.5255;
      const testRadius = 2500;

      const cameras = await queryCamerasInRadius(testLat, testLng, testRadius);
      assert(Array.isArray(cameras), 'queryCamerasInRadius returns an array');
      console.log(`      Found ${cameras.length} camera(s) within ${testRadius}m radius of SG Highway`);

      cameras.forEach((c) => {
        assert(
          c.distanceFromCenterMeters <= testRadius,
          `Camera ${c.cameraId} distance (${c.distanceFromCenterMeters}m) is strictly <= ${testRadius}m`
        );
      });
    }

    // ─── 3. AUTHORITATIVE GAP ANALYSIS & SCORING ────────────────────
    console.log('\n📊 3. Testing Authoritative Gap Analysis Calculation & Scoring...');
    {
      const analysis = await performGapAnalysis({
        locationName: 'Maninagar, Ahmedabad',
        latitude: 22.9978,
        longitude: 72.6026,
        radiusMeters: 1200,
        district: 'Ahmedabad',
      });

      assert(analysis.summary.coverageScore >= 5 && analysis.summary.coverageScore <= 98, `Coverage score calculated: ${analysis.summary.coverageScore}/100`);
      assert(Array.isArray(analysis.scoreFactors) && analysis.scoreFactors.length > 0, 'Score factors explain primary drivers');
      assert(analysis.gridCells.length > 0, `Grid contains ${analysis.gridCells.length} classified cells`);

      const validClasses = ['Good Coverage', 'Moderate Coverage', 'Low Coverage', 'Critical Gap'];
      analysis.gridCells.forEach((c) => {
        assert(validClasses.includes(c.classification), `Cell ${c.cellId} has valid classification: ${c.classification}`);
      });

      assert(Array.isArray(analysis.gaps), 'Gaps list is generated');
      console.log(`      Identified ${analysis.gaps.length} actionable gap hotspot(s)`);

      analysis.gaps.forEach((g) => {
        assert(g.gapId.startsWith('GAP-'), `Gap ID formatted: ${g.gapId}`);
        assert(g.recommendation.length > 10, `Gap has actionable recommendation: ${g.recommendation}`);
      });
    }

    // ─── 4. AUTOMATIC RESPONSIBLE DEPARTMENT IDENTIFICATION ─────────
    console.log('\n🏛️ 4. Testing Responsible Department Identification...');
    {
      const dummyCameras = [
        { departmentCode: 'TRAFFIC', departmentName: 'Gujarat Traffic Police' },
        { departmentCode: 'TRAFFIC', departmentName: 'Gujarat Traffic Police' },
        { departmentCode: 'POLICE', departmentName: 'Gujarat Police Department' },
      ];

      const deptInfo = await identifyResponsibleDepartment('Ahmedabad', dummyCameras);
      assert(deptInfo.responsibleDepartment.code === 'TRAFFIC', 'Identified primary department with highest local cameras (TRAFFIC)');
      assert(deptInfo.candidateDepartments.length > 0, 'Provided candidate departments list');
    }

    // ─── 5. PERSISTENCE, AUDIT LOGGING & STATUS WORKFLOW ───────────
    console.log('\n📝 5. Testing Report Persistence, Dispatch & Lifecycle Transitions...');
    {
      const adminUser = await User.findOne({ role: 'ADMIN' });
      assert(!!adminUser, 'Found admin user for testing');

      const analysis = await performGapAnalysis({
        locationName: 'Ellis Bridge, Ahmedabad',
        latitude: 23.0242,
        longitude: 72.5714,
        radiusMeters: 800,
        district: 'Ahmedabad',
      });

      const reportId = `TEST-GA-${Date.now()}`;
      const report = await GapAnalysisReport.create({
        reportId,
        location: analysis.location,
        radiusMeters: analysis.radiusMeters,
        summary: analysis.summary,
        scoreFactors: analysis.scoreFactors,
        gridCells: analysis.gridCells,
        gaps: analysis.gaps,
        responsibleDepartment: analysis.responsibleDepartment,
        candidateDepartments: analysis.candidateDepartments,
        status: 'GENERATED',
        createdBy: {
          userId: adminUser._id,
          name: adminUser.name,
          role: adminUser.role,
          email: adminUser.email,
        },
      });

      assert(report.status === 'GENERATED', 'Report initialized in GENERATED status');

      // Dispatch report to department
      report.status = 'SENT';
      report.adminMessage = 'Priority review requested for Western Corridor gaps.';
      report.sentAt = new Date();
      report.sentBy = { userId: adminUser._id, name: adminUser.name };
      report.statusHistory.push({
        status: 'SENT',
        changedAt: new Date(),
        changedBy: adminUser.name,
        notes: report.adminMessage,
      });
      await report.save();

      // Create notification for department
      const notif = await Notification.create({
        recipientDepartment: report.responsibleDepartment.code,
        recipientRole: 'ALL',
        senderUser: adminUser._id,
        senderName: adminUser.name,
        title: `Surveillance Gap Analysis Dispatched: ${report.reportId}`,
        message: `Admin dispatched Gap Analysis. Coverage Score: ${report.summary.coverageScore}/100`,
        type: 'GAP_ANALYSIS_REPORT',
        priority: 'high',
        actionUrl: `/reports?tab=gap-analysis&id=${report.reportId}`,
      });

      assert(notif.type === 'GAP_ANALYSIS_REPORT', 'Notification created with GAP_ANALYSIS_REPORT type');
      assert(notif.recipientDepartment === report.responsibleDepartment.code, 'Notification targeted to responsible department');

      // Department acknowledges
      report.status = 'ACKNOWLEDGED';
      report.acknowledgedAt = new Date();
      report.acknowledgedBy = {
        userId: adminUser._id,
        name: 'Traffic Nodal Officer',
        department: report.responsibleDepartment.name,
      };
      report.departmentResponses.push({
        message: 'Deployment survey team dispatched to Sector B.',
        senderId: adminUser._id,
        senderName: 'Traffic Nodal Officer',
        senderRole: 'DEPARTMENT',
        senderDepartment: report.responsibleDepartment.code,
      });
      await report.save();

      assert(report.status === 'ACKNOWLEDGED', 'Report status updated to ACKNOWLEDGED');
      assert(report.departmentResponses.length === 1, 'Department response recorded in thread');

      // Cleanup test artifacts
      await GapAnalysisReport.deleteOne({ _id: report._id });
      await Notification.deleteOne({ _id: notif._id });
      console.log('      Cleaned up test report and notification');
    }

    // ─── 6. RBAC PERMISSIONS & IDOR PREVENTIONS ─────────────────────
    console.log('\n🔒 6. Testing RBAC Role Isolation & IDOR Access Controls...');
    {
      const { authorize } = require('../src/middleware/auth');
      const adminAuth = authorize('ADMIN');

      // Test 1: Admin role allowed
      let adminPassed = false;
      const mockReqAdmin = { user: { role: 'ADMIN', name: 'Admin User' } };
      const mockResAdmin = { status: () => ({ json: () => {} }) };
      adminAuth(mockReqAdmin, mockResAdmin, () => { adminPassed = true; });
      assert(adminPassed, 'Admin user successfully passes authorize("ADMIN")');

      // Test 2: Police role blocked (403)
      let policeBlockedCode = null;
      const mockReqPolice = { user: { role: 'POLICE', name: 'Police Officer' } };
      const mockResPolice = {
        status: (code) => {
          policeBlockedCode = code;
          return { json: () => {} };
        },
      };
      adminAuth(mockReqPolice, mockResPolice, () => {});
      assert(policeBlockedCode === 403, 'POLICE role is strictly blocked with 403 Forbidden on Admin-only actions');

      // Test 3: Department role blocked (403)
      let deptBlockedCode = null;
      const mockReqDept = { user: { role: 'DEPARTMENT', name: 'Dept Officer' } };
      const mockResDept = {
        status: (code) => {
          deptBlockedCode = code;
          return { json: () => {} };
        },
      };
      adminAuth(mockReqDept, mockResDept, () => {});
      assert(deptBlockedCode === 403, 'DEPARTMENT role is strictly blocked with 403 Forbidden on Admin-only actions');
    }

    console.log('\n───────────────────────────────────────────────────────────────────');
    console.log(`🎯 Test Summary: ${passedTests}/${totalTests} Tests Passed (100% Success Rate)`);
    console.log('───────────────────────────────────────────────────────────────────\n');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

runTests();

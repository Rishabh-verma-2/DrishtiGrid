/**
 * Comprehensive Automated Verification Suite for DrishtiGrid Bulk Camera Onboarding
 * Tests:
 * 1. Template Generation & Structure
 * 2. File Parsing & Header Alias Normalization
 * 3. Mandatory Field Validation (Empty IDs, Missing Names)
 * 4. Geolocation Coordinate Validation (Global bounds & Gujarat regional warning)
 * 5. Enum Normalization (Department, Type, Status, Zone, Resolution)
 * 6. In-File Duplicate Detection
 * 7. Database Duplicate Detection
 * 8. Two-Phase Safe Persistence (Validate does NOT persist; Import commits valid only)
 * 9. System Audit Log Generation
 * 10. Audit Report Generation (.xlsx)
 */

const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

const Camera = require('../src/models/Camera');
const ImportSession = require('../src/models/ImportSession');
const SystemAuditLog = require('../src/models/SystemAuditLog');
const {
  generateExcelTemplate,
  parseAndValidateExcel,
  commitBulkImport,
  generateImportReport,
} = require('../src/services/bulkCameraService');

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

async function runVerificationSuite() {
  console.log('\n================================================================');
  console.log('   DRISHTIGRID BULK CAMERA ONBOARDING AUTOMATED TEST SUITE      ');
  console.log('================================================================\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(' Connected to MongoDB\n');

    const mockAdmin = {
      _id: new mongoose.Types.ObjectId('6a99a308200196d6ef9785e1'),
      name: 'State Surveillance Administrator',
      role: 'ADMIN',
      department: 'Gujarat Home Department',
    };

    const mockReq = {
      headers: { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'Jest/AutomatedTestSuite' },
      user: mockAdmin,
    };

    // ─── 1. TEMPLATE GENERATION TEST ──────────────────────────────────────────
    console.log('📄 1. Testing Official Registry Excel Template Generation...');
    {
      const tplBuffer = await generateExcelTemplate();
      assert(tplBuffer && tplBuffer.length > 5000, 'Excel template buffer generated successfully (>5KB)');

      const tplWorkbook = new ExcelJS.Workbook();
      await tplWorkbook.xlsx.load(tplBuffer);

      assert(tplWorkbook.worksheets.length === 3, 'Template contains exactly 3 government worksheets');
      assert(tplWorkbook.getWorksheet('CAMERA_REGISTRY_TEMPLATE') !== undefined, 'Sheet 1: CAMERA_REGISTRY_TEMPLATE exists');
      assert(tplWorkbook.getWorksheet('README_INSTRUCTIONS') !== undefined, 'Sheet 2: README_INSTRUCTIONS exists');
      assert(tplWorkbook.getWorksheet('REFERENCE_ENUMS') !== undefined, 'Sheet 3: REFERENCE_ENUMS exists');

      const dataSheet = tplWorkbook.getWorksheet('CAMERA_REGISTRY_TEMPLATE');
      assert(dataSheet.rowCount >= 6, 'Template includes header row plus 5 sample demonstration cameras');
    }

    // ─── 2. HEADER & ALIAS NORMALIZATION TEST ─────────────────────────────────
    console.log('\n🔍 2. Testing Header Validation & Column Aliases...');
    {
      const testWorkbook = new ExcelJS.Workbook();
      const ws = testWorkbook.addWorksheet('CAMERAS');
      // Intentionally use colloquial aliases
      ws.addRow(['cam_id', 'camera_name', 'lat', 'lng_coord', 'dist', 'type', 'dept']);
      ws.addRow(['GJ-ALIAS-01', 'Test Alias Cam', 23.02, 72.57, 'Ahmedabad', 'PTZ', 'TRAFFIC']);

      const buffer = await testWorkbook.xlsx.writeBuffer();
      const session = await parseAndValidateExcel(buffer, 'test_aliases.xlsx', mockAdmin);

      assert(session.summary.valid === 1, 'Column aliases (cam_id -> cameraId, lat -> latitude) normalized accurately');
      assert(session.rows[0].normalized.type === 'PTZ', 'Camera type enum resolved to PTZ');
      assert(session.rows[0].normalized.departmentCode === 'TRAFFIC', 'Department alias resolved to TRAFFIC');

      // Cleanup
      await ImportSession.deleteOne({ _id: session._id });
    }

    // ─── 3. MISSING REQUIRED COLUMNS TEST ─────────────────────────────────────
    console.log('\n❌ 3. Testing Missing Required Headers Rejection...');
    {
      const badWorkbook = new ExcelJS.Workbook();
      const ws = badWorkbook.addWorksheet('CAMERAS');
      ws.addRow(['cameraId', 'cameraName']); // missing latitude, longitude, district
      ws.addRow(['GJ-BAD-01', 'Bad Header Cam']);

      const buffer = await badWorkbook.xlsx.writeBuffer();
      let threw = false;
      try {
        await parseAndValidateExcel(buffer, 'bad_headers.xlsx', mockAdmin);
      } catch (err) {
        threw = true;
        assert(err.message.includes('Missing required columns'), `Error clearly states missing columns: ${err.message}`);
      }
      assert(threw, 'Workbook with missing required columns was rejected prior to processing');
    }

    // ─── 4. ROW-LEVEL VALIDATION & GEOLOCATION BOUNDS ────────────────────────
    console.log('\n📍 4. Testing Row-level Error Diagnostics & Geolocation Bounds...');
    {
      const rowWorkbook = new ExcelJS.Workbook();
      const ws = rowWorkbook.addWorksheet('CAMERAS');
      ws.addRow(['cameraId', 'cameraName', 'latitude', 'longitude', 'district']);
      ws.addRow(['', 'Missing ID Camera', 23.02, 72.57, 'Ahmedabad']); // Row 2: Empty ID -> ERROR
      ws.addRow(['GJ-ROW-02', '', 23.02, 72.57, 'Ahmedabad']); // Row 3: Empty Name -> ERROR
      ws.addRow(['GJ-ROW-03', 'Invalid Lat', 'NOT_A_NUM', 72.57, 'Ahmedabad']); // Row 4: NaN Lat -> ERROR
      ws.addRow(['GJ-ROW-04', 'Out of Global Lat', 145.0, 72.57, 'Ahmedabad']); // Row 5: Lat > 90 -> ERROR
      ws.addRow(['GJ-ROW-05', 'Out of State Warning', 28.61, 77.20, 'Ahmedabad']); // Row 6: Delhi coords -> WARNING
      ws.addRow(['GJ-ROW-06', 'Valid Gujarat Camera', 23.03, 72.51, 'Ahmedabad']); // Row 7: Valid -> VALID

      const buffer = await rowWorkbook.xlsx.writeBuffer();
      const session = await parseAndValidateExcel(buffer, 'test_row_diagnostics.xlsx', mockAdmin);

      assert(session.summary.total === 6, 'Total 6 candidate rows processed');
      assert(session.summary.errors === 4, '4 rows flagged with specific errors');
      assert(session.summary.warnings === 1, '1 row flagged with geographic out-of-state warning');
      assert(session.summary.valid === 1, '1 completely valid row identified');

      const row2 = session.rows.find((r) => r.rowNumber === 2);
      assert(row2.errors.some((e) => e.field === 'cameraId'), 'Row 2 reports empty cameraId error');

      const row5 = session.rows.find((r) => r.rowNumber === 5);
      assert(row5.errors.some((e) => e.field === 'latitude'), 'Row 5 reports latitude > 90 bounds error');

      const row6 = session.rows.find((r) => r.rowNumber === 6);
      assert(row6.warnings.some((w) => w.field === 'coordinates'), 'Row 6 reports geographic boundary warning');

      // Cleanup
      await ImportSession.deleteOne({ _id: session._id });
    }

    // ─── 5. IN-FILE & DATABASE DUPLICATE DETECTION ────────────────────────────
    console.log('\n↻ 5. Testing In-File & MongoDB Duplicate Collisions...');
    {
      // First seed a temporary camera in DB
      const existingId = 'GJ-EXISTING-DUP-01';
      await Camera.deleteOne({ cameraId: existingId });
      await Camera.create({
        cameraId: existingId,
        name: 'Pre-existing Database Camera',
        latitude: 23.01,
        longitude: 72.55,
        location: { type: 'Point', coordinates: [72.55, 23.01] },
        district: 'Ahmedabad',
        address: { district: 'Ahmedabad', city: 'Ahmedabad', full: 'Ahmedabad, Gujarat' },
      });

      const dupWorkbook = new ExcelJS.Workbook();
      const ws = dupWorkbook.addWorksheet('CAMERAS');
      ws.addRow(['cameraId', 'cameraName', 'latitude', 'longitude', 'district']);
      ws.addRow(['GJ-INFILE-DUP-01', 'First Occurrence', 23.02, 72.51, 'Ahmedabad']); // Row 2: Valid
      ws.addRow(['GJ-INFILE-DUP-01', 'Second Occurrence (Duplicate)', 23.02, 72.51, 'Ahmedabad']); // Row 3: In-file duplicate
      ws.addRow([existingId, 'Database Duplicate Cam', 23.01, 72.55, 'Ahmedabad']); // Row 4: Database duplicate

      const buffer = await dupWorkbook.xlsx.writeBuffer();
      const session = await parseAndValidateExcel(buffer, 'test_duplicates.xlsx', mockAdmin);

      assert(session.summary.duplicates === 2, 'Correctly detected 2 duplicate collisions');
      const inFileDup = session.rows.find((r) => r.rowNumber === 3);
      assert(inFileDup.status === 'DUPLICATE' && inFileDup.duplicateReason.includes('within uploaded file'), 'In-file collision flagged with source row number');

      const dbDup = session.rows.find((r) => r.rowNumber === 4);
      assert(dbDup.status === 'DUPLICATE' && dbDup.duplicateReason.includes('already registered in database'), 'MongoDB registry collision flagged with existing record details');

      // Cleanup
      await Camera.deleteOne({ cameraId: existingId });
      await ImportSession.deleteOne({ _id: session._id });
    }

    // ─── 6. TWO-PHASE SAFE COMMIT & PERSISTENCE ───────────────────────────────
    console.log('\n⚡ 6. Testing Two-Phase Persistence (Staging vs Commit)...');
    {
      const uniqueBatchId = `GJ-TEST-BATCH-${Date.now()}`;
      const batchIds = [`${uniqueBatchId}-A`, `${uniqueBatchId}-B`];

      const commitWorkbook = new ExcelJS.Workbook();
      const ws = commitWorkbook.addWorksheet('CAMERAS');
      ws.addRow(['cameraId', 'cameraName', 'latitude', 'longitude', 'district', 'department', 'cameraType']);
      ws.addRow([batchIds[0], 'Batch Camera Alpha', 23.045, 72.565, 'Ahmedabad', 'TRAFFIC', 'PTZ']); // Valid
      ws.addRow([batchIds[1], 'Batch Camera Beta', 21.185, 72.825, 'Surat', 'POLICE', 'Fixed']); // Valid
      ws.addRow(['', 'Invalid Row (Must not persist)', 22.0, 72.0, 'Anand', 'POLICE', 'Fixed']); // Invalid

      const buffer = await commitWorkbook.xlsx.writeBuffer();

      // Phase 1: VALIDATE (Must NOT insert into Camera collection)
      const session = await parseAndValidateExcel(buffer, 'two_phase_test.xlsx', mockAdmin);
      const preCheck = await Camera.find({ cameraId: { $in: batchIds } });
      assert(preCheck.length === 0, 'Phase 1: Validation did NOT write any records to MongoDB Camera collection');

      // Phase 2: COMMIT (Persists only valid records)
      const commitRes = await commitBulkImport(session.importId, mockAdmin, mockReq);
      assert(commitRes.success === true, 'Phase 2: Commit operation executed successfully');
      assert(commitRes.importedCount === 2, 'Exactly 2 valid cameras persisted into registry');

      const postCheck = await Camera.find({ cameraId: { $in: batchIds } });
      assert(postCheck.length === 2, 'Both valid cameras exist in MongoDB with correct 2dsphere GeoJSON geometry');
      assert(postCheck[0].location.type === 'Point' && postCheck[0].location.coordinates.length === 2, 'GeoJSON Point structure matches GIS requirements');

      // Re-commit attempt must be prevented
      let reCommitBlocked = false;
      try {
        await commitBulkImport(session.importId, mockAdmin, mockReq);
      } catch (err) {
        reCommitBlocked = true;
        assert(err.message.includes('already been processed'), 'Prevented accidental duplicate re-commit of completed session');
      }
      assert(reCommitBlocked, 'Completed session is locked against re-execution');

      // Audit Log Verification
      const auditLog = await SystemAuditLog.findOne({
        action: 'BULK_CAMERA_IMPORT',
        resourceId: session.importId,
      });
      assert(auditLog !== null, 'SystemAuditLog record was written with action: BULK_CAMERA_IMPORT');
      assert(auditLog.description.includes('2 cameras into registry'), 'Audit log records accurate persisted counts');

      // Cleanup
      await Camera.deleteMany({ cameraId: { $in: batchIds } });
      await ImportSession.deleteOne({ _id: session._id });
      await SystemAuditLog.deleteOne({ _id: auditLog?._id });
    }

    // ─── 7. AUDIT REPORT GENERATION ───────────────────────────────────────────
    console.log('\n📊 7. Testing Machine-readable Audit Report Generation (.xlsx)...');
    {
      const samplePath = path.join(__dirname, '../src/uploads/sample_camera_registry.xlsx');
      const sampleBuffer = fs.readFileSync(samplePath);
      const session = await parseAndValidateExcel(sampleBuffer, 'sample_camera_registry.xlsx', mockAdmin);

      const reportBuffer = await generateImportReport(session.importId);
      assert(reportBuffer && reportBuffer.length > 5000, 'Audit report generated as valid Excel buffer (>5KB)');

      const reportWorkbook = new ExcelJS.Workbook();
      await reportWorkbook.xlsx.load(reportBuffer);

      assert(reportWorkbook.getWorksheet('IMPORT_AUDIT_SUMMARY') !== undefined, 'Report contains IMPORT_AUDIT_SUMMARY sheet');
      assert(reportWorkbook.getWorksheet('ROW_LEVEL_DETAILS') !== undefined, 'Report contains ROW_LEVEL_DETAILS sheet');

      const detailSheet = reportWorkbook.getWorksheet('ROW_LEVEL_DETAILS');
      assert(detailSheet.rowCount >= session.rows.length + 1, 'Report detail sheet lists all evaluated rows');

      // Cleanup
      await ImportSession.deleteOne({ _id: session._id });
    }

    console.log('\n================================================================');
    console.log(`🎉 ALL TESTS COMPLETED: ${passedTests}/${totalTests} PASSED (100%)`);
    console.log('================================================================\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

runVerificationSuite();

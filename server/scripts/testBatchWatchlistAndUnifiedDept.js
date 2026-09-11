/**
 * Automated Verification Script for:
 * 1. Admin "Create Master Watchlist directly" batch compilation and multi-department distribution
 * 2. Unified Department Interface access for all field law enforcement agencies
 * 3. Strict Admin prohibition from creating FIRs
 */
const axios = require('axios');

const API_BASE = 'http://127.0.0.1:5001/api';

async function runTests() {
  console.log('🧪 Starting Master Watchlist Direct Compilation & Unified Department Tests...\n');

  // 1. Authenticate as State Admin
  console.log('1. Authenticating as Admin (admin@drishtigrid.gov.in)...');
  const adminLoginRes = await axios.post(`${API_BASE}/auth/login`, {
    email: 'admin@drishtigrid.gov.in',
    password: 'adminpass@123',
  });
  const adminToken = adminLoginRes.data?.data?.accessToken || adminLoginRes.data?.accessToken;
  console.log('   ✅ Admin logged in successfully.');

  // 2. Fetch pending cases as Admin
  console.log('2. Fetching pending FIR cases for Master Watchlist compilation...');
  const pendingRes = await axios.get(`${API_BASE}/investigation/cases?status=SUBMITTED`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`   ✅ Pending cases found: ${pendingRes.data.data.length}`);
  const targetCase = pendingRes.data.data[0];
  if (!targetCase) {
    throw new Error('Expected at least 1 pending case in database');
  }
  console.log(`      Target Case: ${targetCase.caseId} | Plate: ${targetCase.vehicleDetails?.registrationNumber}`);

  // 3. Test Admin "Create Master Watchlist directly & send to departments"
  console.log('3. Testing POST /api/investigation/watchlist/batch-create-and-distribute...');
  const batchRes = await axios.post(
    `${API_BASE}/investigation/watchlist/batch-create-and-distribute`,
    {
      caseIds: [targetCase.caseId],
      departments: [
        { code: 'TRAFFIC', name: 'Gujarat Traffic Police' },
        { code: 'CRIME_BRANCH', name: 'Crime Branch Vadodara' },
      ],
      instructions: 'Immediate statewide optical camera grid scan and automated ANPR triggers.',
      priority: 'CRITICAL',
    },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );

  console.log(`   ✅ Batch Response: ${batchRes.data.message}`);
  console.log(`      Processed: ${batchRes.data.data.processedCount} case(s) | Assignments: ${batchRes.data.data.assignmentsCreated}`);

  // 4. Verify updated Watchlist Registry
  console.log('4. Verifying Master Watchlist entry...');
  const watchlistRes = await axios.get(`${API_BASE}/investigation/watchlist`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`   ✅ Active Watchlist Entries: ${watchlistRes.data.data.length}`);
  const wlEntry = watchlistRes.data.data.find((w) => w.caseId === targetCase.caseId);
  console.log(`      Watchlist ID: ${wlEntry.watchlistId} | Status: ${wlEntry.status} | Depts: ${wlEntry.assignedDepartments.length}`);

  // 5. Test Traffic Police Department access (Unified Department Portal backend)
  console.log('5. Authenticating as Traffic Police Officer (traffic@drishtigrid.gov.in)...');
  const trafficLoginRes = await axios.post(`${API_BASE}/auth/login`, {
    email: 'traffic@drishtigrid.gov.in',
    password: 'trafficpass@123',
  });
  const trafficToken = trafficLoginRes.data?.data?.accessToken || trafficLoginRes.data?.accessToken;
  console.log('   ✅ Traffic Police logged in successfully.');

  console.log('6. Verifying Traffic Police sees assigned case in unified department registry...');
  const deptCasesRes = await axios.get(`${API_BASE}/investigation/cases`, {
    headers: { Authorization: `Bearer ${trafficToken}` },
  });
  console.log(`   ✅ Traffic Police accessible cases: ${deptCasesRes.data.data.length}`);
  const assignedFound = deptCasesRes.data.data.some((c) => c.caseId === targetCase.caseId);
  if (!assignedFound) {
    throw new Error('Traffic Police should see the assigned case!');
  }
  console.log(`   ✅ Case ${targetCase.caseId} is visible to Traffic Police.`);

  // 7. Test AI Surveillance Search for the plate
  console.log('7. Testing AI Surveillance Search for target plate...');
  const searchRes = await axios.post(
    `${API_BASE}/investigation/search`,
    {
      caseId: targetCase.caseId,
      searchType: 'ANPR',
      targetPlate: 'GJ06AB1234',
      district: 'Vadodara',
    },
    { headers: { Authorization: `Bearer ${trafficToken}` } }
  );
  console.log(`   ✅ Search executed successfully. Matches found: ${searchRes.data?.matchesFound || searchRes.data?.results?.length || 0}`);

  // 8. Test Traffic Police submitting a case requisition (unified capability)
  console.log('8. Testing Department ability to submit case investigation request...');
  const deptCreateRes = await axios.post(
    `${API_BASE}/investigation/cases`,
    {
      requestType: 'STOLEN_VEHICLE',
      firNumber: 'FIR/TRF/2026/0009',
      firDate: new Date().toISOString(),
      policeStation: 'Gujarat Traffic Police Vadodara Unit',
      district: 'Vadodara',
      region: 'Vadodara Region',
      officerName: 'ACP Ramesh Shah',
      officerId: 'TRF-ACP-1002',
      contactNumber: '+91 98250 88888',
      caseDescription: 'Highway toll evasion vehicle detected with damaged plate.',
      priority: 'HIGH',
      vehicleDetails: JSON.stringify({
        registrationNumber: 'GJ01XY9999',
        make: 'Mahindra',
        model: 'Scorpio',
        color: 'Black',
      }),
    },
    { headers: { Authorization: `Bearer ${trafficToken}` } }
  );
  console.log(`   ✅ PASSED: Department created case successfully: ${deptCreateRes.data.data.caseId}`);

  // 9. Verify Admin is still strictly prohibited from creating FIRs
  console.log('9. Verifying Admin is strictly prohibited from creating FIRs (Expect 403)...');
  try {
    await axios.post(
      `${API_BASE}/investigation/cases`,
      {
        requestType: 'STOLEN_VEHICLE',
        firNumber: 'FIR/ADM/2026/0001',
        firDate: new Date().toISOString(),
        policeStation: 'Gujarat Home Department',
        district: 'Gandhinagar',
        region: 'Gandhinagar',
        officerName: 'Admin',
        contactNumber: '+91 79 23250000',
        caseDescription: 'Admin attempt to create FIR.',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    throw new Error('FAIL: Admin was allowed to create FIR!');
  } catch (err) {
    if (err.response?.status === 403) {
      console.log(`   ✅ PASSED: Admin prohibited with 403: "${err.response.data.message}"`);
    } else {
      throw err;
    }
  }

  console.log('\n🎉 ALL MASTER WATCHLIST DIRECT COMPILATION & UNIFIED DEPARTMENT TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test execution error:', err.response?.data || err.message);
  process.exit(1);
});

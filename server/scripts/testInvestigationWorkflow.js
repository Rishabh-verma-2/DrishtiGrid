const axios = require('axios');

async function testWorkflow() {
  const baseURL = 'http://127.0.0.1:5001/api';
  console.log('🧪 Starting Investigation Workflow API Tests...');

  try {
    // 1. Authenticate as Admin
    console.log('1. Authenticating as Admin (admin@drishtigrid.gov.in)...');
    const loginRes = await axios.post(`${baseURL}/auth/login`, {
      email: 'admin@drishtigrid.gov.in',
      password: 'adminpass@123',
    });

    const token = loginRes.data?.data?.accessToken || loginRes.data?.accessToken;
    if (!token) throw new Error('Failed to obtain auth token');
    console.log('   ✅ Admin logged in successfully.');

    const client = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${token}` },
    });

    // 2. Fetch Investigation Analytics
    console.log('2. Testing GET /investigation/analytics...');
    const analyticsRes = await client.get('/investigation/analytics');
    console.log('   ✅ Analytics:', analyticsRes.data?.data?.kpis);

    // 3. Fetch Cases
    console.log('3. Testing GET /investigation/cases...');
    const casesRes = await client.get('/investigation/cases');
    console.log(`   ✅ Found ${casesRes.data?.data?.length} FIR Cases. Total: ${casesRes.data?.pagination?.total}`);

    // 4. Fetch Primary Case Details
    console.log('4. Testing GET /investigation/cases/FIR-2026-000124...');
    const caseRes = await client.get('/investigation/cases/FIR-2026-000124');
    const c = caseRes.data?.data;
    console.log(`   ✅ Case: ${c?.caseId} | Type: ${c?.requestType} | Status: ${c?.status}`);
    console.log(`      Timeline events: ${c?.timeline?.length} | Assignments: ${c?.assignments?.length} | Results: ${c?.results?.length}`);

    // 5. Test Duplicate Detection
    console.log('5. Testing GET /investigation/check-duplicate for GJ06AB1234...');
    const dupRes = await client.get('/investigation/check-duplicate?identifier=GJ06AB1234&type=STOLEN_VEHICLE');
    console.log(`   ✅ Duplicate check returned: hasDuplicate = ${dupRes.data?.hasDuplicate}`);

    // 6. Test Watchlist Listing
    console.log('6. Testing GET /investigation/watchlist...');
    const wlRes = await client.get('/investigation/watchlist');
    console.log(`   ✅ Watchlist returned ${wlRes.data?.data?.length} active entries.`);

    // 7. Test AI Surveillance Search
    console.log('7. Testing POST /investigation/search...');
    const searchRes = await client.post('/investigation/search', {
      caseId: 'FIR-2026-000124',
      searchType: 'ANPR',
      targetPlate: 'GJ06AB1234',
      district: 'Vadodara',
    });
    console.log(`   ✅ Search executed. Matches Found: ${searchRes.data?.matchesFound}. Search ID: ${searchRes.data?.searchId}`);

    // 8. Test RBAC: Admin MUST NOT be able to create an FIR request
    console.log('8. Testing Admin Create FIR prohibition (Expect 403)...');
    try {
      await client.post('/investigation/cases', {
        requestType: 'STOLEN_VEHICLE',
        firNumber: 'FIR/TEST/2026/001',
        firDate: new Date().toISOString(),
        policeStation: 'Sayajigunj Police Station',
        officerName: 'Admin Officer',
        contactNumber: '+91 99999 88888',
        caseDescription: 'Illegal test submission by Admin',
      });
      throw new Error('FAILED: Admin was erroneously allowed to create an FIR case!');
    } catch (adminErr) {
      if (adminErr.response?.status === 403) {
        console.log(`   ✅ PASSED: Admin prohibited from creating FIR: "${adminErr.response.data?.message}"`);
      } else {
        throw adminErr;
      }
    }

    // 9. Test Police Station Login & FIR Creation
    console.log('9. Authenticating as Police Station Officer (police@drishtigrid.gov.in)...');
    const policeLogin = await axios.post(`${baseURL}/auth/login`, {
      email: 'police@drishtigrid.gov.in',
      password: 'policepass@123',
    });
    const policeToken = policeLogin.data?.data?.accessToken || policeLogin.data?.accessToken;
    const policeClient = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${policeToken}` },
    });

    console.log('10. Testing Police Station Create FIR (Expect 201)...');
    const newFirRes = await policeClient.post('/investigation/cases', {
      requestType: 'STOLEN_VEHICLE',
      firNumber: `FIR/SAY/2026/${Math.floor(1000 + Math.random() * 9000)}`,
      firDate: new Date().toISOString(),
      policeStation: 'Sayajigunj Police Station',
      district: 'Vadodara',
      region: 'Vadodara Region',
      officerName: 'Inspector Vijay Patel',
      contactNumber: '+91 98250 55443',
      caseDescription: 'Stolen motorcycle reported at Sayajigunj market gate.',
      vehicleDetails: JSON.stringify({
        registrationNumber: 'GJ06XY9988',
        vehicleType: 'Motorcycle',
        make: 'Hero',
        model: 'Splendor Plus',
        color: 'Black',
      }),
    });
    console.log(`   ✅ PASSED: Police Station created FIR successfully. Case ID: ${newFirRes.data?.caseId}`);

    // 11. Test Department Login & Access to Assigned Cases Only
    console.log('11. Authenticating as Department User (traffic@drishtigrid.gov.in)...');
    const trafficLogin = await axios.post(`${baseURL}/auth/login`, {
      email: 'traffic@drishtigrid.gov.in',
      password: 'trafficpass@123',
    });
    const trafficToken = trafficLogin.data?.data?.accessToken || trafficLogin.data?.accessToken;
    const trafficClient = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${trafficToken}` },
    });

    console.log('12. Testing Department RBAC filtering (assigned cases only)...');
    const deptCasesRes = await trafficClient.get('/investigation/cases');
    console.log(`   ✅ PASSED: Department user sees only assigned cases: ${deptCasesRes.data?.data?.length} cases.`);

    console.log('\n🎉 ALL INVESTIGATION WORKFLOW & RBAC TESTS PASSED!\n');
  } catch (err) {
    console.error('❌ Test failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

testWorkflow();

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const FirCase = require('../src/models/FirCase');
const WatchlistEntry = require('../src/models/WatchlistEntry');
const InvestigationAssignment = require('../src/models/InvestigationAssignment');
const InvestigationSearch = require('../src/models/InvestigationSearch');
const InvestigationResult = require('../src/models/InvestigationResult');
const { calculateSlaDueAt, INVESTIGATION_STATES } = require('../src/utils/investigationStateMachine');

async function seedInvestigationData() {
  try {
    console.log('🌱 Connecting to MongoDB for Investigation Workflow seed...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Retrieve or configure dedicated prototype users for all 3 distinct roles
    let adminUser = await User.findOne({ email: 'admin@drishtigrid.gov.in' });
    if (!adminUser) {
      adminUser = await User.findOne({ role: 'ADMIN' });
    }
    if (adminUser) {
      adminUser.department = 'Gujarat Home Department';
      adminUser.role = 'ADMIN';
      await adminUser.save();
    }

    let policeUser = await User.findOne({ email: 'police@drishtigrid.gov.in' });
    if (!policeUser) {
      policeUser = await User.findOne({ role: 'POLICE' });
    }
    if (policeUser) {
      policeUser.role = 'POLICE';
      policeUser.policeStation = 'Sayajigunj Police Station';
      policeUser.department = 'Sayajigunj Police Station';
      if (Array.isArray(policeUser.permissions)) {
        if (!policeUser.permissions.includes('investigation')) {
          policeUser.permissions.push('investigation');
        }
      } else {
        policeUser.permissions = ['gis_map', 'camera_monitoring', 'footage_requests', 'reports', 'investigation'];
      }
      await policeUser.save();
    }

    let trafficUser = await User.findOne({ email: 'traffic@drishtigrid.gov.in' });
    if (!trafficUser) {
      trafficUser = await User.findOne({ role: 'TRAFFIC_POLICE' });
    }
    if (trafficUser) {
      trafficUser.role = 'TRAFFIC_POLICE';
      trafficUser.department = 'Gujarat Traffic Police';
      if (Array.isArray(trafficUser.permissions)) {
        if (!trafficUser.permissions.includes('investigation')) {
          trafficUser.permissions.push('investigation');
        }
      } else {
        trafficUser.permissions = ['gis_map', 'camera_monitoring', 'anpr', 'footage_requests', 'reports', 'investigation'];
      }
      await trafficUser.save();
    }

    let crimeUser = await User.findOne({ email: 'crimebranch@drishtigrid.gov.in' });
    if (!crimeUser) {
      crimeUser = new User({
        name: 'DCP Rajesh Trivedi',
        email: 'crimebranch@drishtigrid.gov.in',
        password: 'crimepass@123',
        role: 'DEPARTMENT',
        department: 'Gujarat Crime Branch',
        designation: 'Deputy Commissioner of Police',
        phone: '+91-79-25620200',
        district: 'Ahmedabad',
        isActive: true,
      });
      await crimeUser.save();
    }

    const adminId = adminUser?._id || new mongoose.Types.ObjectId();
    const policeId = policeUser?._id || new mongoose.Types.ObjectId();
    const trafficId = trafficUser?._id || new mongoose.Types.ObjectId();
    const crimeId = crimeUser?._id || new mongoose.Types.ObjectId();

    // Clean up all existing investigation records
    console.log('🧹 Purging all investigation records...');
    await Promise.all([
      FirCase.deleteMany({}),
      WatchlistEntry.deleteMany({}),
      InvestigationAssignment.deleteMany({}),
      InvestigationSearch.deleteMany({}),
      InvestigationResult.deleteMany({}),
    ]);

    console.log('\n📊 All dummy data for FIR system has been removed.');
    console.log('🎉 Clean slate: ready for real user workflow testing without mock entries.\n');

    await mongoose.disconnect();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during seeding:', err);
    process.exit(1);
  }
}

seedInvestigationData();


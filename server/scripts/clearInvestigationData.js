require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const FirCase = require('../src/models/FirCase');
const WatchlistEntry = require('../src/models/WatchlistEntry');
const InvestigationAssignment = require('../src/models/InvestigationAssignment');
const InvestigationSearch = require('../src/models/InvestigationSearch');
const InvestigationResult = require('../src/models/InvestigationResult');

async function clearInvestigationData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    console.log('Clearing all FIR Investigation dummy data...');
    const results = await Promise.all([
      FirCase.deleteMany({}),
      WatchlistEntry.deleteMany({}),
      InvestigationAssignment.deleteMany({}),
      InvestigationSearch.deleteMany({}),
      InvestigationResult.deleteMany({}),
    ]);

    console.log(`Deleted:
- FirCases: ${results[0].deletedCount}
- WatchlistEntries: ${results[1].deletedCount}
- InvestigationAssignments: ${results[2].deletedCount}
- InvestigationSearches: ${results[3].deletedCount}
- InvestigationResults: ${results[4].deletedCount}`);

    console.log('All dummy data for FIR system successfully cleared.');
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error clearing investigation data:', err);
    process.exit(1);
  }
}

clearInvestigationData();

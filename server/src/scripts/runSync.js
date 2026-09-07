require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const { syncDepartmentsAndCameras } = require('../utils/departmentSync');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/drishtigrid').then(async () => {
  await syncDepartmentsAndCameras();
  const db = mongoose.connection.db;
  const cameras = await db.collection('cameras').find({}, { projection: { departmentCode: 1 } }).toArray();
  const counts = {};
  cameras.forEach(c => {
    counts[c.departmentCode] = (counts[c.departmentCode] || 0) + 1;
  });
  console.log('Result counts by departmentCode:', counts);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});

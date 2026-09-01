require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// ─── Inline minimal models to avoid circular deps ────────────────
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: { type: String, select: false },
  role: { type: String, default: 'admin' },
  department: String,
  designation: String,
  phone: String,
  district: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const cameraSchema = new mongoose.Schema({
  cameraId: { type: String, unique: true },
  name: String,
  description: String,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number],
  },
  address: {
    street: String, area: String, city: String,
    district: String, state: String, pincode: String,
  },
  type: { type: String, default: 'Fixed' },
  status: { type: String, default: 'offline' },
  zone: String,
  streamUrl: { rtsp: String, hls: String },
  district: String,
  isActive: { type: Boolean, default: true },
  coverageAngle: Number,
  coverageRadius: Number,
  alertsEnabled: {
    motionDetection: Boolean,
    crowdDetection: Boolean,
    nightVision: Boolean,
    anprEnabled: Boolean,
    faceRecognition: Boolean,
  },
  // extra fields from JSON
  locationName: String,
  landmark: String,
  roadName: String,
  locationType: String,
  heading: Number,
  fieldOfView: Number,
  mountingHeight: Number,
  departmentName: String,
  dataSource: String,
  verified: Boolean,
}, { timestamps: true });

cameraSchema.index({ location: '2dsphere' });
const Camera = mongoose.models.Camera || mongoose.model('Camera', cameraSchema);

// ─── Status mapper ────────────────────────────────────────────────
const mapStatus = (s) => {
  const map = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    MAINTENANCE: 'maintenance',
    FAULT: 'fault',
  };
  return map[s?.toUpperCase()] || 'offline';
};

// ─── Zone mapper ─────────────────────────────────────────────────
const mapZone = (locType) => {
  const map = {
    'Bridge': 'Traffic',
    'Highway': 'Traffic',
    'Road': 'Traffic',
    'Market': 'Market',
    'Railway Station': 'Public Space',
    'Temple': 'Religious Site',
    'Garden': 'Public Space',
    'Hospital': 'Hospital',
    'School': 'School Zone',
    'Border': 'Border',
    'Industrial': 'Industrial',
  };
  return map[locType] || 'Public Space';
};

// ─── Camera type mapper ──────────────────────────────────────────
const mapCameraType = (t) => {
  const allowed = ['PTZ', 'Fixed', 'Dome', 'Bullet', 'Fisheye', 'Thermal'];
  return allowed.includes(t) ? t : 'Fixed';
};

async function seed() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // ─── 1. Seed Admin User ──────────────────────────────────────
    console.log('\n👤 Seeding admin user...');
    const adminEmail = 'adminuser@gov.in';
    const adminPassword = 'adminpass@123';

    const existing = await User.findOne({ email: adminEmail });
    if (existing) {
      console.log(`   ⚠️  Admin already exists: ${adminEmail}`);
    } else {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      await User.create({
        name: 'DrishtiGrid Admin',
        email: adminEmail,
        password: hashedPassword,
        role: 'superadmin',
        department: 'Gujarat Home Department',
        designation: 'System Administrator',
        phone: '+91-79-23250000',
        district: 'Ahmedabad',
        isActive: true,
      });
      console.log(`   ✅ Admin created: ${adminEmail} / ${adminPassword}`);
    }

    // ─── 2. Seed Cameras from JSON ───────────────────────────────
    console.log('\n📷 Seeding cameras from JSON...');
    const jsonPath = path.join(__dirname, '../src/uploads/gujarat_cctv_demo_cameras.json');
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const cameras = JSON.parse(rawData);

    let inserted = 0;
    let skipped = 0;

    for (const cam of cameras) {
      const existingCam = await Camera.findOne({ cameraId: cam.cameraId });
      if (existingCam) {
        skipped++;
        continue;
      }

      await Camera.create({
        cameraId: cam.cameraId,
        name: cam.cameraName,
        description: `${cam.locationType} surveillance camera at ${cam.locationName}`,
        location: {
          type: 'Point',
          coordinates: [cam.longitude, cam.latitude],
        },
        address: {
          street: cam.roadName,
          area: cam.locationName,
          city: cam.city,
          district: cam.district,
          state: 'Gujarat',
          pincode: cam.pincode,
        },
        type: mapCameraType(cam.cameraType),
        status: mapStatus(cam.status),
        zone: mapZone(cam.locationType),
        district: cam.district,
        locationName: cam.locationName,
        landmark: cam.landmark,
        roadName: cam.roadName,
        locationType: cam.locationType,
        heading: cam.heading,
        fieldOfView: cam.fieldOfView,
        mountingHeight: cam.mountingHeight,
        departmentName: cam.departmentName,
        dataSource: cam.dataSource,
        verified: cam.verified,
        coverageAngle: cam.fieldOfView || 90,
        coverageRadius: 80,
        alertsEnabled: {
          motionDetection: true,
          crowdDetection: cam.locationType === 'Market' || cam.locationType === 'Railway Station',
          nightVision: cam.cameraType === 'PTZ',
          anprEnabled: cam.locationType === 'Highway' || cam.locationType === 'Bridge',
          faceRecognition: false,
        },
        isActive: true,
      });
      inserted++;
    }

    console.log(`   ✅ Cameras inserted: ${inserted}`);
    console.log(`   ⏭️  Cameras skipped (already exist): ${skipped}`);

    // ─── Summary ─────────────────────────────────────────────────
    const totalCameras = await Camera.countDocuments();
    const totalUsers = await User.countDocuments();
    console.log(`\n📊 Database Summary:`);
    console.log(`   Users:   ${totalUsers}`);
    console.log(`   Cameras: ${totalCameras}`);
    console.log('\n✅ Seeding complete!\n');

  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

seed();

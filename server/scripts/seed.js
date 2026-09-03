require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// ─── Import Canonical Models ──────────────────────────────────────
const User = require('../src/models/User');
const Camera = require('../src/models/Camera');

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
    let jsonPath = path.join(__dirname, '../src/uploads/gujarat_cctv_demo_cameras (1).json');
    if (!fs.existsSync(jsonPath)) {
      jsonPath = path.join(__dirname, '../src/uploads/gujarat_cctv_demo_cameras.json');
    }
    console.log(`   Loading dataset from: ${path.basename(jsonPath)}`);
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const cameras = JSON.parse(rawData);

    let inserted = 0;
    let updated = 0;

    for (const cam of cameras) {
      const cameraDoc = {
        cameraId: cam.cameraId,
        name: cam.cameraName,
        cameraName: cam.cameraName,
        description: `${cam.locationType || 'CCTV'} surveillance camera at ${cam.locationName || cam.landmark || cam.city}`,
        location: {
          type: 'Point',
          coordinates: [Number(cam.longitude), Number(cam.latitude)],
        },
        latitude: Number(cam.latitude),
        longitude: Number(cam.longitude),
        address: {
          full: cam.address || '',
          street: cam.roadName || '',
          area: cam.locationName || '',
          city: cam.city || '',
          district: cam.district || 'Gujarat',
          taluka: cam.taluka || '',
          state: 'Gujarat',
          pincode: cam.pincode || '',
        },
        city: cam.city || '',
        district: cam.district || 'Gujarat',
        taluka: cam.taluka || '',
        pincode: cam.pincode || '',
        landmark: cam.landmark || '',
        roadName: cam.roadName || '',
        locationName: cam.locationName || '',
        locationType: cam.locationType || 'General',
        type: mapCameraType(cam.cameraType),
        brand: (cam.camera_model || '').split(' ')[0] || 'Hikvision',
        model: cam.camera_model || 'HD Network Camera',
        camera_model: cam.camera_model || '',
        resolution: '1080p',
        status: mapStatus(cam.status),
        zone: mapZone(cam.locationType),
        heading: typeof cam.heading === 'number' ? cam.heading : 0,
        fieldOfView: typeof cam.fieldOfView === 'number' ? cam.fieldOfView : 90,
        mountingHeight: typeof cam.mountingHeight === 'number' ? cam.mountingHeight : 6,
        streamId: `cam${String(((parseInt((cam.cameraId || '').replace(/\D/g, '') || 1) - 1) % 30 + 1)).padStart(2, '0')}`,
        streamType: cam.streamType || 'RTSP',
        streamStatus: cam.streamStatus || 'ACTIVE',
        departmentName: cam.departmentName || 'Gujarat Police Department',
        dataSource: cam.dataSource || 'DEMO_SIMULATED',
        verified: Boolean(cam.verified),
        fps: typeof cam.fps === 'number' ? cam.fps : 25,
        recording_history_days: typeof cam.recording_history_days === 'number' ? cam.recording_history_days : 30,
        coverageAngle: cam.fieldOfView || 90,
        coverageRadius: 80,
        alertsEnabled: {
          motionDetection: true,
          crowdDetection: cam.locationType === 'Market' || cam.locationType === 'Railway Station' || cam.locationType === 'Public Place',
          nightVision: cam.cameraType === 'PTZ' || cam.cameraType === 'Bullet',
          anprEnabled: cam.locationType === 'Highway' || cam.locationType === 'Bridge' || cam.locationType === 'Junction' || cam.locationType === 'Circle',
          faceRecognition: false,
        },
        isActive: true,
      };

      const res = await Camera.findOneAndUpdate(
        { cameraId: cam.cameraId },
        { $set: cameraDoc },
        { upsert: true, new: true, rawResult: true }
      );

      if (res.lastErrorObject && res.lastErrorObject.updatedExisting) {
        updated++;
      } else {
        inserted++;
      }
    }

    console.log(`   ✅ New cameras inserted: ${inserted}`);
    console.log(`   🔄 Existing cameras updated with rich metadata: ${updated}`);

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

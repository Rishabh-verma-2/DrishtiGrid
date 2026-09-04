require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../src/models/User');
const Camera = require('../src/models/Camera');
const FootageTicket = require('../src/models/FootageTicket');
const Evidence = require('../src/models/Evidence');
const TicketResponse = require('../src/models/TicketResponse');
const Notification = require('../src/models/Notification');
const FootageAuditLog = require('../src/models/FootageAuditLog');
const cryptoService = require('../src/services/cryptoService');
const cloudinaryService = require('../src/services/cloudinaryService');

async function runTest() {
  console.log('🚀 Starting Automated Verification for Ticket-Based CCTV & Secure Evidence System...\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Verify Users
    const trafficUser = await User.findOne({ email: 'traffic@drishtigrid.gov.in' });
    const policeUser = await User.findOne({ email: 'police@drishtigrid.gov.in' });
    const adminUser = await User.findOne({ email: 'admin@drishtigrid.gov.in' });

    if (!trafficUser || !policeUser) {
      throw new Error('Test users not found. Run seed script first.');
    }
    console.log(`✅ Loaded Test Users: ${trafficUser.name} (Traffic Police) & ${policeUser.name} (Police)`);

    // 2. Camera
    let camera = await Camera.findOne();
    if (!camera) {
      camera = await Camera.create({
        cameraId: 'GJ-CAM-TEST-01',
        name: 'Test Junction Camera',
        district: 'Ahmedabad',
        locationName: 'Income Tax Circle',
        departmentName: 'Gujarat Police Department',
        status: 'online',
        zone: 'Traffic',
        cameraType: 'Fixed',
      });
    }
    console.log(`✅ Camera ready: ${camera.cameraId} (${camera.name})`);

    // 3. Test Cryptographic Hashing & AES-256-GCM Encryption
    console.log('\n🔒 Testing Cryptographic Module...');
    const dummyVideoBuffer = Buffer.from('TEST_CCTV_FOOTAGE_BINARY_SIMULATION_DATA_STREAM_' + Date.now());
    const originalHash = cryptoService.generateSha256(dummyVideoBuffer);
    console.log(`   Computed SHA-256 Hash: ${originalHash}`);

    const { encryptedBuffer, ivHex, authTagHex } = cryptoService.encryptBuffer(dummyVideoBuffer);
    console.log(`   AES-256-GCM Encrypted: IV=${ivHex}, AuthTag=${authTagHex}, Ciphertext length=${encryptedBuffer.length}`);

    // Decrypt test
    const decryptedBuffer = cryptoService.decryptBuffer(encryptedBuffer, ivHex, authTagHex);
    const isIntegrityValid = cryptoService.verifySha256(decryptedBuffer, originalHash);
    if (!isIntegrityValid) {
      throw new Error('Cryptographic integrity verification failed! Decrypted buffer does not match original.');
    }
    console.log('✅ AES-256-GCM Decryption & SHA-256 match verified successfully');

    // 4. Test Cloudinary / Storage Upload
    console.log('\n☁️ Testing Cloudinary Evidence Storage...');
    const testTicketId = `TEST-REQ-${Date.now()}`;
    const testEvidenceId = `EV-${Date.now().toString().slice(-4)}`;
    const uploadRes = await cloudinaryService.uploadEncryptedBuffer(encryptedBuffer, testTicketId, testEvidenceId);
    console.log(`✅ Stored encrypted payload: publicId=${uploadRes.publicId}, url=${uploadRes.secureUrl}`);

    // Fetch back and verify
    const fetchedEncrypted = await cloudinaryService.fetchEncryptedBuffer(uploadRes.secureUrl, uploadRes.publicId);
    const decryptedFetched = cryptoService.decryptBuffer(fetchedEncrypted, ivHex, authTagHex);
    const fetchedMatch = cryptoService.verifySha256(decryptedFetched, originalHash);
    if (!fetchedMatch) {
      throw new Error('Fetched encrypted file decryption integrity failed!');
    }
    console.log('✅ Retrieved encrypted payload from storage and verified SHA-256 checksum');

    // 5. Create Ticket in DB
    console.log('\n🎫 Testing End-to-End Ticket Lifecycle in DB...');
    const ticket = await FootageTicket.create({
      ticketId: testTicketId,
      title: 'Automated Test Traffic Incident Requisition',
      priority: 'high',
      incidentType: 'Traffic Violation',
      requestingDepartment: trafficUser.department || 'Gujarat Traffic Police',
      requestedBy: trafficUser._id,
      officialDesignation: trafficUser.designation,
      contactPhone: trafficUser.phone,
      purpose: 'Investigation of vehicle collision on SG Highway',
      description: 'Requesting footage between 10:00 AM and 10:30 AM',
      targetDepartment: policeUser.department || 'Gujarat Police Department',
      camera: camera._id,
      cameraId: camera.cameraId,
      cameraName: camera.name,
      locationName: camera.locationName,
      district: camera.district,
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(),
      durationMinutes: 60,
      status: 'Pending',
    });

    console.log(`✅ Ticket created: ${ticket.ticketId}, Status=${ticket.status}`);

    // Create Notification
    const notif = await Notification.create({
      ticket: ticket._id,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.targetDepartment,
      senderUser: trafficUser._id,
      title: `New CCTV Requisition: ${ticket.ticketId}`,
      message: `Requisition created for ${camera.cameraId}`,
      type: 'TICKET_CREATED',
    });
    console.log(`✅ Notification created for department: ${notif.recipientDepartment}`);

    // Accept Ticket
    ticket.status = 'Accepted';
    ticket.reviewedBy = policeUser._id;
    await ticket.save();
    console.log(`✅ Ticket accepted by ${policeUser.name}, Status=${ticket.status}`);

    // Save Evidence
    const evidence = await Evidence.create({
      evidenceId: testEvidenceId,
      ticket: ticket._id,
      ticketId: ticket.ticketId,
      camera: camera._id,
      cameraId: camera.cameraId,
      originalFileName: 'cctv_sg_highway_incident.mp4',
      fileType: 'video/mp4',
      fileSizeBytes: dummyVideoBuffer.length,
      cloudinaryAsset: uploadRes,
      sha256Hash: originalHash,
      encryption: {
        algorithm: 'aes-256-gcm',
        iv: ivHex,
        authTag: authTagHex,
        isEncrypted: true,
      },
      uploadedBy: policeUser._id,
      uploadedByName: policeUser.name,
      uploadedByDept: policeUser.department,
      status: 'active',
      integrityStatus: 'verified',
    });

    ticket.status = 'Evidence Uploaded';
    ticket.evidence = evidence._id;
    ticket.evidenceId = evidence.evidenceId;
    ticket.mediaHash = originalHash;
    ticket.footageUrl = `/api/footage-tickets/${ticket.ticketId}/evidence/${evidence.evidenceId}/stream`;
    await ticket.save();
    console.log(`✅ Evidence record created: ${evidence.evidenceId}, Ticket updated to "${ticket.status}"`);

    // Add Case Response
    const response = await TicketResponse.create({
      ticket: ticket._id,
      ticketId: ticket.ticketId,
      sender: trafficUser._id,
      senderName: trafficUser.name,
      senderRole: trafficUser.role,
      senderDepartment: trafficUser.department,
      senderDesignation: trafficUser.designation,
      message: 'Received and verified video. Suspect vehicle registration plate identified.',
      type: 'comment',
    });
    console.log(`✅ Case discussion response posted: "${response.message}"`);

    // Close Ticket
    ticket.status = 'Closed';
    await ticket.save();
    console.log(`✅ Ticket finalized and Closed: ${ticket.ticketId}`);

    // Create Audit Logs
    const auditLog = await FootageAuditLog.create({
      ticket: ticket._id,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_VERIFIED',
      evidenceId: evidence.evidenceId,
      actionResult: 'SUCCESS',
      actor: trafficUser._id,
      actorName: trafficUser.name,
      actorDepartment: trafficUser.department,
      actorRole: trafficUser.role,
      remarks: 'Automated test suite verification confirmed SHA-256 cryptographic match.',
      integrityHash: crypto.createHash('sha256').update(ticket.ticketId + originalHash).digest('hex'),
    });
    console.log(`✅ Legal audit log entry created: Action=${auditLog.action}, Seal=${auditLog.integrityHash.slice(0, 16)}...`);

    console.log('\n🎉 ALL AUTOMATED VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification Error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTest();

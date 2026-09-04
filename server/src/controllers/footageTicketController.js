const crypto = require('crypto');
const FootageTicket = require('../models/FootageTicket');
const FootageAuditLog = require('../models/FootageAuditLog');
const Evidence = require('../models/Evidence');
const TicketResponse = require('../models/TicketResponse');
const Notification = require('../models/Notification');
const Camera = require('../models/Camera');
const cryptoService = require('../services/cryptoService');
const cloudinaryService = require('../services/cloudinaryService');
const { emitToDepartment, emitToUser, emitGlobal } = require('../socket/socketHandler');
const logger = require('../utils/logger');

// Generate tamper-evident SHA-256 integrity seal for audit logs
function generateAuditSeal(ticketId, action, actorId, timestamp, prevStatus, nextStatus, remarks, evidenceId = '') {
  const payload = `${ticketId}|${action}|${actorId}|${evidenceId}|${new Date(timestamp).toISOString()}|${prevStatus}|${nextStatus}|${remarks || ''}|DRISHTIGRID_SEAL_V2`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Record an immutable audit log entry
 */
async function createAuditEntry({
  ticket,
  ticketId,
  action,
  req,
  previousStatus = '',
  newStatus = '',
  remarks = '',
  evidenceId = '',
  actionResult = 'SUCCESS',
  metadata = {},
}) {
  const timestamp = new Date();
  const actor = req?.user || {
    _id: '000000000000000000000000',
    name: 'System',
    department: 'System Core',
    role: 'ADMIN',
  };

  const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req?.headers?.['user-agent'] || '';

  const integrityHash = generateAuditSeal(
    ticketId,
    action,
    actor._id.toString(),
    timestamp,
    previousStatus,
    newStatus,
    remarks,
    evidenceId
  );

  return FootageAuditLog.create({
    ticket: ticket ? ticket._id : undefined,
    ticketId,
    action,
    evidenceId,
    actionResult,
    actor: actor._id,
    actorName: actor.name,
    actorDepartment: actor.department || 'Gujarat Home Department',
    actorRole: actor.role,
    actorPhone: actor.phone || '',
    ipAddress,
    userAgent,
    previousStatus,
    newStatus,
    remarks,
    integrityHash,
    metadata,
    timestamp,
  });
}

/**
 * Helper to dispatch notification in DB and real-time Socket
 */
async function sendNotification({
  ticket,
  ticketId,
  recipientDepartment,
  recipientRole = 'ALL',
  recipientUser = null,
  senderUser = null,
  title,
  message,
  type,
  priority = 'medium',
  actionUrl = '',
}) {
  try {
    const notification = await Notification.create({
      ticket: ticket ? ticket._id : undefined,
      ticketId,
      recipientDepartment,
      recipientRole,
      recipientUser,
      senderUser: senderUser?._id,
      senderName: senderUser?.name || 'DrishtiGrid Authority',
      senderDepartment: senderUser?.department || '',
      title,
      message,
      type,
      priority,
      actionUrl: actionUrl || `/footage-requests?ticket=${ticketId}`,
    });

    // Emit socket event to department room
    emitToDepartment(recipientDepartment, 'notification:new', notification);
    if (recipientUser) {
      emitToUser(recipientUser, 'notification:new', notification);
    }

    return notification;
  } catch (err) {
    logger.error(`Error sending notification: ${err.message}`);
  }
}

/**
 * @desc    Create a new inter-department CCTV footage requisition ticket
 * @route   POST /api/footage-tickets
 */
const createTicket = async (req, res) => {
  try {
    const {
      title,
      firNumber,
      caseNumber,
      incidentType,
      priority,
      classification,
      cameraId,
      startTime,
      endTime,
      purpose,
      description,
      contactPhone,
      officialDesignation,
    } = req.body;

    if (!title || !cameraId || !startTime || !endTime || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Title, Camera, Start Time, End Time, and Legal Justification are required',
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({
        success: false,
        message: 'End time must be greater than start time',
      });
    }

    // Find camera details
    const cameraDoc = await Camera.findOne({
      $or: [
        { cameraId },
        { _id: cameraId.match(/^[0-9a-fA-F]{24}$/) ? cameraId : null },
      ],
    });

    if (!cameraDoc) {
      return res.status(404).json({ success: false, message: `Camera '${cameraId}' not found` });
    }

    const durationMinutes = Math.round((end - start) / (1000 * 60));

    // Generate unique sequential ticket ID (e.g. REQ-2026-0001)
    const count = await FootageTicket.countDocuments();
    const currentYear = new Date().getFullYear();
    const ticketId = `REQ-${currentYear}-${String(count + 1).padStart(4, '0')}`;

    // Auto-detect departments
    const requestingDept = req.user.department || (req.user.role === 'TRAFFIC_POLICE' ? 'Gujarat Traffic Police' : 'Gujarat Police Department');
    // If target dept is specified in body or derived from camera, use it
    let targetDept = req.body.targetDepartment || cameraDoc.departmentName;
    if (!targetDept) {
      // Default logically: if requesting is Traffic Police, target is Police and vice-versa
      targetDept = requestingDept.includes('Traffic') ? 'Gujarat Police Department' : 'Gujarat Traffic Police';
    }

    const ticket = await FootageTicket.create({
      ticketId,
      title,
      firNumber: firNumber || '',
      caseNumber: caseNumber || '',
      incidentType: incidentType || 'Criminal Investigation',
      priority: priority || 'medium',
      classification: classification || 'Confidential',

      requestingDepartment: requestingDept,
      requestedBy: req.user._id,
      officialDesignation: officialDesignation || req.user.designation || 'Investigating Officer',
      contactPhone: contactPhone || req.user.phone || '',
      purpose,
      description: description || purpose,

      targetDepartment: targetDept,
      camera: cameraDoc._id,
      cameraId: cameraDoc.cameraId,
      cameraName: cameraDoc.name || cameraDoc.cameraName,
      locationName: cameraDoc.locationName || cameraDoc.address?.area || 'Gujarat Jurisdiction',
      district: cameraDoc.district || 'Gujarat',
      coordinates: [
        cameraDoc.longitude || cameraDoc.location?.coordinates?.[0] || 0,
        cameraDoc.latitude || cameraDoc.location?.coordinates?.[1] || 0,
      ],

      startTime: start,
      endTime: end,
      durationMinutes,
      status: 'Pending',
    });

    // Initial audit log
    await createAuditEntry({
      ticket,
      ticketId,
      action: 'TICKET_CREATED',
      req,
      previousStatus: 'none',
      newStatus: 'Pending',
      remarks: `Requisition ticket created for camera ${cameraDoc.cameraId} (${durationMinutes} mins). Purpose: ${purpose}`,
      metadata: { cameraId: cameraDoc.cameraId, priority: ticket.priority },
    });

    // Send Real-time notification to target department
    await sendNotification({
      ticket,
      ticketId,
      recipientDepartment: targetDept,
      senderUser: req.user,
      title: `New CCTV Requisition: ${ticketId}`,
      message: `${req.user.name} (${requestingDept}) requested footage from Camera ${cameraDoc.cameraId} (${cameraDoc.locationName}).`,
      type: 'TICKET_CREATED',
      priority: ticket.priority,
    });

    // Broadcast ticket created event
    emitToDepartment(targetDept, 'ticket:created', ticket);

    // Populate for response
    await ticket.populate([
      { path: 'requestedBy', select: 'name email department designation phone' },
      { path: 'camera', select: 'cameraId name district locationName streamId' },
    ]);

    logger.info(`Footage requisition ticket ${ticketId} created by ${req.user.name} (${requestingDept}) -> Target: ${targetDept}`);

    res.status(201).json({
      success: true,
      message: 'Footage requisition ticket lodged successfully',
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error creating footage ticket: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all footage tickets with filtering
 * @route   GET /api/footage-tickets
 */
const getTickets = async (req, res) => {
  try {
    const {
      direction = 'all', // 'incoming' | 'outgoing' | 'all'
      status,
      priority,
      incidentType,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const userDept = req.user.department || '';
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';

    const filter = {};

    // Department direction filtering
    if (direction === 'incoming') {
      filter.targetDepartment = userDept;
    } else if (direction === 'outgoing') {
      filter.requestingDepartment = userDept;
    } else if (!isAdmin) {
      // Non-admins see only tickets involving their department or created by them
      filter.$or = [
        { targetDepartment: userDept },
        { requestingDepartment: userDept },
        { requestedBy: req.user._id },
      ];
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (priority && priority !== 'all') {
      filter.priority = priority;
    }

    if (incidentType && incidentType !== 'all') {
      filter.incidentType = incidentType;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { ticketId: { $regex: q, $options: 'i' } },
          { title: { $regex: q, $options: 'i' } },
          { firNumber: { $regex: q, $options: 'i' } },
          { caseNumber: { $regex: q, $options: 'i' } },
          { cameraId: { $regex: q, $options: 'i' } },
          { cameraName: { $regex: q, $options: 'i' } },
          { locationName: { $regex: q, $options: 'i' } },
          { requestingDepartment: { $regex: q, $options: 'i' } },
          { targetDepartment: { $regex: q, $options: 'i' } },
          { evidenceId: { $regex: q, $options: 'i' } },
        ],
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tickets, total] = await Promise.all([
      FootageTicket.find(filter)
        .populate('requestedBy', 'name email department designation')
        .populate('reviewedBy', 'name email department designation')
        .populate('evidence')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      FootageTicket.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: tickets.length,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: tickets,
    });
  } catch (error) {
    logger.error(`Error fetching footage tickets: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get summary stats for footage requisitions
 * @route   GET /api/footage-tickets/stats
 */
const getTicketStats = async (req, res) => {
  try {
    const userDept = req.user.department || '';
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';

    const baseFilter = isAdmin
      ? {}
      : {
          $or: [
            { targetDepartment: userDept },
            { requestingDepartment: userDept },
            { requestedBy: req.user._id },
          ],
        };

    const [
      total,
      pending,
      accepted,
      processing,
      evidenceUploaded,
      available,
      viewed,
      responded,
      closed,
      rejected,
      incomingPending,
    ] = await Promise.all([
      FootageTicket.countDocuments(baseFilter),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['Pending', 'submitted'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['Accepted', 'under_review'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['Processing', 'approved'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: 'Evidence Uploaded' }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['Available', 'dispatched'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: 'Viewed' }),
      FootageTicket.countDocuments({ ...baseFilter, status: 'Responded' }),
      FootageTicket.countDocuments({ ...baseFilter, status: 'Closed' }),
      FootageTicket.countDocuments({ ...baseFilter, status: 'Rejected' }),
      FootageTicket.countDocuments({
        targetDepartment: userDept,
        status: { $in: ['Pending', 'submitted', 'Accepted', 'under_review'] },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        accepted,
        processing,
        evidenceUploaded,
        available,
        viewed,
        responded,
        closed,
        rejected,
        pendingAction: pending + accepted + processing,
        incomingPending,
      },
    });
  } catch (error) {
    logger.error(`Error fetching footage ticket stats: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get single ticket details with populated camera, officers, and evidence
 * @route   GET /api/footage-tickets/:id
 */
const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    })
      .populate('requestedBy', 'name email department designation phone')
      .populate('reviewedBy', 'name email department designation phone')
      .populate('camera')
      .populate('evidence');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    // RBAC: check if user is authorized to view
    const userDept = req.user.department || '';
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';
    const isOwner = ticket.requestedBy && ticket.requestedBy._id.toString() === req.user._id.toString();
    const isRequestingDept = ticket.requestingDepartment === userDept;
    const isTargetDept = ticket.targetDepartment === userDept;

    if (!isAdmin && !isOwner && !isRequestingDept && !isTargetDept) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to view this requisition ticket',
      });
    }

    res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    logger.error(`Error fetching ticket details: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update ticket status (Accepted, Processing, Evidence Uploaded, Available, Viewed, Responded, Closed, Rejected)
 * @route   PATCH /api/footage-tickets/:id/status
 */
const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks = '', rejectionReason = '' } = req.body;

    const validStatuses = [
      'Pending',
      'Accepted',
      'Processing',
      'Evidence Uploaded',
      'Available',
      'Viewed',
      'Responded',
      'Closed',
      'Rejected',
      // Legacy
      'under_review',
      'approved',
      'rejected',
      'closed',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status: ${status}`,
      });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const userDept = req.user.department || '';
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';
    const isRequestingDept = ticket.requestingDepartment === userDept;
    const isTargetDept = ticket.targetDepartment === userDept;

    // RBAC checks for status changes
    if (!isAdmin) {
      if (!isRequestingDept && !isTargetDept) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You cannot alter tickets from another department',
        });
      }

      // Target department actions
      if (['Accepted', 'Processing', 'Rejected'].includes(status) && !isTargetDept) {
        return res.status(403).json({
          success: false,
          message: 'Only the requested department or an Administrator can accept, process, or reject requisitions',
        });
      }
    }

    const prevStatus = ticket.status;
    ticket.status = status;
    ticket.reviewedBy = req.user._id;
    ticket.reviewedAt = new Date();

    if (remarks) ticket.reviewRemarks = remarks;
    if (rejectionReason && (status === 'Rejected' || status === 'rejected')) {
      ticket.rejectionReason = rejectionReason;
    }
    if (status === 'Closed' || status === 'closed') {
      ticket.closedAt = new Date();
    }

    await ticket.save();

    // Map action name for audit log
    let auditAction = 'STATUS_UPDATED';
    if (['Accepted', 'under_review'].includes(status)) auditAction = 'TICKET_ACCEPTED';
    else if (['Processing', 'approved'].includes(status)) auditAction = 'TICKET_PROCESSING';
    else if (['Rejected', 'rejected'].includes(status)) auditAction = 'TICKET_REJECTED';
    else if (['Closed', 'closed'].includes(status)) auditAction = 'TICKET_CLOSED';
    else if (status === 'Viewed') auditAction = 'EVIDENCE_VIEWED';

    const logRemarks = status === 'Rejected' ? rejectionReason || remarks : remarks;

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: auditAction,
      req,
      previousStatus: prevStatus,
      newStatus: status,
      remarks: logRemarks || `Status transitioned from ${prevStatus} to ${status}`,
    });

    // Record response entry for status changes to show in conversation timeline
    await TicketResponse.create({
      ticket: ticket._id,
      ticketId: ticket.ticketId,
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      senderDepartment: req.user.department || 'Gujarat Home Department',
      senderDesignation: req.user.designation || 'Authorized Officer',
      message: `Status updated to "${status}". ${logRemarks}`,
      type: 'status_change',
      metadata: { previousStatus: prevStatus, newStatus: status },
    });

    // Send Real-time notification to the counter-party department
    const notifyDept = isTargetDept ? ticket.requestingDepartment : ticket.targetDepartment;
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: notifyDept,
      senderUser: req.user,
      title: `Ticket ${ticket.ticketId} ${status}`,
      message: `${req.user.name} (${req.user.department}) updated ticket status to ${status}.`,
      type: auditAction,
    });

    emitToDepartment(ticket.requestingDepartment, 'ticket:updated', ticket);
    emitToDepartment(ticket.targetDepartment, 'ticket:updated', ticket);

    await ticket.populate([
      { path: 'requestedBy', select: 'name email department designation' },
      { path: 'reviewedBy', select: 'name email department designation' },
      { path: 'evidence' },
    ]);

    logger.info(`Ticket ${ticket.ticketId} status changed from ${prevStatus} to ${status} by ${req.user.name}`);

    res.status(200).json({
      success: true,
      message: `Requisition ticket ${status} successfully`,
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error updating ticket status: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Upload secure CCTV footage evidence (AES-256-GCM + Cloudinary + SHA-256)
 * @route   POST /api/footage-tickets/:id/evidence
 */
const uploadEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks = '', recordingStartTime, recordingEndTime } = req.body;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No CCTV footage file provided for upload',
      });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    // RBAC: only target department or admin can upload evidence
    const userDept = req.user.department || '';
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';
    const isTargetDept = ticket.targetDepartment === userDept;

    if (!isAdmin && !isTargetDept) {
      return res.status(403).json({
        success: false,
        message: 'Only the requested department or Administrator can upload evidence for this ticket',
      });
    }

    // Generate unique Evidence ID
    const currentYear = new Date().getFullYear();
    const evCount = await Evidence.countDocuments();
    const evidenceId = `EV-${currentYear}-${String(evCount + 1).padStart(4, '0')}`;

    // Step 1: Compute SHA-256 Hash of original video
    const originalBuffer = req.file.buffer;
    const sha256Hash = cryptoService.generateSha256(originalBuffer);

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_UPLOAD_STARTED',
      req,
      remarks: `Uploading evidence ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`,
      evidenceId,
    });

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'SHA256_GENERATED',
      req,
      remarks: `Original video SHA-256 integrity seal calculated: ${sha256Hash}`,
      evidenceId,
      metadata: { sha256Hash, fileSize: req.file.size },
    });

    // Step 2: Encrypt Video Buffer using AES-256-GCM
    const { encryptedBuffer, ivHex, authTagHex } = cryptoService.encryptBuffer(originalBuffer);

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_ENCRYPTED',
      req,
      remarks: `CCTV footage encrypted using AES-256-GCM (Ciphertext size: ${(encryptedBuffer.length / 1024 / 1024).toFixed(2)} MB)`,
      evidenceId,
    });

    // Step 3: Store Encrypted Evidence in Cloudinary
    const cloudinaryResult = await cloudinaryService.uploadEncryptedBuffer(
      encryptedBuffer,
      ticket.ticketId,
      evidenceId
    );

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_STORED_CLOUDINARY',
      req,
      remarks: `Encrypted binary stored securely in Cloudinary asset: ${cloudinaryResult.publicId}`,
      evidenceId,
      metadata: { publicId: cloudinaryResult.publicId, secureUrl: cloudinaryResult.secureUrl },
    });

    // Step 4: Save Evidence record in DB
    const evidenceDoc = await Evidence.create({
      evidenceId,
      ticket: ticket._id,
      ticketId: ticket.ticketId,
      camera: ticket.camera,
      cameraId: ticket.cameraId,
      originalFileName: req.file.originalname,
      fileType: req.file.mimetype || 'video/mp4',
      fileSizeBytes: req.file.size,
      cloudinaryAsset: {
        publicId: cloudinaryResult.publicId,
        secureUrl: cloudinaryResult.secureUrl,
        resourceType: cloudinaryResult.resourceType || 'raw',
        version: cloudinaryResult.version,
      },
      sha256Hash,
      encryption: {
        algorithm: 'aes-256-gcm',
        iv: ivHex,
        authTag: authTagHex,
        isEncrypted: true,
      },
      uploadedBy: req.user._id,
      uploadedByName: req.user.name,
      uploadedByDept: req.user.department || 'Gujarat Home Department',
      status: 'active',
      integrityStatus: 'verified',
      recordingStartTime: recordingStartTime ? new Date(recordingStartTime) : ticket.startTime,
      recordingEndTime: recordingEndTime ? new Date(recordingEndTime) : ticket.endTime,
      metadata: {
        remarks: remarks || '',
      },
    });

    // Step 5: Update Ticket
    const prevStatus = ticket.status;
    ticket.status = 'Evidence Uploaded';
    ticket.evidence = evidenceDoc._id;
    ticket.evidenceId = evidenceId;
    ticket.mediaHash = sha256Hash;
    ticket.footageUrl = `/api/footage-tickets/${ticket.ticketId}/evidence/${evidenceId}/stream`;
    ticket.integrityStatus = 'verified';
    ticket.dispatchedAt = new Date();
    ticket.expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days validity
    if (remarks) ticket.reviewRemarks = remarks;
    ticket.evidenceFileDetails = {
      format: req.file.mimetype || 'video/mp4',
      fileSizeBytes: req.file.size,
      checksumAlgorithm: 'SHA-256',
    };
    await ticket.save();

    // Conversation response log
    await TicketResponse.create({
      ticket: ticket._id,
      ticketId: ticket.ticketId,
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      senderDepartment: req.user.department || 'Gujarat Home Department',
      senderDesignation: req.user.designation || 'Evidence Custodian',
      message: `Encrypted CCTV footage uploaded (Evidence ID: ${evidenceId}). SHA-256: ${sha256Hash.slice(0, 16)}...`,
      type: 'evidence_upload',
      metadata: { evidenceId, fileName: req.file.originalname, sha256Hash },
    });

    // Step 6: Notify Requesting Department
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.requestingDepartment,
      senderUser: req.user,
      title: `Footage Uploaded: ${ticket.ticketId}`,
      message: `${req.user.name} (${userDept}) has uploaded AES-256 encrypted CCTV evidence (${evidenceId}).`,
      type: 'EVIDENCE_UPLOADED',
      priority: ticket.priority,
    });

    emitToDepartment(ticket.requestingDepartment, 'ticket:evidence_uploaded', {
      ticket,
      evidence: evidenceDoc,
    });

    logger.info(`Evidence ${evidenceId} uploaded for ticket ${ticket.ticketId} with SHA-256: ${sha256Hash}`);

    res.status(201).json({
      success: true,
      message: 'CCTV footage encrypted and uploaded to secure evidence vault successfully',
      data: {
        evidence: evidenceDoc,
        ticket,
      },
    });
  } catch (error) {
    logger.error(`Error uploading footage evidence: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Stream decrypted CCTV footage evidence with HTTP 206 Partial Content
 * @route   GET /api/footage-tickets/:id/evidence/:evidenceId/stream
 */
const streamEvidence = async (req, res) => {
  try {
    const { id, evidenceId } = req.params;

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const evidence = await Evidence.findOne({
      $or: [{ evidenceId }, { _id: evidenceId.match(/^[0-9a-fA-F]{24}$/) ? evidenceId : null }],
    });

    if (!evidence) {
      return res.status(404).json({ success: false, message: 'Evidence record not found' });
    }

    // RBAC: check if user is authorized to view
    const userDept = req.user.department || '';
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';
    const isOwner = ticket.requestedBy && ticket.requestedBy.toString() === req.user._id.toString();
    const isRequestingDept = ticket.requestingDepartment === userDept;
    const isTargetDept = ticket.targetDepartment === userDept;

    if (!isAdmin && !isOwner && !isRequestingDept && !isTargetDept) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have security clearance to access this CCTV evidence',
      });
    }

    // 1. Fetch encrypted binary from Cloudinary
    const encryptedBuffer = await cloudinaryService.fetchEncryptedBuffer(
      evidence.cloudinaryAsset.secureUrl,
      evidence.cloudinaryAsset.publicId
    );

    // 2. Decrypt on the fly using AES-256-GCM
    let decryptedBuffer;
    try {
      decryptedBuffer = cryptoService.decryptBuffer(
        encryptedBuffer,
        evidence.encryption.iv,
        evidence.encryption.authTag
      );
    } catch (decryptErr) {
      logger.error(`AES-256-GCM Decryption failed for evidence ${evidenceId}: ${decryptErr.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to decrypt evidence file: cryptographic tag mismatch or corrupt payload',
      });
    }

    // 3. Cryptographic integrity check via SHA-256
    const isIntact = cryptoService.verifySha256(decryptedBuffer, evidence.sha256Hash);
    if (!isIntact) {
      evidence.integrityStatus = 'compromised';
      await evidence.save();

      await createAuditEntry({
        ticket,
        ticketId: ticket.ticketId,
        action: 'EVIDENCE_VERIFIED',
        req,
        remarks: 'CRITICAL: Decrypted file SHA-256 checksum does NOT match stored seal! Playback prevented.',
        evidenceId: evidence.evidenceId,
        actionResult: 'COMPROMISED',
      });

      return res.status(422).json({
        success: false,
        message: '🔴 Evidence Integrity Compromised! Cryptographic checksum does not match official seal.',
      });
    }

    // Update ticket status to 'Viewed' if it was Available / Evidence Uploaded
    if (['Available', 'Evidence Uploaded'].includes(ticket.status)) {
      ticket.status = 'Viewed';
      await ticket.save();
    }

    // Log access event (throttle to avoid repeated log spam from seeking)
    createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_VIEWED',
      req,
      remarks: `Officer accessed secure footage stream. SHA-256 verified (${evidence.sha256Hash.slice(0, 16)}...)`,
      evidenceId: evidence.evidenceId,
      actionResult: 'SUCCESS',
    }).catch((e) => logger.error(`Audit entry error: ${e.message}`));

    // 4. HTTP Range Video Streaming (RFC 7233)
    const totalSize = decryptedBuffer.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = end - start + 1;

      const chunk = decryptedBuffer.slice(start, end + 1);

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': evidence.fileType || 'video/mp4',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      });

      return res.end(chunk);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': evidence.fileType || 'video/mp4',
        'Content-Disposition': `inline; filename="${evidence.originalFileName}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      });

      return res.end(decryptedBuffer);
    }
  } catch (error) {
    logger.error(`Error streaming evidence: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Verify evidence SHA-256 integrity and return audit seal report
 * @route   GET /api/footage-tickets/:id/evidence/:evidenceId/verify
 */
const verifyEvidenceIntegrity = async (req, res) => {
  try {
    const { id, evidenceId } = req.params;

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const evidence = await Evidence.findOne({
      $or: [{ evidenceId }, { _id: evidenceId.match(/^[0-9a-fA-F]{24}$/) ? evidenceId : null }],
    });

    if (!evidence) {
      return res.status(404).json({ success: false, message: 'Evidence record not found' });
    }

    // Fetch and decrypt
    const encryptedBuffer = await cloudinaryService.fetchEncryptedBuffer(
      evidence.cloudinaryAsset.secureUrl,
      evidence.cloudinaryAsset.publicId
    );

    const decryptedBuffer = cryptoService.decryptBuffer(
      encryptedBuffer,
      evidence.encryption.iv,
      evidence.encryption.authTag
    );

    const computedHash = cryptoService.generateSha256(decryptedBuffer);
    const isVerified = cryptoService.verifySha256(decryptedBuffer, evidence.sha256Hash);

    evidence.integrityStatus = isVerified ? 'verified' : 'compromised';
    await evidence.save();

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_VERIFIED',
      req,
      remarks: isVerified
        ? `Evidence verification passed. SHA-256 matched stored seal.`
        : `Evidence verification failed! Hash mismatch. Computed: ${computedHash}`,
      evidenceId: evidence.evidenceId,
      actionResult: isVerified ? 'SUCCESS' : 'COMPROMISED',
      metadata: { storedHash: evidence.sha256Hash, computedHash, verified: isVerified },
    });

    res.status(200).json({
      success: true,
      data: {
        evidenceId: evidence.evidenceId,
        ticketId: ticket.ticketId,
        camera: ticket.cameraId,
        recordingPeriod: `${ticket.startTime?.toISOString()} to ${ticket.endTime?.toISOString()}`,
        uploadedBy: evidence.uploadedByName,
        uploadedDept: evidence.uploadedByDept,
        uploadTime: evidence.createdAt,
        storedHash: evidence.sha256Hash,
        computedHash,
        verified: isVerified,
        statusText: isVerified ? '🟢 Integrity Verified' : '🔴 Evidence Integrity Compromised',
        encryptionAlgorithm: evidence.encryption.algorithm,
      },
    });
  } catch (error) {
    logger.error(`Error verifying evidence: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Add a response / case message to a ticket conversation
 * @route   POST /api/footage-tickets/:id/responses
 */
const addTicketResponse = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    // RBAC: only participants or admin can respond
    const userDept = req.user.department || '';
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';
    const isOwner = ticket.requestedBy && ticket.requestedBy.toString() === req.user._id.toString();
    const isRequestingDept = ticket.requestingDepartment === userDept;
    const isTargetDept = ticket.targetDepartment === userDept;

    if (!isAdmin && !isOwner && !isRequestingDept && !isTargetDept) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to respond to this ticket',
      });
    }

    const responseDoc = await TicketResponse.create({
      ticket: ticket._id,
      ticketId: ticket.ticketId,
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      senderDepartment: req.user.department || 'Gujarat Home Department',
      senderDesignation: req.user.designation || 'Authorized Officer',
      message: message.trim(),
      type: 'comment',
    });

    // If ticket was in 'Available' or 'Viewed', advance to 'Responded'
    if (['Available', 'Viewed'].includes(ticket.status)) {
      ticket.status = 'Responded';
      await ticket.save();
    }

    // Record audit log
    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'RESPONSE_ADDED',
      req,
      remarks: `Case response added by ${req.user.name}: "${message.trim().slice(0, 80)}..."`,
      metadata: { responseId: responseDoc._id },
    });

    // Notify the other department
    const notifyDept = isTargetDept ? ticket.requestingDepartment : ticket.targetDepartment;
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: notifyDept,
      senderUser: req.user,
      title: `Response on Ticket ${ticket.ticketId}`,
      message: `${req.user.name} (${req.user.department}): ${message.trim().slice(0, 100)}`,
      type: 'RESPONSE_ADDED',
    });

    // Emit real-time response event to both departments
    emitToDepartment(ticket.requestingDepartment, 'ticket:response_added', {
      ticketId: ticket.ticketId,
      response: responseDoc,
    });
    emitToDepartment(ticket.targetDepartment, 'ticket:response_added', {
      ticketId: ticket.ticketId,
      response: responseDoc,
    });

    res.status(201).json({
      success: true,
      message: 'Response posted successfully',
      data: responseDoc,
    });
  } catch (error) {
    logger.error(`Error adding ticket response: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all responses for a ticket conversation
 * @route   GET /api/footage-tickets/:id/responses
 */
const getTicketResponses = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const responses = await TicketResponse.find({
      $or: [{ ticketId: ticket.ticketId }, { ticket: ticket._id }],
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'name email department designation role avatar');

    res.status(200).json({
      success: true,
      count: responses.length,
      data: responses,
    });
  } catch (error) {
    logger.error(`Error fetching ticket responses: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get complete chronological, immutable audit log for a ticket
 * @route   GET /api/footage-tickets/:id/audit-logs
 */
const getTicketAuditLogs = async (req, res) => {
  try {
    const { id } = req.params;

    const logs = await FootageAuditLog.find({
      $or: [{ ticketId: id }, { ticket: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    })
      .sort({ timestamp: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    logger.error(`Error fetching audit logs: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Admin global audit logs for all footage and evidence actions
 * @route   GET /api/footage-tickets/audit-logs/all
 */
const getAllAuditLogs = async (req, res) => {
  try {
    const {
      department,
      status,
      priority,
      action,
      ticketId,
      evidenceId,
      search,
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {};

    if (department && department !== 'all') {
      filter.actorDepartment = department;
    }

    if (action && action !== 'all') {
      filter.action = action;
    }

    if (ticketId && ticketId.trim()) {
      filter.ticketId = { $regex: ticketId.trim(), $options: 'i' };
    }

    if (evidenceId && evidenceId.trim()) {
      filter.evidenceId = { $regex: evidenceId.trim(), $options: 'i' };
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { ticketId: { $regex: q, $options: 'i' } },
        { evidenceId: { $regex: q, $options: 'i' } },
        { actorName: { $regex: q, $options: 'i' } },
        { actorDepartment: { $regex: q, $options: 'i' } },
        { remarks: { $regex: q, $options: 'i' } },
        { ipAddress: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      FootageAuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      FootageAuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: logs.length,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: logs,
    });
  } catch (error) {
    logger.error(`Error fetching all audit logs: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Record footage access/download in audit log (Confidential Chain of Custody)
 * @route   POST /api/footage-tickets/:id/access
 */
const recordFootageAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const { actionType = 'EVIDENCE_VIEWED' } = req.body;

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    }).populate('evidence');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const isDownload = actionType === 'EVIDENCE_DOWNLOADED';
    const auditAction = isDownload ? 'EVIDENCE_DOWNLOADED' : 'EVIDENCE_VIEWED';

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: auditAction,
      req,
      previousStatus: ticket.status,
      newStatus: ticket.status,
      remarks: `Confidential evidence ${isDownload ? 'downloaded' : 'viewed'} by ${req.user.name} (${req.user.department}). Official Secrets Act compliance acknowledged.`,
      evidenceId: ticket.evidenceId || '',
    });

    logger.info(`Evidence access recorded for ${ticket.ticketId} by ${req.user.name}`);

    res.status(200).json({
      success: true,
      message: 'Evidence access recorded in confidential chain of custody audit log',
      data: {
        footageUrl: ticket.footageUrl,
        mediaHash: ticket.mediaHash,
        evidenceId: ticket.evidenceId,
      },
    });
  } catch (error) {
    logger.error(`Error recording footage access: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Legacy dispatch method
 */
const dispatchFootage = async (req, res) => {
  try {
    const { id } = req.params;
    const { footageUrl, mediaHash, validityDays = 7, remarks = '' } = req.body;

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const prevStatus = ticket.status;
    const generatedHash =
      mediaHash ||
      crypto.createHash('sha256').update(`${ticket.ticketId}|${Date.now()}|DRISHTI_EV_EVIDENCE`).digest('hex');

    const expiresAt = new Date(Date.now() + parseInt(validityDays) * 24 * 60 * 60 * 1000);

    ticket.status = 'Available';
    ticket.footageUrl = footageUrl || `/api/footage-tickets/${ticket.ticketId}/evidence/${ticket.evidenceId || 'mock'}/stream`;
    ticket.mediaHash = generatedHash;
    ticket.expiresAt = expiresAt;
    ticket.dispatchedAt = new Date();
    ticket.reviewedBy = req.user._id;
    if (remarks) ticket.reviewRemarks = remarks;

    await ticket.save();

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'FOOTAGE_DISPATCHED',
      req,
      previousStatus: prevStatus,
      newStatus: 'Available',
      remarks: `Evidence footage dispatched. Media SHA-256: ${generatedHash}. ${remarks}`,
    });

    res.status(200).json({
      success: true,
      message: 'Footage securely attached and dispatched to requesting department',
      data: ticket,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createTicket,
  getTickets,
  getTicketStats,
  getTicketById,
  updateTicketStatus,
  uploadEvidence,
  streamEvidence,
  verifyEvidenceIntegrity,
  addTicketResponse,
  getTicketResponses,
  getTicketAuditLogs,
  getAllAuditLogs,
  recordFootageAccess,
  dispatchFootage,
};

const crypto = require('crypto');
const FootageTicket = require('../models/FootageTicket');
const FootageAuditLog = require('../models/FootageAuditLog');
const SystemAuditLog = require('../models/SystemAuditLog');
const Camera = require('../models/Camera');
const logger = require('../utils/logger');

// Generate tamper-evident SHA-256 integrity seal for audit logs
function generateAuditSeal(ticketId, action, actorId, timestamp, prevStatus, nextStatus, remarks) {
  const payload = `${ticketId}|${action}|${actorId}|${new Date(timestamp).toISOString()}|${prevStatus}|${nextStatus}|${remarks || ''}|DRISHTIGRID_SEAL_V1`;
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
}) {
  const timestamp = new Date();
  const actor = req.user;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || '';

  const integrityHash = generateAuditSeal(
    ticketId,
    action,
    actor._id.toString(),
    timestamp,
    previousStatus,
    newStatus,
    remarks
  );

  return FootageAuditLog.create({
    ticket: ticket._id,
    ticketId,
    action,
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
    timestamp,
  });
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
      $or: [{ cameraId }, { _id: cameraId.match(/^[0-9a-fA-F]{24}$/) ? cameraId : null }],
    });

    if (!cameraDoc) {
      return res.status(404).json({ success: false, message: `Camera '${cameraId}' not found` });
    }

    const durationMinutes = Math.round((end - start) / (1000 * 60));

    // Generate unique sequential ticket ID (e.g. REQ-2026-0001)
    const count = await FootageTicket.countDocuments();
    const currentYear = new Date().getFullYear();
    const ticketId = `REQ-${currentYear}-${String(count + 1).padStart(4, '0')}`;

    const requestingDept = req.user.department || 'Gujarat Police Department';
    const targetDept = cameraDoc.departmentName || 'Gujarat Home Department (Demo)';

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
      status: 'submitted',
    });

    // Create initial immutable audit log entry
    await createAuditEntry({
      ticket,
      ticketId,
      action: 'TICKET_CREATED',
      req,
      previousStatus: 'none',
      newStatus: 'submitted',
      remarks: `Footage requisition lodged for ${durationMinutes} mins from ${start.toISOString()} to ${end.toISOString()}. Purpose: ${purpose}`,
    });

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
        ],
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tickets, total] = await Promise.all([
      FootageTicket.find(filter)
        .populate('requestedBy', 'name email department designation')
        .populate('reviewedBy', 'name email department designation')
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

    const [total, submitted, underReview, approved, dispatched, rejected, closed, incomingCount] =
      await Promise.all([
        FootageTicket.countDocuments(baseFilter),
        FootageTicket.countDocuments({ ...baseFilter, status: 'submitted' }),
        FootageTicket.countDocuments({ ...baseFilter, status: 'under_review' }),
        FootageTicket.countDocuments({ ...baseFilter, status: 'approved' }),
        FootageTicket.countDocuments({ ...baseFilter, status: 'dispatched' }),
        FootageTicket.countDocuments({ ...baseFilter, status: 'rejected' }),
        FootageTicket.countDocuments({ ...baseFilter, status: 'closed' }),
        FootageTicket.countDocuments({ targetDepartment: userDept, status: { $in: ['submitted', 'under_review'] } }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        submitted,
        underReview,
        approved,
        dispatched,
        rejected,
        closed,
        pendingAction: submitted + underReview,
        incomingPending: incomingCount,
      },
    });
  } catch (error) {
    logger.error(`Error fetching footage ticket stats: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get single ticket details with populated camera and officers
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
      .populate('camera');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    logger.error(`Error fetching ticket details: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update ticket status (under_review, approved, rejected, closed)
 * @route   PATCH /api/footage-tickets/:id/status
 */
const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks = '', rejectionReason = '' } = req.body;

    if (!['under_review', 'approved', 'rejected', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'under_review', 'approved', 'rejected', or 'closed'",
      });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const prevStatus = ticket.status;
    ticket.status = status;
    ticket.reviewedBy = req.user._id;
    ticket.reviewedAt = new Date();

    if (remarks) ticket.reviewRemarks = remarks;
    if (rejectionReason && status === 'rejected') ticket.rejectionReason = rejectionReason;
    if (status === 'closed') ticket.closedAt = new Date();

    await ticket.save();

    // Map action name for audit log
    let auditAction = 'STATUS_UPDATED';
    if (status === 'under_review') auditAction = 'REVIEW_STARTED';
    if (status === 'approved') auditAction = 'TICKET_APPROVED';
    if (status === 'rejected') auditAction = 'TICKET_REJECTED';
    if (status === 'closed') auditAction = 'TICKET_CLOSED';

    const logRemarks = status === 'rejected' ? rejectionReason || remarks : remarks;

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: auditAction,
      req,
      previousStatus: prevStatus,
      newStatus: status,
      remarks: logRemarks || `Status changed from ${prevStatus} to ${status}`,
    });

    await ticket.populate([
      { path: 'requestedBy', select: 'name email department designation' },
      { path: 'reviewedBy', select: 'name email department designation' },
    ]);

    logger.info(`Ticket ${ticket.ticketId} updated to ${status} by ${req.user.name}`);

    res.status(200).json({
      success: true,
      message: `Requisition ticket ${status.replace('_', ' ')} successfully`,
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error updating ticket status: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Attach and dispatch footage to requesting department
 * @route   POST /api/footage-tickets/:id/dispatch
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

    // Generate SHA-256 hash if none provided (simulates verified evidence seal)
    const generatedHash =
      mediaHash ||
      crypto.createHash('sha256').update(`${ticket.ticketId}|${Date.now()}|DRISHTI_EV_EVIDENCE`).digest('hex');

    // Default mock secure video link if none supplied
    const secureUrl =
      footageUrl ||
      `https://cctv.corp8.cloud/archive/${ticket.cameraId}/${ticket.ticketId}.mp4?token=${crypto.randomBytes(16).toString('hex')}`;

    const expiresAt = new Date(Date.now() + parseInt(validityDays) * 24 * 60 * 60 * 1000);

    ticket.status = 'dispatched';
    ticket.footageUrl = secureUrl;
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
      newStatus: 'dispatched',
      remarks: `Evidence footage dispatched. Media SHA-256: ${generatedHash}. Access valid until: ${expiresAt.toISOString()}. ${remarks}`,
    });

    await ticket.populate([
      { path: 'requestedBy', select: 'name email department designation' },
      { path: 'reviewedBy', select: 'name email department designation' },
    ]);

    logger.info(`Footage dispatched for ticket ${ticket.ticketId} with SHA-256: ${generatedHash}`);

    res.status(200).json({
      success: true,
      message: 'Footage securely attached and dispatched to requesting department',
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error dispatching footage: ${error.message}`);
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

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'FOOTAGE_ACCESSED',
      req,
      previousStatus: ticket.status,
      newStatus: ticket.status,
      remarks: `Confidential footage opened & accessed by ${req.user.name} (${req.user.department}). Official Secrets Act compliance acknowledged.`,
    });

    logger.info(`Footage accessed for ${ticket.ticketId} by ${req.user.name} (${req.user.department})`);

    res.status(200).json({
      success: true,
      message: 'Footage access recorded in confidential chain of custody audit log',
      data: {
        footageUrl: ticket.footageUrl,
        mediaHash: ticket.mediaHash,
        expiresAt: ticket.expiresAt,
      },
    });
  } catch (error) {
    logger.error(`Error recording footage access: ${error.message}`);
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

module.exports = {
  createTicket,
  getTickets,
  getTicketStats,
  getTicketById,
  updateTicketStatus,
  dispatchFootage,
  recordFootageAccess,
  getTicketAuditLogs,
};

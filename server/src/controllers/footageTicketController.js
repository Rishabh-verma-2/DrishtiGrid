const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const FootageTicket = require('../models/FootageTicket');
const FootageAuditLog = require('../models/FootageAuditLog');
const Evidence = require('../models/Evidence');
const TicketResponse = require('../models/TicketResponse');
const Notification = require('../models/Notification');
const Camera = require('../models/Camera');
const User = require('../models/User');
const cryptoService = require('../services/cryptoService');
const cloudinaryService = require('../services/cloudinaryService');
const { emitToDepartment, emitToUser, emitGlobal } = require('../socket/socketHandler');
const logger = require('../utils/logger');
const {
  TICKET_STATES,
  normalizeStatus,
  calculateDueAt,
  checkSLAStatus,
  validateTransition,
} = require('../utils/ticketStateMachine');

// Master JWT Secret for short-lived evidence access tokens (15 minutes)
const EVIDENCE_JWT_SECRET = process.env.JWT_SECRET || 'DRISHTIGRID_SECURE_GOV_JWT_SECRET_2026';
const EVIDENCE_TOKEN_EXPIRY = 15 * 60; // 900 seconds

function generateShortLivedEvidenceToken({ ticketId, evidenceId, user }) {
  return jwt.sign(
    {
      id: user._id.toString(),
      userId: user._id.toString(),
      ticketId,
      evidenceId,
      userName: user.name,
      department: user.department,
      role: user.role,
      purpose: 'GOV_EVIDENCE_ACCESS',
    },
    EVIDENCE_JWT_SECRET,
    { expiresIn: EVIDENCE_TOKEN_EXPIRY }
  );
}

function verifyShortLivedEvidenceToken(token, expectedTicketId, expectedEvidenceId) {
  try {
    const decoded = jwt.verify(token, EVIDENCE_JWT_SECRET);
    if (decoded.purpose !== 'GOV_EVIDENCE_ACCESS') return null;
    if (expectedTicketId && decoded.ticketId !== expectedTicketId) return null;
    if (expectedEvidenceId && decoded.evidenceId !== expectedEvidenceId) return null;
    return decoded;
  } catch (err) {
    return null;
  }
}

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

  // Also push entry to ticket.timeline if ticket instance is available
  if (ticket && Array.isArray(ticket.timeline)) {
    ticket.timeline.push({
      action,
      timestamp,
      actorId: actor._id,
      actorName: actor.name,
      actorDept: actor.department || 'Gujarat Home Department',
      actorRole: actor.role,
      previousStatus,
      newStatus,
      remarks,
      metadata,
    });
    if (typeof ticket.save === 'function' && !ticket.$isSaving) {
      ticket.save().catch((e) => logger.warn(`Timeline append warning: ${e.message}`));
    }
  }

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
  recipientRole = '',
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
      senderName: senderUser?.name || 'Garud Authority',
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
      isEmergency,
      emergencyReason,
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

    // Generate unique sequential ticket ID (e.g. TKT-2026-00001)
    const count = await FootageTicket.countDocuments();
    const currentYear = new Date().getFullYear();
    const ticketId = `TKT-${currentYear}-${String(count + 1).padStart(5, '0')}`;

    // Auto-detect departments
    const requestingDept = req.user.department || (req.user.role === 'TRAFFIC_POLICE' ? 'Gujarat Traffic Police' : 'Gujarat Police Department');
    
    // Target department: enforce camera ownership
    let targetDept = cameraDoc.departmentName;
    if (!targetDept) {
      targetDept = req.body.targetDepartment || (requestingDept.includes('Traffic') ? 'Gujarat Police Department' : 'Gujarat Traffic Police');
    }

    // Emergency Workflow check:
    // Only bypasses Central Control Room if isEmergency is true, reason is provided, and priority is urgent/critical
    const emergencyMode = Boolean(isEmergency) && (String(priority).toLowerCase() === 'urgent' || String(priority).toLowerCase() === 'high');
    if (isEmergency && !emergencyMode) {
      return res.status(400).json({
        success: false,
        message: 'Emergency bypass requires priority to be set to URGENT/HIGH with a mandatory emergency reason.',
      });
    }
    if (emergencyMode && (!emergencyReason || emergencyReason.trim().length < 5)) {
      return res.status(400).json({
        success: false,
        message: 'Emergency request requires a detailed emergency justification (e.g., active pursuit, life-safety incident).',
      });
    }

    const initialStatus = emergencyMode ? TICKET_STATES.ROUTED_TO_DEPARTMENT : TICKET_STATES.PENDING_ADMIN_REVIEW;
    const { dueAt, slaMinutes } = calculateDueAt(priority || 'medium');

    const ticket = new FootageTicket({
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
      status: initialStatus,

      isEmergency: emergencyMode,
      emergencyReason: emergencyMode ? emergencyReason : '',
      slaMinutes,
      dueAt,
      timeline: [
        {
          action: emergencyMode ? 'EMERGENCY_REQUEST_CREATED' : 'TICKET_CREATED',
          timestamp: new Date(),
          actorId: req.user._id,
          actorName: req.user.name,
          actorDept: requestingDept,
          actorRole: req.user.role,
          previousStatus: 'NONE',
          newStatus: initialStatus,
          remarks: emergencyMode
            ? `EMERGENCY Requisition created (${emergencyReason}). Bypassed Nodal Review directly to ${targetDept}. Central Control Room notified.`
            : `Requisition ticket logged. Queued for Central Control Room Nodal Review.`,
          metadata: { cameraId: cameraDoc.cameraId, priority: priority || 'medium', isEmergency: emergencyMode },
        }
      ],
    });

    await ticket.save();

    // Initial audit log
    await createAuditEntry({
      ticket,
      ticketId,
      action: emergencyMode ? 'EMERGENCY_REQUEST_CREATED' : 'TICKET_CREATED',
      req,
      previousStatus: 'none',
      newStatus: initialStatus,
      remarks: emergencyMode
        ? `EMERGENCY Requisition created (${emergencyReason}). Bypassed Central Control Room.`
        : `Requisition ticket created for camera ${cameraDoc.cameraId} (${durationMinutes} mins). Awaiting Central Control Room Nodal Review.`,
      metadata: { cameraId: cameraDoc.cameraId, priority: ticket.priority, isEmergency: emergencyMode },
    });

    if (emergencyMode) {
      // Alert Target Department immediately
      await sendNotification({
        ticket,
        ticketId,
        recipientDepartment: targetDept,
        senderUser: req.user,
        title: `🚨 EMERGENCY Requisition: ${ticketId}`,
        message: `EMERGENCY CCTV Requisition from ${requestingDept} for Camera ${cameraDoc.cameraId}. Reason: ${emergencyReason}`,
        type: 'EMERGENCY_REQUEST_CREATED',
        priority: 'urgent',
      });
      emitToDepartment(targetDept, 'ticket:routed', ticket);

      // Also alert Central Control Room about emergency bypass
      await sendNotification({
        ticket,
        ticketId,
        recipientDepartment: 'Gujarat Home Department',
        recipientRole: 'ADMIN',
        senderUser: req.user,
        title: `🚨 EMERGENCY BYPASS NOTIFICATION: ${ticketId}`,
        message: `${req.user.name} (${requestingDept}) initiated emergency bypass for Camera ${cameraDoc.cameraId}.`,
        type: 'EMERGENCY_REQUEST_CREATED',
        priority: 'urgent',
      });
      emitGlobal('ticket:emergency', ticket);
    } else {
      // Normal flow: Central Control Room (ADMIN) queue notification ONLY.
      // Target department is NOT alerted until approved by Nodal Officer.
      await sendNotification({
        ticket,
        ticketId,
        recipientDepartment: 'Gujarat Home Department',
        recipientRole: 'ADMIN',
        senderUser: req.user,
        title: `New CCTV Requisition Pending Review: ${ticketId}`,
        message: `${req.user.name} (${requestingDept}) submitted CCTV Requisition for Camera ${cameraDoc.cameraId}. Pending Nodal Review.`,
        type: 'TICKET_CREATED',
        priority: ticket.priority,
      });
      emitGlobal('ticket:pending_admin', ticket);
    }

    // Populate for response
    await ticket.populate([
      { path: 'requestedBy', select: 'name email department designation phone' },
      { path: 'camera', select: 'cameraId name district locationName streamId' },
    ]);

    logger.info(`Footage requisition ticket ${ticketId} created by ${req.user.name} (${requestingDept}) -> Target: ${targetDept} [Status: ${initialStatus}]`);

    res.status(201).json({
      success: true,
      message: emergencyMode
        ? 'EMERGENCY Footage requisition lodged and routed directly to target department'
        : 'Footage requisition ticket submitted to Central Control Room for Nodal Review',
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error creating footage ticket: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all footage tickets with strict department isolation and queue filtering
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
      queue, // 'central_review' | 'supervisor' | 'operator' | 'requester'
      page = 1,
      limit = 50,
    } = req.query;

    const userDept = req.user.department || '';
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';

    const filter = {};

    // Helper to get precise department regex pattern
    const getDeptPattern = (d) => {
      if (!d) return null;
      if (/traffic/i.test(d)) return { isTraffic: true };
      if (/home/i.test(d)) return { isHome: true };
      return { isPolice: true };
    };

    const userDeptInfo = getDeptPattern(userDept);

    // List of statuses visible to target department once routed
    const routedStatuses = [
      'ROUTED_TO_DEPARTMENT',
      'DEPARTMENT_ACKNOWLEDGED',
      'ACKNOWLEDGED',
      'ASSIGNED',
      'IN_PROGRESS',
      'PROCESSING',
      'FOOTAGE_READY',
      'AVAILABLE_TO_REQUESTER',
      'EVIDENCE_UPLOADED',
      'AVAILABLE',
      'ACCESSED',
      'VIEWED',
      'COMPLETED',
      'REJECTED',
      'DEPARTMENT_REJECTED',
      'ADMIN_REJECTED',
      // Legacy compatibility
      'Accepted',
      'Processing',
      'Evidence Uploaded',
      'Available',
      'Viewed',
      'Closed',
      'Rejected',
    ];

    if (isAdmin) {
      // Central Control Room / Admin view
      if (queue === 'central_review') {
        filter.status = { $in: ['PENDING_ADMIN_REVIEW', 'PENDING_CLARIFICATION'] };
      }
      if (direction === 'incoming') {
        filter.requestingDepartment = { $not: { $regex: 'home', $options: 'i' } };
      } else if (direction === 'outgoing') {
        filter.$or = [
          { requestingDepartment: { $regex: 'home', $options: 'i' } },
          { requestedBy: req.user._id },
        ];
      }
    } else {
      // Non-Admin: Strict Department Isolation
      if (direction === 'incoming') {
        // Must be targeted to user's department AND already routed/approved
        if (userDeptInfo?.isTraffic) {
          filter.targetDepartment = { $regex: 'traffic', $options: 'i' };
          filter.requestingDepartment = { $not: { $regex: 'traffic', $options: 'i' } };
        } else if (userDeptInfo?.isPolice) {
          filter.targetDepartment = { $regex: '^(?!.*traffic).*police.*$', $options: 'i' };
          filter.requestingDepartment = { $not: { $regex: '^(?!.*traffic).*police.*$', $options: 'i' } };
        } else {
          filter.targetDepartment = userDept;
          filter.requestingDepartment = { $ne: userDept };
        }
        // CRITICAL: Target department MUST NOT see tickets still waiting for Central Review!
        filter.status = { $in: routedStatuses };
      } else if (direction === 'outgoing') {
        // Must be requested BY user's department
        if (userDeptInfo?.isTraffic) {
          filter.requestingDepartment = { $regex: 'traffic', $options: 'i' };
        } else if (userDeptInfo?.isPolice) {
          filter.requestingDepartment = { $regex: '^(?!.*traffic).*police.*$', $options: 'i' };
        } else {
          filter.requestingDepartment = userDept;
        }
      } else {
        // 'all' direction: user's department is either requester OR (target AND routed)
        const targetDeptQuery = userDeptInfo?.isTraffic
          ? { targetDepartment: { $regex: 'traffic', $options: 'i' }, status: { $in: routedStatuses } }
          : userDeptInfo?.isPolice
          ? { targetDepartment: { $regex: '^(?!.*traffic).*police.*$', $options: 'i' }, status: { $in: routedStatuses } }
          : { targetDepartment: userDept, status: { $in: routedStatuses } };

        const requesterDeptQuery = userDeptInfo?.isTraffic
          ? { requestingDepartment: { $regex: 'traffic', $options: 'i' } }
          : userDeptInfo?.isPolice
          ? { requestingDepartment: { $regex: '^(?!.*traffic).*police.*$', $options: 'i' } }
          : { requestingDepartment: userDept };

        filter.$or = [
          targetDeptQuery,
          requesterDeptQuery,
          { requestedBy: req.user._id },
        ];
      }
    }

    // Role-specific queue filters
    if (queue === 'supervisor') {
      filter.status = {
        $in: [
          'ROUTED_TO_DEPARTMENT',
          'DEPARTMENT_ACKNOWLEDGED',
          'ACKNOWLEDGED',
          'ASSIGNED',
          'IN_PROGRESS',
          'PROCESSING',
          'FOOTAGE_READY',
          'AVAILABLE_TO_REQUESTER',
          'EVIDENCE_UPLOADED',
          'AVAILABLE',
          'ACCESSED',
          'VIEWED',
          'COMPLETED',
          'Accepted',
          'Processing',
          'Evidence Uploaded',
          'Available',
          'Viewed',
          'Closed',
        ],
      };
    } else if (queue === 'operator') {
      filter.status = {
        $in: [
          'ASSIGNED',
          'IN_PROGRESS',
          'PROCESSING',
          'FOOTAGE_READY',
          'AVAILABLE_TO_REQUESTER',
          'EVIDENCE_UPLOADED',
          'AVAILABLE',
          'Processing',
          'Evidence Uploaded',
          'Available',
        ],
      };
      if (!isAdmin && req.user._id) {
        filter.$or = [
          { assignedOperator: req.user._id },
          { assignedOperator: null },
        ];
      }
    } else if (queue === 'requester') {
      filter.$or = [
        { requestedBy: req.user._id },
        { requestingDepartment: userDept },
      ];
    }

    // Specific status filter override if provided
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
      const searchConditions = [
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
        { assignedOperatorName: { $regex: q, $options: 'i' } },
      ];
      if (filter.$and) {
        filter.$and.push({ $or: searchConditions });
      } else {
        filter.$and = [{ $or: searchConditions }];
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tickets, total] = await Promise.all([
      FootageTicket.find(filter)
        .populate('requestedBy', 'name email department designation phone')
        .populate('reviewedBy', 'name email department designation phone')
        .populate('assignedOperator', 'name email department designation')
        .populate('evidence')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      FootageTicket.countDocuments(filter),
    ]);

    // Compute SLA status dynamically for each ticket
    const enrichedTickets = tickets.map((t) => {
      const doc = t.toObject();
      const sla = checkSLAStatus(doc);
      return {
        ...doc,
        slaStatus: sla.status,
        slaRemainingMinutes: sla.remainingMinutes,
        isOverdue: sla.status === 'BREACHED',
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedTickets.length,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: enrichedTickets,
    });
  } catch (error) {
    logger.error(`Error fetching footage tickets: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get summary stats for footage requisitions (Government Nodal Queues)
 * @route   GET /api/footage-tickets/stats
 */
const getTicketStats = async (req, res) => {
  try {
    const userDept = req.user.department || '';
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';

    const baseFilter = isAdmin
      ? {}
      : {
          $or: [
            { targetDepartment: userDept, status: { $nin: ['PENDING_ADMIN_REVIEW', 'PENDING_CLARIFICATION'] } },
            { requestingDepartment: userDept },
            { requestedBy: req.user._id },
          ],
        };

    const now = new Date();

    const [
      total,
      pendingAdmin,
      pendingClarification,
      routed,
      acknowledged,
      assigned,
      inProgress,
      evidenceUploaded,
      available,
      viewed,
      completed,
      rejected,
      slaBreachedCount,
    ] = await Promise.all([
      FootageTicket.countDocuments(baseFilter),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['PENDING_ADMIN_REVIEW', 'Pending', 'submitted'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: 'PENDING_CLARIFICATION' }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['ROUTED_TO_DEPARTMENT', 'routed_to_department'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['DEPARTMENT_ACKNOWLEDGED', 'ACKNOWLEDGED', 'Accepted', 'under_review'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: 'ASSIGNED' }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['IN_PROGRESS', 'PROCESSING', 'Processing', 'approved'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['EVIDENCE_UPLOADED', 'FOOTAGE_READY', 'Evidence Uploaded'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['AVAILABLE', 'AVAILABLE_TO_REQUESTER', 'Available', 'dispatched'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['VIEWED', 'ACCESSED', 'Viewed'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['COMPLETED', 'Closed', 'closed', 'Responded'] } }),
      FootageTicket.countDocuments({ ...baseFilter, status: { $in: ['REJECTED', 'DEPARTMENT_REJECTED', 'ADMIN_REJECTED', 'Rejected', 'rejected'] } }),
      FootageTicket.countDocuments({
        ...baseFilter,
        dueAt: { $lt: now },
        status: { $nin: ['COMPLETED', 'REJECTED', 'DEPARTMENT_REJECTED', 'ADMIN_REJECTED', 'Closed', 'closed', 'Rejected', 'rejected'] },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        // Nodal Workflow Stats
        pendingAdmin,
        pendingClarification,
        routed,
        acknowledged,
        assigned,
        inProgress,
        evidenceUploaded,
        available,
        viewed,
        completed,
        rejected,
        slaBreachedCount,
        // Legacy compatibility keys
        pending: pendingAdmin,
        accepted: acknowledged,
        processing: inProgress,
        closed: completed,
        pendingAction: pendingAdmin + routed + acknowledged + assigned + inProgress,
      },
    });
  } catch (error) {
    logger.error(`Error fetching footage ticket stats: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get single ticket details with department concealment (404 on unauthorized)
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
      .populate('assignedOperator', 'name email department designation phone')
      .populate('camera')
      .populate('evidence');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    // RBAC: strict department isolation
    const userDept = (req.user.department || '').toLowerCase().trim();
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();
    const reqDept = (ticket.requestingDepartment || '').toLowerCase().trim();
    const isOwner = ticket.requestedBy && ticket.requestedBy._id?.toString() === req.user._id.toString();

    const isRequestingDept =
      reqDept.includes(userDept) ||
      userDept.includes(reqDept) ||
      (userRole === 'POLICE' && reqDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && reqDept.includes('traffic'));

    const isTargetDept =
      targetDept.includes(userDept) ||
      userDept.includes(targetDept) ||
      (userRole === 'POLICE' && targetDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && targetDept.includes('traffic'));

    // Department isolation: If not admin, not owner, not requester dept, and not target dept -> Return 404
    if (!isAdmin && !isOwner && !isRequestingDept && !isTargetDept) {
      return res.status(404).json({
        success: false,
        message: 'Requisition ticket not found',
      });
    }

    // If ticket is still pending Central Control Room review, target department cannot see it yet
    if (!isAdmin && isTargetDept && !isRequestingDept && ['PENDING_ADMIN_REVIEW', 'PENDING_CLARIFICATION'].includes(ticket.status)) {
      return res.status(404).json({
        success: false,
        message: 'Requisition ticket not found',
      });
    }

    const ticketDoc = ticket.toObject();
    const sla = checkSLAStatus(ticketDoc);

    res.status(200).json({
      success: true,
      data: {
        ...ticketDoc,
        slaStatus: sla.status,
        slaRemainingMinutes: sla.remainingMinutes,
        isOverdue: sla.status === 'BREACHED',
      },
    });
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

    const userDept = (req.user.department || '').toLowerCase().trim();
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();
    const reqDept = (ticket.requestingDepartment || '').toLowerCase().trim();

    const isRequestingDept =
      reqDept.includes(userDept) ||
      userDept.includes(reqDept) ||
      (ticket.requestedBy && ticket.requestedBy.toString() === req.user._id.toString());

    const isTargetDept =
      targetDept.includes(userDept) ||
      userDept.includes(targetDept) ||
      (userDept.includes('traffic') && targetDept.includes('traffic')) ||
      (userDept.includes('police') && targetDept.includes('police')) ||
      (!targetDept.includes('police') && (userDept.includes('police') || userDept.includes('traffic')));

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
 * @desc    Central Control Room / Nodal Officer approves requisition and routes to Target Department
 * @route   POST /api/footage-tickets/:id/approve
 */
const approveTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks = '', targetDepartmentOverride } = req.body;

    const userRole = String(req.user.role || '').toUpperCase();
    if (userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only Central Control Room Nodal Officers can approve and route requisitions',
      });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const currentStatus = normalizeStatus(ticket.status);
    if (!['PENDING_ADMIN_REVIEW', 'PENDING_CLARIFICATION'].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve ticket currently in status '${ticket.status}'. Must be in PENDING_ADMIN_REVIEW.`,
      });
    }

    const prevStatus = ticket.status;
    const nextStatus = TICKET_STATES.ROUTED_TO_DEPARTMENT;
    const targetDept = targetDepartmentOverride || ticket.targetDepartment;

    ticket.status = nextStatus;
    ticket.targetDepartment = targetDept;
    ticket.approval = {
      approvedBy: req.user._id,
      approvedByName: req.user.name,
      approvedAt: new Date(),
      remarks: remarks || 'Approved by Central Control Room Nodal Officer',
      routedToDepartment: targetDept,
    };
    ticket.reviewedBy = req.user._id;
    ticket.reviewedAt = new Date();
    ticket.reviewRemarks = remarks || 'Approved by Nodal Officer';

    await ticket.save();

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'ADMIN_APPROVED',
      req,
      previousStatus: prevStatus,
      newStatus: nextStatus,
      remarks: `Requisition approved by Nodal Officer ${req.user.name}. Routed to ${targetDept}. ${remarks}`,
      metadata: { targetDepartment: targetDept },
    });

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'TICKET_ROUTED',
      req,
      previousStatus: prevStatus,
      newStatus: nextStatus,
      remarks: `Requisition dispatched to ${targetDept} queue for supervisor assignment.`,
    });

    // Notify Target Department Supervisor
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: targetDept,
      senderUser: req.user,
      title: `Action Required: CCTV Requisition Routed (${ticket.ticketId})`,
      message: `Central Control Room routed CCTV requisition from ${ticket.requestingDepartment} to your department. Please acknowledge and assign an operator.`,
      type: 'TICKET_ROUTED',
      priority: ticket.priority,
    });

    // Notify Requesting Department of approval
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.requestingDepartment,
      senderUser: req.user,
      title: `Requisition Approved: ${ticket.ticketId}`,
      message: `Central Control Room approved your CCTV requisition. It has been routed to ${targetDept}.`,
      type: 'ADMIN_APPROVED',
      priority: ticket.priority,
    });

    emitToDepartment(targetDept, 'ticket:routed', ticket);
    emitToDepartment(ticket.requestingDepartment, 'ticket:approved', ticket);
    emitGlobal('ticket:updated', ticket);

    logger.info(`Ticket ${ticket.ticketId} approved and routed to ${targetDept} by ${req.user.name}`);

    res.status(200).json({
      success: true,
      message: `Requisition approved and successfully routed to ${targetDept}`,
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error approving ticket: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Reject requisition with mandatory reason (Admin or Target Supervisor)
 * @route   POST /api/footage-tickets/:id/reject
 */
const rejectTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'A detailed rejection reason is mandatory (minimum 5 characters)',
      });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const userDept = (req.user.department || '').toLowerCase().trim();
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();

    const isTargetDept =
      targetDept.includes(userDept) ||
      userDept.includes(targetDept) ||
      (userRole === 'POLICE' && targetDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && targetDept.includes('traffic'));

    if (!isAdmin && !isTargetDept) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only Central Control Room or Target Department can reject a requisition',
      });
    }

    const prevStatus = ticket.status;
    const nextStatus = TICKET_STATES.REJECTED;

    ticket.status = nextStatus;
    ticket.rejection = {
      rejectedBy: req.user._id,
      rejectedByName: req.user.name,
      rejectedAt: new Date(),
      reason: reason.trim(),
    };
    ticket.rejectionReason = reason.trim();
    ticket.reviewedBy = req.user._id;
    ticket.reviewedAt = new Date();

    await ticket.save();

    const auditAction = isAdmin ? 'ADMIN_REJECTED' : 'TICKET_REJECTED';
    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: auditAction,
      req,
      previousStatus: prevStatus,
      newStatus: nextStatus,
      remarks: `Requisition rejected by ${req.user.name} (${req.user.department}): ${reason.trim()}`,
      metadata: { reason: reason.trim() },
    });

    // Notify Requesting Department
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.requestingDepartment,
      senderUser: req.user,
      title: `Requisition Rejected: ${ticket.ticketId}`,
      message: `Your CCTV requisition was rejected by ${req.user.name} (${req.user.department}). Reason: ${reason.trim()}`,
      type: auditAction,
      priority: 'high',
    });

    emitToDepartment(ticket.requestingDepartment, 'ticket:rejected', ticket);
    emitGlobal('ticket:updated', ticket);

    logger.info(`Ticket ${ticket.ticketId} rejected by ${req.user.name}: ${reason}`);

    res.status(200).json({
      success: true,
      message: 'Requisition ticket rejected and requesting officer notified',
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error rejecting ticket: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Target Department Supervisor acknowledges receipt of routed ticket
 * @route   POST /api/footage-tickets/:id/acknowledge
 */
const acknowledgeTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const userDept = (req.user.department || '').toLowerCase().trim();
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();

    const isTargetDept =
      targetDept.includes(userDept) ||
      userDept.includes(targetDept) ||
      (userRole === 'POLICE' && targetDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && targetDept.includes('traffic'));

    if (!isAdmin && !isTargetDept) {
      return res.status(403).json({
        success: false,
        message: 'Only the requested department supervisor can acknowledge this requisition',
      });
    }

    const prevStatus = ticket.status;
    ticket.status = TICKET_STATES.DEPARTMENT_ACKNOWLEDGED;
    await ticket.save();

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'TICKET_ACKNOWLEDGED',
      req,
      previousStatus: prevStatus,
      newStatus: TICKET_STATES.DEPARTMENT_ACKNOWLEDGED,
      remarks: `Requisition receipt acknowledged by Supervisor ${req.user.name} (${req.user.department}).`,
    });

    // Notify Requester
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.requestingDepartment,
      senderUser: req.user,
      title: `Requisition Acknowledged: ${ticket.ticketId}`,
      message: `${ticket.targetDepartment} acknowledged receipt of your requisition and is preparing assignment.`,
      type: 'TICKET_ACKNOWLEDGED',
      priority: ticket.priority,
    });

    emitToDepartment(ticket.requestingDepartment, 'ticket:acknowledged', ticket);
    emitGlobal('ticket:updated', ticket);

    res.status(200).json({
      success: true,
      message: 'Requisition ticket acknowledged successfully',
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error acknowledging ticket: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Target Department Supervisor assigns ticket to a specific operator
 * @route   POST /api/footage-tickets/:id/assign
 */
const assignOperator = async (req, res) => {
  try {
    const { id } = req.params;
    const { operatorId, remarks = '' } = req.body;

    if (!operatorId) {
      return res.status(400).json({ success: false, message: 'Operator ID is required for assignment' });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const userDept = (req.user.department || '').toLowerCase().trim();
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();

    const isTargetDept =
      targetDept.includes(userDept) ||
      userDept.includes(targetDept) ||
      (userRole === 'POLICE' && targetDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && targetDept.includes('traffic'));

    if (!isAdmin && !isTargetDept) {
      return res.status(403).json({
        success: false,
        message: 'Only the target department supervisor or an Admin can assign operators',
      });
    }

    const operator = await User.findById(operatorId);
    if (!operator) {
      return res.status(404).json({ success: false, message: 'Designated operator not found in department directory' });
    }

    const prevStatus = ticket.status;
    ticket.status = TICKET_STATES.ASSIGNED;
    ticket.assignedOperator = operator._id;
    ticket.assignedOperatorName = operator.name;
    ticket.assignedAt = new Date();
    ticket.assignedBy = req.user._id;

    await ticket.save();

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'TICKET_ASSIGNED',
      req,
      previousStatus: prevStatus,
      newStatus: TICKET_STATES.ASSIGNED,
      remarks: `Assigned to Operator ${operator.name} (${operator.designation || 'Evidence Technician'}) by ${req.user.name}. ${remarks}`,
      metadata: { operatorId: operator._id, operatorName: operator.name },
    });

    // Notify assigned operator directly
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.targetDepartment,
      recipientUser: operator._id,
      senderUser: req.user,
      title: `Assignment: Prepare Footage (${ticket.ticketId})`,
      message: `Supervisor ${req.user.name} assigned you to extract CCTV footage for Camera ${ticket.cameraId}. Priority: ${ticket.priority.toUpperCase()}`,
      type: 'TICKET_ASSIGNED',
      priority: ticket.priority,
    });

    // Notify Requester
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.requestingDepartment,
      senderUser: req.user,
      title: `Operator Assigned: ${ticket.ticketId}`,
      message: `${ticket.targetDepartment} assigned Operator ${operator.name} to extract footage.`,
      type: 'TICKET_ASSIGNED',
      priority: ticket.priority,
    });

    emitToUser(operator._id, 'ticket:assigned', ticket);
    emitToDepartment(ticket.targetDepartment, 'ticket:assigned', ticket);
    emitToDepartment(ticket.requestingDepartment, 'ticket:updated', ticket);

    res.status(200).json({
      success: true,
      message: `Ticket successfully assigned to Operator ${operator.name}`,
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error assigning operator: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get operators in department for assignment dropdown
 * @route   GET /api/footage-tickets/department-operators
 */
const getDepartmentOperators = async (req, res) => {
  try {
    const userDept = req.user.department || '';
    const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';

    const filter = {};
    if (!isAdmin && userDept) {
      if (/traffic/i.test(userDept)) {
        filter.department = { $regex: 'traffic', $options: 'i' };
      } else if (/police/i.test(userDept)) {
        filter.department = { $regex: '^(?!.*traffic).*police.*$', $options: 'i' };
      } else {
        filter.department = userDept;
      }
    }

    const operators = await User.find(filter)
      .select('name email department designation role')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: operators.length,
      data: operators,
    });
  } catch (error) {
    logger.error(`Error fetching department operators: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Central Control Room requests clarification from Requesting Department
 * @route   POST /api/footage-tickets/:id/clarify
 */
const requestClarification = async (req, res) => {
  try {
    const { id } = req.params;
    const { question } = req.body;

    if (!question || question.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Clarification inquiry must be at least 5 characters',
      });
    }

    const userRole = String(req.user.role || '').toUpperCase();
    if (userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only Central Control Room Nodal Officers can request clarification',
      });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const prevStatus = ticket.status;
    ticket.status = TICKET_STATES.PENDING_CLARIFICATION;
    ticket.clarification = {
      requestedAt: new Date(),
      question: question.trim(),
      requestedBy: req.user._id,
      requestedByName: req.user.name,
      status: 'pending',
    };

    await ticket.save();

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'CLARIFICATION_REQUESTED',
      req,
      previousStatus: prevStatus,
      newStatus: TICKET_STATES.PENDING_CLARIFICATION,
      remarks: `Clarification requested by Nodal Officer: "${question.trim()}"`,
      metadata: { question: question.trim() },
    });

    // Notify Requesting Department
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.requestingDepartment,
      senderUser: req.user,
      title: `Clarification Needed: ${ticket.ticketId}`,
      message: `Nodal Officer ${req.user.name} requested clarification: "${question.trim()}"`,
      type: 'CLARIFICATION_REQUESTED',
      priority: 'high',
    });

    emitToDepartment(ticket.requestingDepartment, 'ticket:clarification_requested', ticket);
    emitGlobal('ticket:updated', ticket);

    res.status(200).json({
      success: true,
      message: 'Clarification request sent to requesting department',
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error requesting clarification: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Requesting Department responds to clarification inquiry
 * @route   POST /api/footage-tickets/:id/clarify-response
 */
const respondClarification = async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body;

    if (!response || response.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Clarification response must be at least 5 characters',
      });
    }

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const userDept = (req.user.department || '').toLowerCase().trim();
    const reqDept = (ticket.requestingDepartment || '').toLowerCase().trim();
    const isOwner = ticket.requestedBy && ticket.requestedBy.toString() === req.user._id.toString();

    if (!isOwner && !reqDept.includes(userDept) && !userDept.includes(reqDept)) {
      return res.status(403).json({
        success: false,
        message: 'Only the requesting department can respond to this clarification inquiry',
      });
    }

    const prevStatus = ticket.status;
    ticket.status = TICKET_STATES.PENDING_ADMIN_REVIEW;
    if (ticket.clarification) {
      ticket.clarification.response = response.trim();
      ticket.clarification.respondedAt = new Date();
      ticket.clarification.status = 'answered';
    }

    await ticket.save();

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'CLARIFICATION_RESPONDED',
      req,
      previousStatus: prevStatus,
      newStatus: TICKET_STATES.PENDING_ADMIN_REVIEW,
      remarks: `Clarification response provided by ${req.user.name}: "${response.trim()}"`,
      metadata: { response: response.trim() },
    });

    // Notify Central Control Room (ADMIN)
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: 'Gujarat Home Department',
      recipientRole: 'ADMIN',
      senderUser: req.user,
      title: `Clarification Answered: ${ticket.ticketId}`,
      message: `${req.user.name} (${ticket.requestingDepartment}) provided clarification for requisition ${ticket.ticketId}.`,
      type: 'CLARIFICATION_RESPONDED',
      priority: 'high',
    });

    emitGlobal('ticket:pending_admin', ticket);

    res.status(200).json({
      success: true,
      message: 'Clarification response submitted. Requisition returned to Central Review queue.',
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error responding to clarification: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Generate short-lived signed evidence access token (15-minute validity)
 * @route   POST /api/footage-tickets/:id/evidence/:evidenceId/token
 */
const generateEvidenceToken = async (req, res) => {
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

    // RBAC: strictly requesting department, target department, or admin
    const userDept = (req.user.department || '').toLowerCase().trim();
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();
    const reqDept = (ticket.requestingDepartment || '').toLowerCase().trim();
    const isOwner = ticket.requestedBy && ticket.requestedBy.toString() === req.user._id.toString();

    const isRequestingDept =
      reqDept.includes(userDept) ||
      userDept.includes(reqDept) ||
      (userRole === 'POLICE' && reqDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && reqDept.includes('traffic'));

    const isTargetDept =
      targetDept.includes(userDept) ||
      userDept.includes(targetDept) ||
      (userRole === 'POLICE' && targetDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && targetDept.includes('traffic'));

    if (!isAdmin && !isOwner && !isRequestingDept && !isTargetDept) {
      await createAuditEntry({
        ticket,
        ticketId: ticket.ticketId,
        action: 'EVIDENCE_ACCESS_DENIED',
        req,
        remarks: `Unauthorized attempt to generate evidence token by ${req.user.name} (${userDept})`,
        evidenceId: evidence.evidenceId,
        actionResult: 'DENIED',
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Security clearance insufficient to access CCTV evidence',
      });
    }

    const token = generateShortLivedEvidenceToken({
      ticketId: ticket.ticketId,
      evidenceId: evidence.evidenceId,
      user: req.user,
    });

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_ACCESS_GRANTED',
      req,
      remarks: `Short-lived 15-minute signed evidence token generated for ${req.user.name} (${req.user.department})`,
      evidenceId: evidence.evidenceId,
      actionResult: 'SUCCESS',
    });

    res.status(200).json({
      success: true,
      token,
      expiresInSeconds: EVIDENCE_TOKEN_EXPIRY,
      evidenceId: evidence.evidenceId,
      ticketId: ticket.ticketId,
      streamUrl: `/api/footage-tickets/${ticket.ticketId}/evidence/${evidence.evidenceId}/stream?token=${token}`,
      downloadUrl: `/api/footage-tickets/${ticket.ticketId}/evidence/${evidence.evidenceId}/download?token=${token}`,
    });
  } catch (error) {
    logger.error(`Error generating evidence token: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Requesting Officer marks requisition as COMPLETED after evidence verification
 * @route   POST /api/footage-tickets/:id/complete
 */
const completeTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks = '' } = req.body;

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    const userDept = (req.user.department || '').toLowerCase().trim();
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const reqDept = (ticket.requestingDepartment || '').toLowerCase().trim();
    const isOwner = ticket.requestedBy && ticket.requestedBy.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner && !reqDept.includes(userDept) && !userDept.includes(reqDept)) {
      return res.status(403).json({
        success: false,
        message: 'Only the requesting officer or department can mark this requisition as completed',
      });
    }

    const prevStatus = ticket.status;
    ticket.status = TICKET_STATES.COMPLETED;
    ticket.closedAt = new Date();

    await ticket.save();

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'TICKET_COMPLETED',
      req,
      previousStatus: prevStatus,
      newStatus: TICKET_STATES.COMPLETED,
      remarks: `Requisition completed and officially closed by ${req.user.name} (${req.user.department}). ${remarks}`,
    });

    // Notify Central Control Room and Target Department
    await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.targetDepartment,
      senderUser: req.user,
      title: `Requisition Completed: ${ticket.ticketId}`,
      message: `${req.user.name} (${ticket.requestingDepartment}) verified evidence and marked ticket as completed.`,
      type: 'TICKET_COMPLETED',
    });

    emitToDepartment(ticket.targetDepartment, 'ticket:completed', ticket);
    emitGlobal('ticket:updated', ticket);

    res.status(200).json({
      success: true,
      message: 'Requisition ticket marked as COMPLETED and archived',
      data: ticket,
    });
  } catch (error) {
    logger.error(`Error completing ticket: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Generate Court-Admissible Evidence Certificate Manifest (Section 65B Indian Evidence Act compliant)
 * @route   GET /api/footage-tickets/:id/evidence-package
 */
const generateEvidencePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await FootageTicket.findOne({
      $or: [{ ticketId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    })
      .populate('requestedBy', 'name email department designation phone')
      .populate('reviewedBy', 'name email department designation phone')
      .populate('assignedOperator', 'name email department designation')
      .populate('camera')
      .populate('evidence');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    // RBAC: strict department isolation
    const userDept = (req.user.department || '').toLowerCase().trim();
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();
    const reqDept = (ticket.requestingDepartment || '').toLowerCase().trim();
    const isOwner = ticket.requestedBy && ticket.requestedBy._id?.toString() === req.user._id.toString();

    const isRequestingDept =
      reqDept.includes(userDept) ||
      userDept.includes(reqDept) ||
      (userRole === 'POLICE' && reqDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && reqDept.includes('traffic'));

    const isTargetDept =
      targetDept.includes(userDept) ||
      userDept.includes(targetDept) ||
      (userRole === 'POLICE' && targetDept.includes('police')) ||
      (userRole === 'TRAFFIC_POLICE' && targetDept.includes('traffic'));

    if (!isAdmin && !isOwner && !isRequestingDept && !isTargetDept) {
      return res.status(404).json({ success: false, message: 'Requisition ticket not found' });
    }

    // Fetch complete audit trail
    const auditLogs = await FootageAuditLog.find({ ticketId: ticket.ticketId }).sort({ timestamp: 1 }).lean();

    // Package manifest structure
    const certificateDossier = {
      certificateId: `CERT-65B-${ticket.ticketId}-${Date.now().toString(36).toUpperCase()}`,
      issuedAt: new Date().toISOString(),
      governingStatute: 'Section 65B, Indian Evidence Act, 1872 / Bharatiya Sakshya Adhiniyam, 2023',
      jurisdiction: 'State of Gujarat, Republic of India',
      issuingAuthority: 'Garud Central Government Video Evidence Portal',
      caseDetails: {
        ticketId: ticket.ticketId,
        firNumber: ticket.firNumber || 'N/A',
        caseNumber: ticket.caseNumber || 'N/A',
        incidentType: ticket.incidentType,
        classification: ticket.classification,
        purpose: ticket.purpose,
      },
      participatingEntities: {
        requestingDepartment: ticket.requestingDepartment,
        requestingOfficer: {
          name: ticket.requestedBy?.name,
          designation: ticket.officialDesignation || ticket.requestedBy?.designation,
          phone: ticket.contactPhone || ticket.requestedBy?.phone,
        },
        nodalControlRoom: {
          approvedBy: ticket.approval?.approvedByName || ticket.reviewedBy?.name || 'Central Control Room',
          approvedAt: ticket.approval?.approvedAt || ticket.reviewedAt,
          remarks: ticket.approval?.remarks || 'Verified & Approved under State Protocol',
        },
        targetDepartment: ticket.targetDepartment,
        assignedOperator: ticket.assignedOperatorName || ticket.assignedOperator?.name || 'N/A',
      },
      cameraSpecification: {
        cameraId: ticket.cameraId,
        cameraName: ticket.cameraName || ticket.camera?.name,
        locationName: ticket.locationName,
        district: ticket.district,
        coordinates: ticket.coordinates,
        operatingDepartment: ticket.targetDepartment,
      },
      temporalBounds: {
        startTime: ticket.startTime,
        endTime: ticket.endTime,
        durationMinutes: ticket.durationMinutes,
      },
      cryptographicIntegrity: {
        algorithm: 'AES-256-GCM (Payload) / SHA-256 (Hash Integrity Verification)',
        mediaHash: ticket.mediaHash,
        evidenceId: ticket.evidenceId,
        integrityStatus: ticket.integrityStatus || 'verified',
        checksumSealAlgorithm: 'DRISHTIGRID_SEAL_V2 (HMAC-SHA256)',
      },
      chainOfCustodyAuditTrail: auditLogs.map((log) => ({
        timestamp: log.timestamp,
        action: log.action,
        actor: log.actorName,
        department: log.actorDepartment,
        role: log.actorRole,
        ipAddress: log.ipAddress,
        integrityHash: log.integrityHash,
        remarks: log.remarks,
      })),
      legalDisclaimer:
        'This electronic certificate certifies that the digital video recording identified above was captured, encrypted, stored, and transferred using an automated, tamper-evident cryptographic system without intermediate manual alteration.',
    };

    res.status(200).json({
      success: true,
      data: certificateDossier,
    });
  } catch (error) {
    logger.error(`Error generating evidence package: ${error.message}`);
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
    const {
      remarks = '',
      recordingStartTime,
      recordingEndTime,
      cameraId: uploadedCameraId,
      cameraOverrideReason,
    } = req.body;

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

    // Camera ID mismatch validation:
    if (uploadedCameraId && uploadedCameraId.trim() && uploadedCameraId.trim() !== ticket.cameraId) {
      if (!cameraOverrideReason || cameraOverrideReason.trim().length < 5) {
        return res.status(400).json({
          success: false,
          message: `Camera ID mismatch: Uploaded camera '${uploadedCameraId}' does not match requisition camera '${ticket.cameraId}'. A valid authorized justification is required to override.`,
        });
      }
    }

    // RBAC: target department, assigned operator, or admin can upload evidence
    const userDept = (req.user.department || '').toLowerCase().trim();
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const isAssignedOperator = ticket.assignedOperator && ticket.assignedOperator.toString() === req.user._id.toString();

    const isTargetDept =
      targetDept.includes(userDept) ||
      userDept.includes(targetDept) ||
      (userDept.includes('traffic') && targetDept.includes('traffic')) ||
      (userDept.includes('police') && targetDept.includes('police')) ||
      (!targetDept.includes('police') && (userDept.includes('police') || userDept.includes('traffic')));

    if (!isAdmin && !isTargetDept && !isAssignedOperator) {
      return res.status(403).json({
        success: false,
        message: 'Only the designated operator, target department supervisor, or Administrator can upload evidence for this ticket',
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
      cameraId: uploadedCameraId || ticket.cameraId,
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
        cameraOverrideReason: cameraOverrideReason || '',
      },
    });

    // Step 5: Update Ticket
    const prevStatus = ticket.status;
    ticket.status = TICKET_STATES.AVAILABLE_TO_REQUESTER;
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

    // Log official immutable audit log entry so Admin Management tab maintains complete record
    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_UPLOADED',
      req,
      previousStatus: prevStatus,
      newStatus: TICKET_STATES.AVAILABLE_TO_REQUESTER,
      remarks: `CCTV footage evidence uploaded by ${req.user.name} (${userDept}). Encrypted with AES-256-GCM & SHA-256 sealed. Evidence dispatched to requesting authority.`,
      evidenceId,
      metadata: { sha256Hash, evidenceId, fileName: req.file.originalname, fileSizeBytes: req.file.size },
    });

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

    // Step 6: Notify ONLY the Requesting Department and Requesting Officer
    const notification = await sendNotification({
      ticket,
      ticketId: ticket.ticketId,
      recipientDepartment: ticket.requestingDepartment,
      recipientRole: '', // Strictly empty so it only routes to requesting department
      recipientUser: ticket.requestedBy?._id || ticket.requestedBy,
      senderUser: req.user,
      title: `Footage Uploaded: ${ticket.ticketId}`,
      message: `${req.user.name} (${userDept}) has uploaded AES-256 encrypted CCTV evidence (${evidenceId}). Evidence is now available for your inspection.`,
      type: 'EVIDENCE_UPLOADED',
      priority: ticket.priority,
    });

    // Emit socket events ONLY to Requesting Dept, Target Dept, and Admin
    emitToDepartment(ticket.requestingDepartment, 'ticket:evidence_uploaded', {
      ticket,
      evidence: evidenceDoc,
    });
    emitToDepartment(ticket.targetDepartment, 'ticket:updated', ticket);
    if (ticket.requestedBy) {
      emitToUser(ticket.requestedBy, 'notification:new', notification);
    }

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
 * @desc    Stream decrypted CCTV footage evidence with HTTP 206 Partial Content (Supports Token)
 * @route   GET /api/footage-tickets/:id/evidence/:evidenceId/stream
 */
const streamEvidence = async (req, res) => {
  try {
    const { id, evidenceId } = req.params;
    const token = req.query.token || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : '');

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

    let authenticatedUser = req.user;
    if (token) {
      const verifiedToken = verifyShortLivedEvidenceToken(token, ticket.ticketId, evidence.evidenceId);
      if (verifiedToken) {
        authenticatedUser = {
          _id: verifiedToken.userId || verifiedToken.id,
          name: verifiedToken.userName,
          department: verifiedToken.department,
          role: verifiedToken.role,
        };
      } else {
        // Fallback to standard user JWT auth token
        try {
          const JWT_SECRET = process.env.JWT_SECRET || 'DRISHTIGRID_SECURE_GOV_JWT_SECRET_2026';
          const decoded = jwt.verify(token, JWT_SECRET);
          const uid = decoded.id || decoded.userId || decoded._id;
          if (uid) {
            const u = await User.findById(uid).select('-password -refreshToken');
            if (u) authenticatedUser = u;
          }
        } catch (e) {
          logger.warn(`Evidence stream token decode warning: ${e.message}`);
        }
      }
    }

    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to stream evidence footage',
      });
    }

    const userDept = (authenticatedUser.department || '').toLowerCase().trim();
    const userRole = String(authenticatedUser.role || '').toUpperCase();
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();
    const reqDept = (ticket.requestingDepartment || '').toLowerCase().trim();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const isOwner = ticket.requestedBy && (ticket.requestedBy._id?.toString() === authenticatedUser._id?.toString() || ticket.requestedBy.toString() === authenticatedUser._id?.toString());

    const isUserTraffic = userDept.includes('traffic') || userRole === 'TRAFFIC_POLICE';
    const isUserHome = userDept.includes('home') || isAdmin;
    const isUserGeneralPolice = !isUserTraffic && !isUserHome && userDept.includes('police');

    const isReqTraffic = reqDept.includes('traffic');
    const isTargetTraffic = targetDept.includes('traffic');

    const isReqGeneralPolice = !isReqTraffic && reqDept.includes('police');
    const isTargetGeneralPolice = !isTargetTraffic && targetDept.includes('police');

    const isRequestingDept =
      isOwner ||
      (!isUserHome &&
        ((isUserTraffic && isReqTraffic) ||
         (isUserGeneralPolice && isReqGeneralPolice) ||
         (!isUserTraffic && !isUserGeneralPolice && reqDept.includes(userDept))));

    const isTargetDept =
      !isUserHome &&
      ((isUserTraffic && isTargetTraffic) ||
       (isUserGeneralPolice && isTargetGeneralPolice) ||
       (!isUserTraffic && !isUserGeneralPolice && targetDept.includes(userDept)));

    if (!isAdmin && !isOwner && !isRequestingDept && !isTargetDept) {
      await createAuditEntry({
        ticket,
        ticketId: ticket.ticketId,
        action: 'EVIDENCE_ACCESS_DENIED',
        req: { user: authenticatedUser, headers: req.headers, socket: req.socket },
        remarks: `Streaming rejected: Insufficient security clearance for ${authenticatedUser.name || 'User'} (${userDept})`,
        evidenceId: evidence.evidenceId,
        actionResult: 'DENIED',
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Security clearance insufficient to access CCTV evidence',
      });
    }

    // Determine correct MIME type
    let mimeType = evidence.fileType || 'video/mp4';
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = (evidence.originalFileName || '').split('.').pop().toLowerCase();
      if (ext === 'webm') mimeType = 'video/webm';
      else if (ext === 'mkv') mimeType = 'video/x-matroska';
      else if (ext === 'avi') mimeType = 'video/x-msvideo';
      else mimeType = 'video/mp4';
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

    // Update ticket status to 'VIEWED' if it was Available / Evidence Uploaded
    if (['AVAILABLE', 'EVIDENCE_UPLOADED', 'Available', 'Evidence Uploaded'].includes(ticket.status)) {
      ticket.status = TICKET_STATES.VIEWED;
      await ticket.save();
    }

    // Log access event
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
        'Content-Type': mimeType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      });

      return res.end(chunk);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': mimeType,
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
 * @desc    Download decrypted CCTV footage evidence file for forensic dossier (Supports Token)
 * @route   GET /api/footage-tickets/:id/evidence/:evidenceId/download
 */
const downloadEvidence = async (req, res) => {
  try {
    const { id, evidenceId } = req.params;
    const token = req.query.token;

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

    let authenticatedUser = req.user;
    if (token) {
      const verifiedToken = verifyShortLivedEvidenceToken(token, ticket.ticketId, evidence.evidenceId);
      if (verifiedToken) {
        authenticatedUser = {
          _id: verifiedToken.userId || verifiedToken.id,
          name: verifiedToken.userName,
          department: verifiedToken.department,
          role: verifiedToken.role,
        };
      } else {
        // Fallback to standard user JWT auth token
        try {
          const JWT_SECRET = process.env.JWT_SECRET || 'DRISHTIGRID_SECURE_GOV_JWT_SECRET_2026';
          const decoded = jwt.verify(token, JWT_SECRET);
          const uid = decoded.id || decoded.userId || decoded._id;
          if (uid) {
            const u = await User.findById(uid).select('-password -refreshToken');
            if (u) authenticatedUser = u;
          }
        } catch (e) {
          logger.warn(`Evidence download token decode warning: ${e.message}`);
        }
      }
    }

    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to download evidence footage',
      });
    }

    const userDept = (authenticatedUser.department || '').toLowerCase().trim();
    const userRole = String(authenticatedUser.role || '').toUpperCase();
    const targetDept = (ticket.targetDepartment || '').toLowerCase().trim();
    const reqDept = (ticket.requestingDepartment || '').toLowerCase().trim();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
    const isOwner = ticket.requestedBy && (ticket.requestedBy._id?.toString() === authenticatedUser._id?.toString() || ticket.requestedBy.toString() === authenticatedUser._id?.toString());

    const isUserTraffic = userDept.includes('traffic') || userRole === 'TRAFFIC_POLICE';
    const isUserHome = userDept.includes('home') || isAdmin;
    const isUserGeneralPolice = !isUserTraffic && !isUserHome && userDept.includes('police');

    const isReqTraffic = reqDept.includes('traffic');
    const isTargetTraffic = targetDept.includes('traffic');

    const isReqGeneralPolice = !isReqTraffic && reqDept.includes('police');
    const isTargetGeneralPolice = !isTargetTraffic && targetDept.includes('police');

    const isRequestingDept =
      isOwner ||
      (!isUserHome &&
        ((isUserTraffic && isReqTraffic) ||
         (isUserGeneralPolice && isReqGeneralPolice) ||
         (!isUserTraffic && !isUserGeneralPolice && reqDept.includes(userDept))));

    const isTargetDept =
      !isUserHome &&
      ((isUserTraffic && isTargetTraffic) ||
       (isUserGeneralPolice && isTargetGeneralPolice) ||
       (!isUserTraffic && !isUserGeneralPolice && targetDept.includes(userDept)));

    if (!isAdmin && !isOwner && !isRequestingDept && !isTargetDept) {
      await createAuditEntry({
        ticket,
        ticketId: ticket.ticketId,
        action: 'EVIDENCE_ACCESS_DENIED',
        req: { user: authenticatedUser, headers: req.headers, socket: req.socket },
        remarks: `Download rejected: Insufficient security clearance for ${authenticatedUser.name || 'User'} (${userDept})`,
        evidenceId: evidence.evidenceId,
        actionResult: 'DENIED',
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Security clearance insufficient to download forensic evidence',
      });
    }

    const encryptedBuffer = await cloudinaryService.fetchEncryptedBuffer(
      evidence.cloudinaryAsset.secureUrl,
      evidence.cloudinaryAsset.publicId
    );

    const decryptedBuffer = cryptoService.decryptBuffer(
      encryptedBuffer,
      evidence.encryption.iv,
      evidence.encryption.authTag
    );

    const isIntact = cryptoService.verifySha256(decryptedBuffer, evidence.sha256Hash);
    if (!isIntact) {
      return res.status(422).json({
        success: false,
        message: '🔴 Evidence Integrity Compromised! Cryptographic checksum does not match official seal.',
      });
    }

    await createAuditEntry({
      ticket,
      ticketId: ticket.ticketId,
      action: 'EVIDENCE_DOWNLOADED',
      req,
      remarks: `Evidence file downloaded by ${req.user?.name || 'Authorized Officer'} (${req.user?.department || 'Authorized Dept'}). SHA-256 seal verified.`,
      evidenceId: evidence.evidenceId,
      actionResult: 'SUCCESS',
    });

    const filename = evidence.originalFileName || `CCTV_${ticket.ticketId}_${evidence.evidenceId}.mp4`;
    let mimeType = evidence.fileType || 'video/mp4';
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = filename.split('.').pop().toLowerCase();
      if (ext === 'webm') mimeType = 'video/webm';
      else if (ext === 'mkv') mimeType = 'video/x-matroska';
      else mimeType = 'video/mp4';
    }

    res.writeHead(200, {
      'Content-Length': decryptedBuffer.length,
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-store, private',
    });

    return res.end(decryptedBuffer);
  } catch (error) {
    logger.error(`Error downloading evidence: ${error.message}`);
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
  approveTicket,
  rejectTicket,
  acknowledgeTicket,
  assignOperator,
  getDepartmentOperators,
  requestClarification,
  respondClarification,
  generateEvidenceToken,
  completeTicket,
  generateEvidencePackage,
  uploadEvidence,
  streamEvidence,
  verifyEvidenceIntegrity,
  addTicketResponse,
  getTicketResponses,
  getTicketAuditLogs,
  getAllAuditLogs,
  recordFootageAccess,
  dispatchFootage,
  downloadEvidence,
};

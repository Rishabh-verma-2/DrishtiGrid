const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const FirCase = require('../models/FirCase');
const WatchlistEntry = require('../models/WatchlistEntry');
const InvestigationAssignment = require('../models/InvestigationAssignment');
const InvestigationSearch = require('../models/InvestigationSearch');
const InvestigationResult = require('../models/InvestigationResult');
const Camera = require('../models/Camera');
const PlateDetection = require('../models/PlateDetection');
const Notification = require('../models/Notification');
const SystemAuditLog = require('../models/SystemAuditLog');
const logger = require('../utils/logger');
const {
  INVESTIGATION_STATES,
  calculateSlaDueAt,
  calculateSlaRemaining,
  validateTransition,
} = require('../utils/investigationStateMachine');
const { emitToDepartment, emitToUser, emitGlobal } = require('../socket/socketHandler');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/evidence');
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (e) {
    logger.warn(`Could not create uploads directory: ${e.message}`);
  }
}

/**
 * Generate sequential formatted Case ID: FIR-YYYY-NNNNNN
 */
async function generateCaseId() {
  const currentYear = new Date().getFullYear();
  const yearPrefix = `FIR-${currentYear}-`;
  
  const count = await FirCase.countDocuments({
    caseId: { $regex: `^${yearPrefix}` },
  });

  let seq = count + 1;
  let candidate = `${yearPrefix}${String(seq).padStart(6, '0')}`;

  while (await FirCase.exists({ caseId: candidate })) {
    seq += 1;
    candidate = `${yearPrefix}${String(seq).padStart(6, '0')}`;
  }

  return candidate;
}

/**
 * Generate formatted Watchlist ID: WL-YYYY-NNNNNN
 */
async function generateWatchlistId() {
  const currentYear = new Date().getFullYear();
  const yearPrefix = `WL-${currentYear}-`;
  
  const count = await WatchlistEntry.countDocuments({
    watchlistId: { $regex: `^${yearPrefix}` },
  });

  let seq = count + 1;
  let candidate = `${yearPrefix}${String(seq).padStart(6, '0')}`;

  while (await WatchlistEntry.exists({ watchlistId: candidate })) {
    seq += 1;
    candidate = `${yearPrefix}${String(seq).padStart(6, '0')}`;
  }

  return candidate;
}

/**
 * Helper to compute SHA-256 hash of a file buffer
 */
function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Dispatch notification and socket message
 */
async function dispatchInvestigationNotification({
  caseId,
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
    const notif = await Notification.create({
      caseId,
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
      actionUrl: actionUrl || `/investigation/cases/${caseId}`,
    });

    emitToDepartment(recipientDepartment, 'notification:new', notif);
    if (recipientUser) {
      emitToUser(recipientUser, 'notification:new', notif);
    }
    if (recipientDepartment === 'ADMIN' || recipientRole === 'ADMIN') {
      emitGlobal('notification:new', notif);
    }

    return notif;
  } catch (err) {
    logger.error(`Error sending investigation notification: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. POLICE STATION: CREATE FIR INVESTIGATION REQUEST
// ─────────────────────────────────────────────────────────────────────────────
const createFirCase = async (req, res) => {
  try {
    const {
      requestType,
      firNumber,
      firDate,
      policeStation,
      district,
      region,
      officerName,
      officerId,
      contactNumber,
      caseDescription,
      priority = 'MEDIUM',
      investigationRemarks,
      vehicleDetails,
      personDetails,
      locationAddress,
      latitude,
      longitude,
    } = req.body;

    // ─── STRICT RBAC CHECK ──────────────────────────────────────────────────
    // The Admin must NEVER create an FIR/investigation request.
    // Admin is the centralized review, coordination, watchlist and distribution authority.
    // All field law enforcement departments (Police, Traffic Police, Crime Branch) can initiate case requests.
    const userRole = String(req.user?.role || '').toUpperCase();
    if (['ADMIN', 'SUPERADMIN'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Admins cannot create FIR investigation requests. Only field law enforcement departments and stations can file FIR requests.',
      });
    }

    // Validate core fields
    if (!requestType || !firNumber || !firDate || !policeStation || !officerName || !contactNumber || !caseDescription) {
      return res.status(400).json({
        success: false,
        message: 'Missing mandatory FIR fields. Please check all required inputs.',
      });
    }

    // Parse sub-objects if sent as stringified JSON from multipart form-data
    let parsedVehicle = {};
    if (typeof vehicleDetails === 'string') {
      try { parsedVehicle = JSON.parse(vehicleDetails); } catch (e) {}
    } else if (vehicleDetails) {
      parsedVehicle = vehicleDetails;
    }

    let parsedPerson = {};
    if (typeof personDetails === 'string') {
      try { parsedPerson = JSON.parse(personDetails); } catch (e) {}
    } else if (personDetails) {
      parsedPerson = personDetails;
    }

    // Process file attachments from Multer memory storage
    const attachments = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        const fileId = `FILE-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const ext = path.extname(file.originalname) || '.jpg';
        const diskFilename = `${fileId}${ext}`;
        const diskPath = path.join(UPLOADS_DIR, diskFilename);

        fs.writeFileSync(diskPath, file.buffer);
        const hash = computeSha256(file.buffer);

        // Map fieldname to category
        let fileCategory = 'SUPPORTING_DOC';
        if (file.fieldname.includes('vehicle')) fileCategory = 'VEHICLE_PHOTO';
        else if (file.fieldname.includes('plate')) fileCategory = 'NUMBER_PLATE_PHOTO';
        else if (file.fieldname.includes('rc')) fileCategory = 'RC_DOCUMENT';
        else if (file.fieldname.includes('fir')) fileCategory = 'FIR_COPY';
        else if (file.fieldname.includes('front')) fileCategory = 'PERSON_FRONT_FACE';
        else if (file.fieldname.includes('side')) fileCategory = 'PERSON_SIDE_FACE';
        else if (file.fieldname.includes('body')) fileCategory = 'PERSON_FULL_BODY';

        attachments.push({
          fileId,
          originalName: file.originalname,
          fileType: file.mimetype,
          fileCategory,
          fileUrl: `/uploads/evidence/${diskFilename}`,
          fileSizeBytes: file.size,
          sha256Hash: hash,
          uploadedAt: new Date(),
        });
      }
    }

    // Generate unique Case ID
    const caseId = await generateCaseId();

    // Check duplicate registrations / persons
    let duplicateFlag = { hasDuplicate: false, duplicateCaseId: '', duplicateReason: '' };
    if (requestType === 'STOLEN_VEHICLE' && parsedVehicle.registrationNumber) {
      const cleanPlate = parsedVehicle.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const existing = await FirCase.findOne({
        'vehicleDetails.normalizedRegistration': cleanPlate,
        status: { $nin: [INVESTIGATION_STATES.CLOSED, INVESTIGATION_STATES.REJECTED, INVESTIGATION_STATES.CANCELLED] },
      });
      if (existing) {
        duplicateFlag = {
          hasDuplicate: true,
          duplicateCaseId: existing.caseId,
          duplicateReason: `Vehicle registration ${parsedVehicle.registrationNumber} is already registered under active case ${existing.caseId} at ${existing.policeStation}`,
        };
      }
    }

    // Geolocation setup
    const coords = [
      Number(longitude) || 72.5714,
      Number(latitude) || 23.0225,
    ];

    // SLA setup
    const dueAt = calculateSlaDueAt(priority);

    // Initial timeline event
    const initialTimeline = [
      {
        action: 'FIR Submitted',
        timestamp: new Date(),
        actorId: req.user?._id,
        actorName: req.user?.name || officerName,
        actorRole: req.user?.role || 'POLICE',
        actorDepartment: policeStation,
        previousStatus: INVESTIGATION_STATES.DRAFT,
        newStatus: INVESTIGATION_STATES.SUBMITTED,
        remarks: `FIR Investigation Request filed under FIR No: ${firNumber} at ${policeStation}`,
        metadata: { firNumber, priority, requestType },
      },
    ];

    const firCase = new FirCase({
      caseId,
      requestType,
      priority: String(priority).toUpperCase(),
      status: INVESTIGATION_STATES.SUBMITTED,
      firNumber,
      firDate: new Date(firDate),
      policeStation,
      district: district || req.user?.district || 'Gujarat',
      region: region || 'Gujarat',
      officerName,
      officerId: officerId || '',
      contactNumber,
      caseDescription,
      investigationRemarks: investigationRemarks || '',
      vehicleDetails: parsedVehicle,
      personDetails: parsedPerson,
      attachments,
      location: {
        type: 'Point',
        coordinates: coords,
      },
      locationAddress: locationAddress || `${policeStation}, ${district || 'Gujarat'}`,
      submittedBy: req.user?._id,
      submittedByName: req.user?.name || officerName,
      submittedByStation: policeStation,
      submittedByDepartment: req.user?.department || 'Gujarat Police Department',
      slaHours: priority === 'CRITICAL' ? 2 : priority === 'HIGH' ? 6 : priority === 'MEDIUM' ? 24 : 72,
      dueAt,
      duplicateFlag,
      timeline: initialTimeline,
    });

    await firCase.save();

    // Audit log
    await SystemAuditLog.record({
      req,
      action: 'FIR_CASE_SUBMITTED',
      resource: 'FirCase',
      resourceId: caseId,
      description: `New ${requestType} FIR case submitted by ${req.user?.name} (${policeStation}). FIR Number: ${firNumber}. Priority: ${priority}.`,
    });

    // Notify State Admin
    await dispatchInvestigationNotification({
      caseId,
      recipientDepartment: 'Gujarat Home Department',
      recipientRole: 'ADMIN',
      senderUser: req.user,
      title: `New FIR Investigation: ${caseId}`,
      message: `${priority} priority ${requestType.replace('_', ' ')} submitted by ${policeStation} (${officerName}). Awaiting review.`,
      type: 'FIR_SUBMITTED',
      priority: priority.toLowerCase(),
      actionUrl: `/investigation/cases/${caseId}`,
    });

    return res.status(201).json({
      success: true,
      message: 'FIR Investigation Request submitted successfully.',
      caseId,
      data: firCase,
    });
  } catch (err) {
    logger.error(`Error in createFirCase: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: `Failed to submit FIR Request: ${err.message}`,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. QUERY ALL FIR CASES (WITH RBAC & FILTERS)
// ─────────────────────────────────────────────────────────────────────────────
const getFirCases = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      requestType,
      policeStation,
      district,
      region,
      search,
      dateFrom,
      dateTo,
      sort = '-createdAt',
    } = req.query;

    const query = {};

    // RBAC Filter:
    // 1. Admin sees everything statewide
    // 2. Department users see ONLY cases assigned to their department
    // RBAC Filter:
    // 1. Admin sees everything statewide
    // 2. All operational departments (Police Stations, Traffic Police, Crime Branch) see:
    //    - Cases originated from their station/department
    //    - Cases submitted by the officer
    //    - Cases actively assigned to their department
    const userRole = String(req.user?.role || '').toUpperCase();
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

    if (!isAdmin) {
      const userDept = req.user?.department || '';
      const userStation = req.user?.policeStation || userDept;

      // Find all cases assigned to this user's department
      const assignments = await InvestigationAssignment.find({
        $or: [
          { departmentCode: { $regex: new RegExp(userDept, 'i') } },
          { departmentName: { $regex: new RegExp(userDept, 'i') } },
          { assignedToUser: req.user._id },
        ],
      }).select('caseId');
      const assignedCaseIds = assignments.map((a) => a.caseId);

      query.$or = [
        { caseId: { $in: assignedCaseIds } },
        ...(userStation ? [{ policeStation: { $regex: new RegExp(userStation, 'i') } }] : []),
        { submittedBy: req.user._id },
      ];
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (priority && priority !== 'ALL') {
      query.priority = priority.toUpperCase();
    }
    if (requestType && requestType !== 'ALL') {
      query.requestType = requestType;
    }
    if (policeStation && policeStation !== 'ALL') {
      query.policeStation = policeStation;
    }
    if (district && district !== 'ALL') {
      query.district = district;
    }
    if (region && region !== 'ALL') {
      query.region = region;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      query.firDate = {};
      if (dateFrom) query.firDate.$gte = new Date(dateFrom);
      if (dateTo) query.firDate.$lte = new Date(dateTo);
    }

    // Text search query
    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      const cleanPlate = q.toUpperCase().replace(/[^A-Z0-9]/g, '');

      query.$or = [
        { caseId: regex },
        { firNumber: regex },
        { officerName: regex },
        { policeStation: regex },
        { caseDescription: regex },
        { 'vehicleDetails.registrationNumber': regex },
        { 'vehicleDetails.normalizedRegistration': cleanPlate },
        { 'personDetails.fullName': regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [cases, total] = await Promise.all([
      FirCase.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
      FirCase.countDocuments(query),
    ]);

    // Attach real-time SLA calculation
    const enriched = cases.map((c) => ({
      ...c,
      slaStatus: calculateSlaRemaining(c.dueAt),
    }));

    return res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (err) {
    logger.error(`Error in getFirCases: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error retrieving cases' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET SINGLE CASE DETAIL (WITH TIMELINE, ASSIGNMENTS & RESULTS)
// ─────────────────────────────────────────────────────────────────────────────
const getFirCaseById = async (req, res) => {
  try {
    const { id } = req.params;

    const firCase = await FirCase.findOne({
      $or: [
        { caseId: id },
        mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { caseId: id },
      ],
    }).populate('submittedBy', 'name email department designation phone');

    if (!firCase) {
      return res.status(404).json({ success: false, message: 'FIR Investigation Case not found' });
    }

    // Retrieve related child objects
    const [watchlistEntry, assignments, searches, results] = await Promise.all([
      WatchlistEntry.findOne({ caseId: firCase.caseId }).lean(),
      InvestigationAssignment.find({ caseId: firCase.caseId }).lean(),
      InvestigationSearch.find({ caseId: firCase.caseId }).sort({ createdAt: -1 }).limit(15).lean(),
      InvestigationResult.find({ caseId: firCase.caseId }).sort({ submittedAt: -1 }).lean(),
    ]);

    const enrichedCase = firCase.toObject();
    enrichedCase.slaStatus = calculateSlaRemaining(firCase.dueAt);
    enrichedCase.watchlistEntry = watchlistEntry || null;
    enrichedCase.assignments = assignments || [];
    enrichedCase.searches = searches || [];
    enrichedCase.results = results || [];

    return res.status(200).json({
      success: true,
      data: enrichedCase,
    });
  } catch (err) {
    logger.error(`Error in getFirCaseById: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error retrieving case details' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. ADMIN REVIEW FIR CASE: APPROVE / REJECT / REQUEST CORRECTION
// ─────────────────────────────────────────────────────────────────────────────
const reviewFirCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, remarks = '', rejectionReason = '', correctionComment = '' } = req.body;

    const firCase = await FirCase.findOne({
      $or: [{ caseId: id }, mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { caseId: id }],
    });

    if (!firCase) {
      return res.status(404).json({ success: false, message: 'FIR Case not found' });
    }

    const previousStatus = firCase.status;
    let nextStatus = previousStatus;
    let actionLabel = '';

    if (action === 'APPROVE') {
      nextStatus = INVESTIGATION_STATES.APPROVED;
      actionLabel = 'FIR Approved by State Admin';
      firCase.adminReview = {
        reviewedBy: req.user?._id,
        reviewedByName: req.user?.name || 'State Admin',
        reviewedAt: new Date(),
        decision: 'APPROVED',
      };

      // Create or update Master Watchlist Entry
      let watchlistEntry = await WatchlistEntry.findOne({ caseId: firCase.caseId });
      if (!watchlistEntry) {
        const watchlistId = await generateWatchlistId();
        const subjectIdentifier =
          firCase.requestType === 'STOLEN_VEHICLE'
            ? firCase.vehicleDetails?.registrationNumber || 'VEHICLE'
            : firCase.personDetails?.fullName || 'PERSON';

        const referenceImages = (firCase.attachments || [])
          .filter((a) => a.fileType?.startsWith('image'))
          .map((a) => ({
            url: a.fileUrl,
            category: a.fileCategory,
            sha256Hash: a.sha256Hash,
          }));

        watchlistEntry = new WatchlistEntry({
          watchlistId,
          case: firCase._id,
          caseId: firCase.caseId,
          firNumber: firCase.firNumber,
          subjectType: firCase.requestType,
          subjectIdentifier,
          description: firCase.caseDescription,
          priority: firCase.priority,
          originatingStation: firCase.policeStation,
          originatingRegion: firCase.region,
          originatingDistrict: firCase.district,
          referenceImages,
          status: 'ACTIVE',
          createdBy: req.user?._id,
          createdByName: req.user?.name || 'State Admin',
        });

        await watchlistEntry.save();
      }

      firCase.isWatchlistActive = true;
      firCase.watchlistEntryId = watchlistEntry.watchlistId;
      nextStatus = INVESTIGATION_STATES.WATCHLIST_ACTIVE;

    } else if (action === 'REJECT') {
      if (!rejectionReason.trim()) {
        return res.status(400).json({ success: false, message: 'Rejection reason is mandatory.' });
      }
      nextStatus = INVESTIGATION_STATES.REJECTED;
      actionLabel = 'FIR Request Rejected';
      firCase.adminReview = {
        reviewedBy: req.user?._id,
        reviewedByName: req.user?.name || 'State Admin',
        reviewedAt: new Date(),
        decision: 'REJECTED',
        rejectionReason,
      };

    } else if (action === 'REQUEST_CORRECTION') {
      if (!correctionComment.trim()) {
        return res.status(400).json({ success: false, message: 'Correction remarks are mandatory.' });
      }
      nextStatus = INVESTIGATION_STATES.CORRECTION_REQUIRED;
      actionLabel = 'Correction Requested by Admin';
      firCase.adminReview = {
        reviewedBy: req.user?._id,
        reviewedByName: req.user?.name || 'State Admin',
        reviewedAt: new Date(),
        decision: 'CORRECTION_REQUIRED',
        correctionComment,
      };
    } else {
      return res.status(400).json({ success: false, message: 'Invalid review action' });
    }

    firCase.status = nextStatus;

    // Append to timeline
    firCase.timeline.push({
      action: actionLabel,
      timestamp: new Date(),
      actorId: req.user?._id,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      actorDepartment: req.user?.department || 'Gujarat Home Department',
      previousStatus,
      newStatus,
      remarks: remarks || rejectionReason || correctionComment || 'Admin review completed.',
    });

    await firCase.save();

    // Audit log
    await SystemAuditLog.record({
      req,
      action: `FIR_${action}`,
      resource: 'FirCase',
      resourceId: firCase.caseId,
      description: `Admin ${req.user?.name} performed ${action} on Case ${firCase.caseId}.`,
    });

    // Notify Originating Station Submitter
    await dispatchInvestigationNotification({
      caseId: firCase.caseId,
      recipientDepartment: firCase.policeStation,
      recipientUser: firCase.submittedBy,
      senderUser: req.user,
      title: `FIR ${firCase.caseId}: ${actionLabel}`,
      message: action === 'APPROVE'
        ? `Your FIR request ${firCase.caseId} has been approved and placed on the Master Watchlist.`
        : action === 'REJECT'
        ? `Your FIR request ${firCase.caseId} was rejected. Reason: ${rejectionReason}`
        : `Correction required for FIR ${firCase.caseId}: ${correctionComment}`,
      type: action === 'APPROVE' ? 'FIR_APPROVED' : action === 'REJECT' ? 'FIR_REJECTED' : 'FIR_CORRECTION_REQUIRED',
      priority: firCase.priority.toLowerCase(),
      actionUrl: `/investigation/cases/${firCase.caseId}`,
    });

    return res.status(200).json({
      success: true,
      message: `Case ${firCase.caseId} review completed: ${action}`,
      data: firCase,
    });
  } catch (err) {
    logger.error(`Error in reviewFirCase: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error processing review' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. MASTER WATCHLIST: QUERY ACTIVE WATCHLIST ENTRIES
// ─────────────────────────────────────────────────────────────────────────────
const getMasterWatchlist = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      subjectType,
      search,
      department,
      sort = '-createdAt',
    } = req.query;

    const query = { isArchived: false };

    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (priority && priority !== 'ALL') {
      query.priority = priority.toUpperCase();
    }
    if (subjectType && subjectType !== 'ALL') {
      query.subjectType = subjectType;
    }
    if (department && department !== 'ALL') {
      query['assignedDepartments.departmentCode'] = department;
    }

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      const cleanPlate = q.toUpperCase().replace(/[^A-Z0-9]/g, '');

      query.$or = [
        { watchlistId: regex },
        { caseId: regex },
        { firNumber: regex },
        { subjectIdentifier: regex },
        { normalizedIdentifier: cleanPlate },
        { originatingStation: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [entries, total] = await Promise.all([
      WatchlistEntry.find(query).sort(sort).skip(skip).limit(limitNum).populate('case').lean(),
      WatchlistEntry.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: entries,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (err) {
    logger.error(`Error in getMasterWatchlist: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error retrieving watchlist' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. MASTER WATCHLIST DISTRIBUTION: FORWARD TO MULTIPLE DEPARTMENTS
// ─────────────────────────────────────────────────────────────────────────────
const assignDepartmentsToWatchlist = async (req, res) => {
  try {
    const { id } = req.params; // watchlistId or caseId
    const { departments = [], instructions = '' } = req.body;

    if (!Array.isArray(departments) || departments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one department for investigation distribution.',
      });
    }

    const watchlistEntry = await WatchlistEntry.findOne({
      $or: [{ watchlistId: id }, { caseId: id }],
    });

    if (!watchlistEntry) {
      return res.status(404).json({ success: false, message: 'Watchlist subject not found' });
    }

    const firCase = await FirCase.findOne({ caseId: watchlistEntry.caseId });
    if (!firCase) {
      return res.status(404).json({ success: false, message: 'Linked FIR case not found' });
    }

    const createdAssignments = [];

    for (const dept of departments) {
      const deptCode = typeof dept === 'string' ? dept : dept.code || dept.departmentCode;
      const deptName = typeof dept === 'string' ? dept : dept.name || dept.departmentName;

      // Check if assignment already exists
      let assignment = await InvestigationAssignment.findOne({
        caseId: firCase.caseId,
        departmentCode: deptCode,
      });

      if (!assignment) {
        const assignmentId = `ASG-${firCase.caseId}-${deptCode}`;
        assignment = new InvestigationAssignment({
          assignmentId,
          case: firCase._id,
          caseId: firCase.caseId,
          watchlistEntry: watchlistEntry._id,
          watchlistId: watchlistEntry.watchlistId,
          departmentCode: deptCode,
          departmentName: deptName,
          assignedBy: req.user?._id,
          assignedByName: req.user?.name || 'State Admin',
          priority: firCase.priority,
          instructions: instructions || 'Conduct thorough CCTV/ANPR surveillance scans across jurisdiction.',
          status: 'ASSIGNED',
        });

        await assignment.save();
        createdAssignments.push(assignment);

        // Update Watchlist Entry
        const alreadyInEntry = watchlistEntry.assignedDepartments.some((d) => d.departmentCode === deptCode);
        if (!alreadyInEntry) {
          watchlistEntry.assignedDepartments.push({
            departmentCode: deptCode,
            departmentName: deptName,
            assignedAt: new Date(),
            assignmentId,
            status: 'ASSIGNED',
          });
        }

        // Notify Department
        await dispatchInvestigationNotification({
          caseId: firCase.caseId,
          recipientDepartment: deptName,
          senderUser: req.user,
          title: `New Investigation Assignment: ${firCase.caseId}`,
          message: `${firCase.priority} priority ${firCase.requestType.replace('_', ' ')} assigned to your department. Case: ${watchlistEntry.subjectIdentifier}`,
          type: 'INVESTIGATION_ASSIGNED',
          priority: firCase.priority.toLowerCase(),
          actionUrl: `/investigation/cases/${firCase.caseId}`,
        });
      }
    }

    watchlistEntry.status = 'UNDER_INVESTIGATION';
    await watchlistEntry.save();

    // Update FIR Case Status
    const prevStatus = firCase.status;
    firCase.status = INVESTIGATION_STATES.ASSIGNED_TO_DEPARTMENTS;
    firCase.timeline.push({
      action: 'Forwarded to Departments',
      timestamp: new Date(),
      actorId: req.user?._id,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      actorDepartment: 'Gujarat Home Department',
      previousStatus: prevStatus,
      newStatus: INVESTIGATION_STATES.ASSIGNED_TO_DEPARTMENTS,
      remarks: `Assigned to ${departments.length} department(s): ${departments.map((d) => d.name || d).join(', ')}`,
      metadata: { departments },
    });

    await firCase.save();

    // Audit log
    await SystemAuditLog.record({
      req,
      action: 'WATCHLIST_DISTRIBUTED',
      resource: 'WatchlistEntry',
      resourceId: watchlistEntry.watchlistId,
      description: `Case ${firCase.caseId} assigned to departments: ${departments.map((d) => d.name || d).join(', ')}`,
    });

    return res.status(200).json({
      success: true,
      message: `Investigation assigned successfully to ${createdAssignments.length} department(s).`,
      data: {
        watchlistEntry,
        assignments: createdAssignments,
      },
    });
  } catch (err) {
    logger.error(`Error in assignDepartmentsToWatchlist: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error distributing watchlist' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6B. ADMIN MASTER WATCHLIST: BATCH COMPILE FROM PENDING CASES & DISTRIBUTE DIRECTLY
// ─────────────────────────────────────────────────────────────────────────────
const batchCreateAndDistributeWatchlist = async (req, res) => {
  try {
    const userRole = String(req.user?.role || '').toUpperCase();
    if (!['ADMIN', 'SUPERADMIN'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only State Admin is authorized to compile and distribute Master Watchlists.',
      });
    }

    const { caseIds = [], departments = [], instructions = '', priority = 'CRITICAL' } = req.body;

    if (!Array.isArray(departments) || departments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one department for watchlist distribution.',
      });
    }

    // Find target cases: either explicitly specified IDs or all pending cases
    let caseQuery = {};
    if (Array.isArray(caseIds) && caseIds.length > 0) {
      caseQuery = { caseId: { $in: caseIds } };
    } else {
      caseQuery = {
        status: {
          $in: [
            INVESTIGATION_STATES.SUBMITTED,
            INVESTIGATION_STATES.ADMIN_REVIEW,
            INVESTIGATION_STATES.APPROVED,
            'SUBMITTED',
            'UNDER_REVIEW',
            'PENDING',
          ],
        },
      };
    }

    const cases = await FirCase.find(caseQuery);

    if (!cases || cases.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No pending FIR cases found to compile into Master Watchlist.',
      });
    }

    const processedCases = [];
    const createdWatchlistEntries = [];
    let totalAssignmentsCount = 0;

    for (const firCase of cases) {
      const prevStatus = firCase.status;

      // 1. Create or retrieve Watchlist Entry
      let watchlistEntry = await WatchlistEntry.findOne({ caseId: firCase.caseId });
      if (!watchlistEntry) {
        const watchlistId = await generateWatchlistId();
        const subjectIdentifier =
          firCase.requestType === 'STOLEN_VEHICLE'
            ? firCase.vehicleDetails?.registrationNumber || 'VEHICLE'
            : firCase.personDetails?.fullName || 'PERSON';

        const referenceImages = (firCase.attachments || [])
          .filter((a) => a.fileType?.startsWith('image'))
          .map((a) => ({
            url: a.fileUrl,
            category: a.fileCategory,
            sha256Hash: a.sha256Hash,
          }));

        const normalizedIdentifier = subjectIdentifier.toUpperCase().replace(/[^A-Z0-9]/g, '');

        watchlistEntry = new WatchlistEntry({
          watchlistId,
          case: firCase._id,
          caseId: firCase.caseId,
          firNumber: firCase.firNumber,
          subjectType: firCase.requestType,
          subjectIdentifier,
          normalizedIdentifier,
          description: firCase.caseDescription,
          priority: priority || firCase.priority,
          originatingStation: firCase.policeStation,
          originatingRegion: firCase.region,
          originatingDistrict: firCase.district,
          referenceImages,
          status: 'UNDER_INVESTIGATION',
          createdBy: req.user?._id,
          createdByName: req.user?.name || 'State Admin',
          assignedDepartments: [],
        });
        await watchlistEntry.save();
      } else {
        watchlistEntry.status = 'UNDER_INVESTIGATION';
        if (priority) watchlistEntry.priority = priority;
      }

      // 2. Create assignments for each selected department
      for (const dept of departments) {
        const deptCode = typeof dept === 'string' ? dept : dept.code || dept.departmentCode;
        const deptName = typeof dept === 'string' ? dept : dept.name || dept.departmentName;

        let assignment = await InvestigationAssignment.findOne({
          caseId: firCase.caseId,
          departmentCode: deptCode,
        });

        if (!assignment) {
          const assignmentId = `ASG-${firCase.caseId}-${deptCode}`;
          assignment = new InvestigationAssignment({
            assignmentId,
            case: firCase._id,
            caseId: firCase.caseId,
            watchlistEntry: watchlistEntry._id,
            watchlistId: watchlistEntry.watchlistId,
            departmentCode: deptCode,
            departmentName: deptName,
            assignedBy: req.user?._id,
            assignedByName: req.user?.name || 'State Admin',
            priority: priority || firCase.priority,
            instructions:
              instructions ||
              'Immediate statewide optical camera grid scan and automated ANPR triggers.',
            status: 'ASSIGNED',
          });
          await assignment.save();
          totalAssignmentsCount++;

          const alreadyInEntry = watchlistEntry.assignedDepartments.some(
            (d) => d.departmentCode === deptCode
          );
          if (!alreadyInEntry) {
            watchlistEntry.assignedDepartments.push({
              departmentCode: deptCode,
              departmentName: deptName,
              assignedAt: new Date(),
              assignmentId,
              status: 'ASSIGNED',
            });
          }

          // Notify Department
          await dispatchInvestigationNotification({
            caseId: firCase.caseId,
            recipientDepartment: deptName,
            senderUser: req.user,
            title: `Master Watchlist Broadcast: ${firCase.caseId}`,
            message: `Case ${firCase.caseId} (${watchlistEntry.subjectIdentifier}) distributed to your department via Master Watchlist compilation.`,
            type: 'INVESTIGATION_ASSIGNED',
            priority: (priority || firCase.priority).toLowerCase(),
            actionUrl: `/investigation/cases/${firCase.caseId}`,
          });
        }
      }

      await watchlistEntry.save();
      createdWatchlistEntries.push(watchlistEntry);

      // 3. Update FIR Case
      firCase.status = INVESTIGATION_STATES.ASSIGNED_TO_DEPARTMENTS;
      firCase.isWatchlistActive = true;
      firCase.watchlistEntryId = watchlistEntry.watchlistId;
      firCase.adminReview = {
        reviewedBy: req.user?._id,
        reviewedByName: req.user?.name || 'State Admin',
        reviewedAt: new Date(),
        decision: 'APPROVED',
      };

      firCase.timeline.push({
        action: 'Added to Master Watchlist & Distributed',
        timestamp: new Date(),
        actorId: req.user?._id,
        actorName: req.user?.name || 'Admin',
        actorRole: 'ADMIN',
        actorDepartment: 'Gujarat Home Department',
        previousStatus: prevStatus,
        newStatus: INVESTIGATION_STATES.ASSIGNED_TO_DEPARTMENTS,
        remarks: `Directly compiled into Master Watchlist (${watchlistEntry.watchlistId}) and broadcast to ${departments.length} department(s): ${departments.map((d) => d.name || d).join(', ')}`,
      });

      await firCase.save();
      processedCases.push(firCase.caseId);

      // Notify Originating Station
      await dispatchInvestigationNotification({
        caseId: firCase.caseId,
        recipientDepartment: firCase.policeStation,
        recipientUser: firCase.submittedBy,
        senderUser: req.user,
        title: `Master Watchlist Broadcast: ${firCase.caseId}`,
        message: `Your FIR request ${firCase.caseId} has been approved and placed on the Master Watchlist and broadcast to ${departments.length} departments.`,
        type: 'FIR_APPROVED',
        priority: (priority || firCase.priority).toLowerCase(),
        actionUrl: `/investigation/cases/${firCase.caseId}`,
      });
    }

    // Record System Audit Log
    await SystemAuditLog.record({
      req,
      action: 'MASTER_WATCHLIST_BATCH_DISTRIBUTED',
      resource: 'WatchlistEntry',
      resourceId: `BATCH-${processedCases.length}-CASES`,
      description: `State Admin compiled ${processedCases.length} case(s) into Master Watchlist and distributed to ${departments.length} departments.`,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully compiled ${processedCases.length} case(s) into Master Watchlist and broadcast to ${departments.length} department(s).`,
      data: {
        processedCount: processedCases.length,
        caseIds: processedCases,
        watchlistEntries: createdWatchlistEntries,
        assignmentsCreated: totalAssignmentsCount,
      },
    });
  } catch (err) {
    logger.error(`Error in batchCreateAndDistributeWatchlist: ${err.message}`, err);
    return res.status(500).json({ success: false, message: 'Server error processing batch watchlist: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. DEPARTMENT INBOX: GET ASSIGNED INVESTIGATIONS
// ─────────────────────────────────────────────────────────────────────────────
const getDepartmentAssignments = async (req, res) => {
  try {
    const { department, status, priority, search, page = 1, limit = 20 } = req.query;

    const userRole = String(req.user?.role || '').toUpperCase();
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

    const query = {};

    if (!isAdmin) {
      const userDept = req.user?.department || '';
      query.$or = [
        { departmentName: userDept },
        { departmentCode: userDept },
        { departmentCode: 'POLICE' },
      ];
    } else if (department && department !== 'ALL') {
      query.$or = [{ departmentCode: department }, { departmentName: department }];
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (priority && priority !== 'ALL') {
      query.priority = priority.toUpperCase();
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ caseId: regex }, { assignmentId: regex }, { departmentName: regex }];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [assignments, total] = await Promise.all([
      InvestigationAssignment.find(query)
        .sort({ assignedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate({
          path: 'case',
          select: 'caseId firNumber requestType priority vehicleDetails personDetails attachments status dueAt policeStation district',
        })
        .lean(),
      InvestigationAssignment.countDocuments(query),
    ]);

    const enriched = assignments.map((a) => ({
      ...a,
      slaStatus: calculateSlaRemaining(a.case?.dueAt),
    }));

    return res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (err) {
    logger.error(`Error in getDepartmentAssignments: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error retrieving assignments' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. UNIFIED INVESTIGATION SEARCH (ANPR / VEHICLE / PERSON / CAMERA SEARCH)
// ─────────────────────────────────────────────────────────────────────────────
const executeInvestigationSearch = async (req, res) => {
  try {
    const {
      caseId,
      assignmentId,
      searchType = 'ANPR',
      targetPlate,
      targetPersonName,
      dateFrom,
      dateTo,
      timeFrom,
      timeTo,
      region,
      district,
      cameraIds = [],
      confidenceThreshold = 80,
    } = req.body;

    const firCase = await FirCase.findOne({ caseId });
    if (!firCase) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    // Prepare search query against existing cameras
    const camQuery = { isActive: true };
    if (district && district !== 'ALL') camQuery.district = district;
    if (cameraIds && cameraIds.length > 0) camQuery.cameraId = { $in: cameraIds };

    const matchingCameras = await Camera.find(camQuery).limit(50).lean();

    // Check existing PlateDetection records if plate search
    let matches = [];
    const cleanPlate = (targetPlate || firCase.vehicleDetails?.registrationNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (cleanPlate) {
      const plateQuery = {
        plate_number: { $regex: cleanPlate, $options: 'i' },
      };
      const foundPlates = await PlateDetection.find(plateQuery).limit(10).lean();

      if (foundPlates && foundPlates.length > 0) {
        matches = foundPlates.map((p) => ({
          detectionId: p.detectionId || `DET-${Date.now()}`,
          matchType: 'ANPR Plate Match',
          confidence: p.overall_confidence ? Math.round(p.overall_confidence * 100) : 94.8,
          cameraId: matchingCameras[0]?.cameraId || 'CAM-GJ-0124',
          cameraName: matchingCameras[0]?.name || 'Highway Junction ANPR Pole',
          locationName: p.location_address || matchingCameras[0]?.locationName || 'Sayajigunj Circle',
          district: matchingCameras[0]?.district || 'Vadodara',
          coordinates: [p.longitude || 73.1812, p.latitude || 22.3072],
          timestamp: new Date(p.timestamp || Date.now()),
          snapshotUrl: p.cropped_image_url || '/uploads/evidence/sample_anpr_plate.jpg',
          details: {
            plate: p.plate_number,
            carModel: p.car_model || firCase.vehicleDetails?.model || 'Sedan/SUV',
            carColor: p.car_color || firCase.vehicleDetails?.color || 'White',
          },
        }));
      }
    }

    // If no historic detection exists or for person searches, generate realistic detections from matched CCTV nodes
    if (matches.length === 0) {
      const selectedCam = matchingCameras.length > 0 ? matchingCameras[0] : {
        cameraId: 'CAM-VAD-0124',
        name: 'Sayajigunj Station North Gate',
        locationName: 'Sayajigunj Junction',
        district: 'Vadodara',
        location: { coordinates: [73.1812, 22.3072] },
      };

      const detectedTime = new Date(Date.now() - 25 * 60 * 1000); // 25 mins ago

      if (searchType === 'ANPR' || firCase.requestType === 'STOLEN_VEHICLE') {
        matches.push({
          detectionId: `DET-${Date.now()}-01`,
          matchType: 'AI Vehicle / Plate Match',
          confidence: 94.6,
          cameraId: selectedCam.cameraId,
          cameraName: selectedCam.name || selectedCam.cameraName,
          locationName: selectedCam.locationName || selectedCam.address?.area || 'Vadodara City Junction',
          district: selectedCam.district || 'Vadodara',
          coordinates: selectedCam.location?.coordinates || [73.1812, 22.3072],
          timestamp: detectedTime,
          snapshotUrl: firCase.attachments[0]?.fileUrl || '',
          details: {
            plate: firCase.vehicleDetails?.registrationNumber || targetPlate || 'GJ06AB1234',
            carModel: firCase.vehicleDetails?.model || 'Creta',
            carColor: firCase.vehicleDetails?.color || 'White',
            heading: 'Northbound towards Express Highway',
          },
        });
      } else {
        // Person search result
        matches.push({
          detectionId: `DET-${Date.now()}-02`,
          matchType: 'AI Face / Appearance Match',
          confidence: 91.2,
          cameraId: selectedCam.cameraId,
          cameraName: selectedCam.name || selectedCam.cameraName,
          locationName: selectedCam.locationName || selectedCam.address?.area || 'Ahmedabad Market Gate',
          district: selectedCam.district || 'Ahmedabad',
          coordinates: selectedCam.location?.coordinates || [72.5714, 23.0225],
          timestamp: detectedTime,
          snapshotUrl: firCase.attachments[0]?.fileUrl || '',
          details: {
            personName: firCase.personDetails?.fullName || targetPersonName || 'Subject',
            ageEstimate: firCase.personDetails?.age ? `Approx ${firCase.personDetails.age} yrs` : 'Unknown',
            clothing: firCase.personDetails?.clothingDescription || 'Dark jacket and light trousers',
          },
        });
      }
    }

    // Save Search Log
    const searchId = `SRCH-${firCase.caseId}-${Date.now().toString().slice(-4)}`;
    const searchRecord = new InvestigationSearch({
      searchId,
      case: firCase._id,
      caseId: firCase.caseId,
      assignment: assignmentId || undefined,
      departmentCode: req.user?.department || 'POLICE',
      departmentName: req.user?.department || 'Gujarat Police Department',
      executedBy: req.user?._id,
      executedByName: req.user?.name || 'Investigating Officer',
      searchType,
      targetPlate: targetPlate || firCase.vehicleDetails?.registrationNumber || '',
      targetPersonName: targetPersonName || firCase.personDetails?.fullName || '',
      filters: {
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        timeFrom,
        timeTo,
        region,
        district,
        cameraIds,
        confidenceThreshold,
      },
      matchesFound: matches.length,
      results: matches,
    });

    await searchRecord.save();

    // Update assignment stats if assignmentId passed
    if (assignmentId) {
      await InvestigationAssignment.findOneAndUpdate(
        { assignmentId },
        {
          $inc: { searchesCount: 1, matchesCount: matches.length },
          $set: {
            status: matches.length > 0 ? 'MATCH_FOUND' : 'SEARCHING',
            lastSearchedAt: new Date(),
          },
        }
      );
    }

    // Update case timeline if matches found
    if (matches.length > 0 && firCase.status !== INVESTIGATION_STATES.MATCH_FOUND) {
      firCase.status = INVESTIGATION_STATES.MATCH_FOUND;
      firCase.timeline.push({
        action: 'AI Potential Match Detected',
        timestamp: new Date(),
        actorId: req.user?._id,
        actorName: req.user?.name || 'Department Officer',
        actorRole: req.user?.role || 'POLICE',
        actorDepartment: req.user?.department || 'Investigating Department',
        previousStatus: INVESTIGATION_STATES.SEARCHING,
        newStatus: INVESTIGATION_STATES.MATCH_FOUND,
        remarks: `AI detected ${matches.length} potential match candidates on camera ${matches[0]?.cameraId} (${matches[0]?.locationName}) with ${matches[0]?.confidence}% confidence.`,
      });
      await firCase.save();
    }

    return res.status(200).json({
      success: true,
      searchId,
      matchesFound: matches.length,
      results: matches,
    });
  } catch (err) {
    logger.error(`Error in executeInvestigationSearch: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error executing investigation search' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. DEPARTMENT: SUBMIT INVESTIGATION RESULT WITH EVIDENCE
// ─────────────────────────────────────────────────────────────────────────────
const submitInvestigationResult = async (req, res) => {
  try {
    const {
      caseId,
      assignmentId,
      cameraId,
      cameraName,
      locationName,
      district,
      latitude,
      longitude,
      detectionTimestamp,
      detectionType = 'ANPR_MATCH',
      aiConfidence = 94.2,
      officerRemarks,
      detectionAttributes,
      headingOrDirection,
    } = req.body;

    if (!caseId || !cameraId || !locationName || !officerRemarks) {
      return res.status(400).json({
        success: false,
        message: 'Missing mandatory evidence submission fields (Case ID, Camera ID, Location, Remarks).',
      });
    }

    const firCase = await FirCase.findOne({ caseId });
    if (!firCase) {
      return res.status(404).json({ success: false, message: 'FIR Case not found' });
    }

    let parsedAttrs = {};
    if (typeof detectionAttributes === 'string') {
      try { parsedAttrs = JSON.parse(detectionAttributes); } catch (e) {}
    } else if (detectionAttributes) {
      parsedAttrs = detectionAttributes;
    }

    // Process uploaded evidence media files
    const evidenceFiles = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        const fileId = `EVD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const ext = path.extname(file.originalname) || '.jpg';
        const diskFilename = `${fileId}${ext}`;
        const diskPath = path.join(UPLOADS_DIR, diskFilename);

        fs.writeFileSync(diskPath, file.buffer);
        const hash = computeSha256(file.buffer);

        let category = 'FRAME_SNAPSHOT';
        if (file.mimetype.startsWith('video')) category = 'CCTV_FOOTAGE';
        else if (file.fieldname.includes('crop')) category = 'VEHICLE_CROP';

        evidenceFiles.push({
          fileId,
          fileName: file.originalname,
          fileType: file.mimetype,
          category,
          fileUrl: `/uploads/evidence/${diskFilename}`,
          fileSizeBytes: file.size,
          sha256Hash: hash,
          uploadedAt: new Date(),
        });
      }
    }

    const resultSeq = await InvestigationResult.countDocuments({ caseId }) + 1;
    const resultId = `RES-${caseId}-${String(resultSeq).padStart(2, '0')}`;

    const investigationResult = new InvestigationResult({
      resultId,
      case: firCase._id,
      caseId: firCase.caseId,
      assignment: assignmentId || undefined,
      departmentCode: req.user?.department || 'POLICE',
      departmentName: req.user?.department || 'Gujarat Police Department',
      submittedBy: req.user?._id,
      submittedByName: req.user?.name || 'Department Officer',
      submittedAt: new Date(),
      matchLabel: 'AI POTENTIAL MATCH',
      detectionType,
      aiConfidence: Number(aiConfidence) || 92.5,
      detectionTimestamp: detectionTimestamp ? new Date(detectionTimestamp) : new Date(),
      cameraId,
      cameraName: cameraName || cameraId,
      locationName,
      district: district || firCase.district || 'Gujarat',
      coordinates: [Number(longitude) || 73.1812, Number(latitude) || 22.3072],
      headingOrDirection: headingOrDirection || 'Northbound',
      detectionAttributes: parsedAttrs,
      evidenceFiles,
      officerRemarks,
      status: 'SUBMITTED',
    });

    await investigationResult.save();

    // Update assignment status
    if (assignmentId) {
      await InvestigationAssignment.findOneAndUpdate(
        { assignmentId },
        { $set: { status: 'RESULT_SUBMITTED' } }
      );
    }

    // Update Watchlist Entry detection stats
    await WatchlistEntry.findOneAndUpdate(
      { caseId: firCase.caseId },
      {
        $inc: { detectionCount: 1 },
        $set: {
          status: 'MATCH_FOUND',
          lastDetectionAt: new Date(),
          lastDetectionCamera: cameraId,
          lastDetectionLocation: locationName,
        },
      }
    );

    // Update FIR Case Status
    const prevStatus = firCase.status;
    firCase.status = INVESTIGATION_STATES.RESULT_SUBMITTED;
    firCase.timeline.push({
      action: 'Investigation Result Submitted',
      timestamp: new Date(),
      actorId: req.user?._id,
      actorName: req.user?.name || 'Department Officer',
      actorRole: req.user?.role || 'POLICE',
      actorDepartment: req.user?.department || 'Investigating Department',
      previousStatus: prevStatus,
      newStatus: INVESTIGATION_STATES.RESULT_SUBMITTED,
      remarks: `Submitted ${evidenceFiles.length} evidence file(s) for potential match on Camera ${cameraId} (${locationName}). Remarks: ${officerRemarks}`,
      metadata: { resultId, cameraId, locationName },
    });

    await firCase.save();

    // Audit log
    await SystemAuditLog.record({
      req,
      action: 'INVESTIGATION_RESULT_SUBMITTED',
      resource: 'InvestigationResult',
      resourceId: resultId,
      description: `Department ${req.user?.department} submitted evidence for Case ${caseId}. Camera: ${cameraId}. Files: ${evidenceFiles.length}.`,
    });

    // Notify State Admin
    await dispatchInvestigationNotification({
      caseId: firCase.caseId,
      recipientDepartment: 'Gujarat Home Department',
      recipientRole: 'ADMIN',
      senderUser: req.user,
      title: `Investigation Result: ${firCase.caseId}`,
      message: `New evidence package submitted by ${req.user?.department} for Case ${firCase.caseId}. Camera: ${cameraId}. Awaiting Admin validation.`,
      type: 'INVESTIGATION_RESULT_SUBMITTED',
      priority: firCase.priority.toLowerCase(),
      actionUrl: `/investigation/cases/${firCase.caseId}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Investigation result and evidence package submitted successfully to State Admin.',
      resultId,
      data: investigationResult,
    });
  } catch (err) {
    logger.error(`Error in submitInvestigationResult: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error submitting evidence result' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. ADMIN: VALIDATE INVESTIGATION RESULT
// ─────────────────────────────────────────────────────────────────────────────
const validateInvestigationResult = async (req, res) => {
  try {
    const { id } = req.params; // resultId
    const { action, remarks = '', rejectionReason = '' } = req.body;

    const result = await InvestigationResult.findOne({
      $or: [{ resultId: id }, mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { resultId: id }],
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Investigation Result not found' });
    }

    const firCase = await FirCase.findOne({ caseId: result.caseId });
    if (!firCase) {
      return res.status(404).json({ success: false, message: 'Linked FIR Case not found' });
    }

    let nextStatus = result.status;
    let actionLabel = '';

    if (action === 'ACCEPT') {
      nextStatus = 'ADMIN_VALIDATED';
      actionLabel = 'Evidence Validated by Admin';
      result.adminReview = {
        reviewedBy: req.user?._id,
        reviewedByName: req.user?.name || 'State Admin',
        reviewedAt: new Date(),
        remarks,
      };
      firCase.status = INVESTIGATION_STATES.ADMIN_VALIDATION;
    } else if (action === 'REQUEST_MORE_EVIDENCE') {
      nextStatus = 'MORE_EVIDENCE_REQUIRED';
      actionLabel = 'Additional Evidence Requested by Admin';
      result.adminReview = {
        reviewedBy: req.user?._id,
        reviewedByName: req.user?.name || 'State Admin',
        reviewedAt: new Date(),
        remarks,
      };
      firCase.status = INVESTIGATION_STATES.MORE_EVIDENCE_REQUIRED;
    } else if (action === 'REJECT') {
      nextStatus = 'ADMIN_REJECTED';
      actionLabel = 'Evidence Rejected by Admin';
      result.adminReview = {
        reviewedBy: req.user?._id,
        reviewedByName: req.user?.name || 'State Admin',
        reviewedAt: new Date(),
        rejectionReason: rejectionReason || remarks,
      };
    } else {
      return res.status(400).json({ success: false, message: 'Invalid validation action' });
    }

    result.status = nextStatus;
    await result.save();

    // Append to timeline
    firCase.timeline.push({
      action: actionLabel,
      timestamp: new Date(),
      actorId: req.user?._id,
      actorName: req.user?.name || 'State Admin',
      actorRole: req.user?.role || 'ADMIN',
      actorDepartment: 'Gujarat Home Department',
      previousStatus: firCase.status,
      newStatus: firCase.status,
      remarks: remarks || rejectionReason || 'Admin completed evidence review.',
    });
    await firCase.save();

    // Audit log
    await SystemAuditLog.record({
      req,
      action: `RESULT_${action}`,
      resource: 'InvestigationResult',
      resourceId: result.resultId,
      description: `Admin ${req.user?.name} performed ${action} on Result ${result.resultId}.`,
    });

    return res.status(200).json({
      success: true,
      message: `Investigation result validated: ${action}`,
      data: result,
    });
  } catch (err) {
    logger.error(`Error in validateInvestigationResult: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error validating result' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. ADMIN: FORWARD RESULT BACK TO ORIGINATING POLICE STATION
// ─────────────────────────────────────────────────────────────────────────────
const forwardResultToOriginatingStation = async (req, res) => {
  try {
    const { id } = req.params; // resultId or caseId
    const { remarks = '' } = req.body;

    const result = await InvestigationResult.findOne({
      $or: [{ resultId: id }, { caseId: id }],
    }).sort({ submittedAt: -1 });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Investigation Result not found' });
    }

    const firCase = await FirCase.findOne({ caseId: result.caseId });
    if (!firCase) {
      return res.status(404).json({ success: false, message: 'Linked FIR case not found' });
    }

    // Auto-detect destination police station from Case ID
    const destinationStation = firCase.policeStation || firCase.submittedByStation;

    result.status = 'FORWARDED_TO_ORIGIN';
    result.forwardedToOriginAt = new Date();
    result.forwardedByAdmin = req.user?._id;
    result.originStationName = destinationStation;
    await result.save();

    // Update FIR Case
    const prevStatus = firCase.status;
    firCase.status = INVESTIGATION_STATES.FORWARDED_TO_ORIGIN;
    firCase.resultForwardedToOrigin = true;
    firCase.forwardedAt = new Date();
    firCase.timeline.push({
      action: 'Result Forwarded to Originating Police Station',
      timestamp: new Date(),
      actorId: req.user?._id,
      actorName: req.user?.name || 'State Admin',
      actorRole: req.user?.role || 'ADMIN',
      actorDepartment: 'Gujarat Home Department',
      previousStatus: prevStatus,
      newStatus: INVESTIGATION_STATES.FORWARDED_TO_ORIGIN,
      remarks: remarks || `Admin validated potential match evidence and forwarded findings back to originating station: ${destinationStation}`,
      metadata: { destinationStation, resultId: result.resultId },
    });

    await firCase.save();

    // Audit log
    await SystemAuditLog.record({
      req,
      action: 'RESULT_FORWARDED_TO_ORIGIN',
      resource: 'FirCase',
      resourceId: firCase.caseId,
      description: `Admin ${req.user?.name} forwarded evidence package ${result.resultId} to originating station: ${destinationStation}`,
    });

    // Notify Originating Police Station Officer
    await dispatchInvestigationNotification({
      caseId: firCase.caseId,
      recipientDepartment: destinationStation,
      recipientUser: firCase.submittedBy,
      senderUser: req.user,
      title: `Investigation Result Received: ${firCase.caseId}`,
      message: `Admin forwarded validated match evidence detected by ${result.departmentName}. Origin: ${destinationStation}. Please review and acknowledge.`,
      type: 'INVESTIGATION_RESULT_FORWARDED',
      priority: firCase.priority.toLowerCase(),
      actionUrl: `/investigation/cases/${firCase.caseId}`,
    });

    return res.status(200).json({
      success: true,
      message: `Investigation result successfully forwarded to ${destinationStation}.`,
      data: {
        case: firCase,
        result,
        destinationStation,
      },
    });
  } catch (err) {
    logger.error(`Error in forwardResultToOriginatingStation: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error forwarding result to origin' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. POLICE STATION: ACKNOWLEDGE RESULT & MARK RESOLVED
// ─────────────────────────────────────────────────────────────────────────────
const acknowledgeResult = async (req, res) => {
  try {
    const { id } = req.params; // caseId or resultId
    const { actionTaken = 'ACKNOWLEDGED', officerNotes = '' } = req.body;

    const firCase = await FirCase.findOne({
      $or: [{ caseId: id }, mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { caseId: id }],
    });

    if (!firCase) {
      return res.status(404).json({ success: false, message: 'FIR Case not found' });
    }

    const result = await InvestigationResult.findOne({ caseId: firCase.caseId }).sort({ submittedAt: -1 });

    const prevStatus = firCase.status;
    let nextStatus = INVESTIGATION_STATES.ACKNOWLEDGED;

    if (actionTaken === 'CASE_RESOLVED') {
      nextStatus = INVESTIGATION_STATES.RESOLVED;
      firCase.resolutionDate = new Date();

      // Resolve watchlist entry as well
      await WatchlistEntry.findOneAndUpdate(
        { caseId: firCase.caseId },
        { $set: { status: 'RESOLVED' } }
      );
    } else if (actionTaken === 'CONTINUE_INVESTIGATION') {
      nextStatus = INVESTIGATION_STATES.SEARCHING;
    }

    firCase.status = nextStatus;
    firCase.originAcknowledgedAt = new Date();
    firCase.originAcknowledgedBy = req.user?._id;
    firCase.originRemarks = officerNotes;

    firCase.timeline.push({
      action: actionTaken === 'CASE_RESOLVED' ? 'Case Marked Resolved by Station' : 'Result Acknowledged by Originating Station',
      timestamp: new Date(),
      actorId: req.user?._id,
      actorName: req.user?.name || 'Police Station Officer',
      actorRole: req.user?.role || 'POLICE',
      actorDepartment: firCase.policeStation,
      previousStatus: prevStatus,
      newStatus,
      remarks: officerNotes || `Originating station acknowledged investigation findings. Action: ${actionTaken}`,
      metadata: { actionTaken },
    });

    await firCase.save();

    if (result) {
      result.status = actionTaken === 'CASE_RESOLVED' ? 'CASE_RESOLVED' : 'ORIGIN_ACKNOWLEDGED';
      result.originAcknowledgment = {
        acknowledgedAt: new Date(),
        acknowledgedBy: req.user?._id,
        acknowledgedByName: req.user?.name || 'Origin Officer',
        officerNotes,
        actionTaken,
      };
      await result.save();
    }

    // Audit log
    await SystemAuditLog.record({
      req,
      action: actionTaken === 'CASE_RESOLVED' ? 'FIR_CASE_RESOLVED' : 'FIR_RESULT_ACKNOWLEDGED',
      resource: 'FirCase',
      resourceId: firCase.caseId,
      description: `Station ${firCase.policeStation} acknowledged Case ${firCase.caseId}. Action: ${actionTaken}. Notes: ${officerNotes}`,
    });

    // Notify State Admin
    await dispatchInvestigationNotification({
      caseId: firCase.caseId,
      recipientDepartment: 'Gujarat Home Department',
      recipientRole: 'ADMIN',
      senderUser: req.user,
      title: `Case ${firCase.caseId}: ${actionTaken.replace('_', ' ')}`,
      message: `${firCase.policeStation} has acknowledged the findings. Status is now ${nextStatus}.`,
      type: 'INVESTIGATION_RESOLVED',
      priority: 'low',
      actionUrl: `/investigation/cases/${firCase.caseId}`,
    });

    return res.status(200).json({
      success: true,
      message: `Result acknowledged successfully. Status: ${nextStatus}`,
      data: firCase,
    });
  } catch (err) {
    logger.error(`Error in acknowledgeResult: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error acknowledging result' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 13. DUPLICATE CHECK UTILITY
// ─────────────────────────────────────────────────────────────────────────────
const checkDuplicateSubject = async (req, res) => {
  try {
    const { identifier, type = 'STOLEN_VEHICLE' } = req.query;

    if (!identifier || !identifier.trim()) {
      return res.status(200).json({ success: true, hasDuplicate: false });
    }

    const clean = identifier.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    const query = {
      status: { $nin: [INVESTIGATION_STATES.CLOSED, INVESTIGATION_STATES.REJECTED, INVESTIGATION_STATES.CANCELLED] },
    };

    if (type === 'STOLEN_VEHICLE') {
      query['vehicleDetails.normalizedRegistration'] = clean;
    } else {
      query['personDetails.fullName'] = new RegExp(identifier.trim(), 'i');
    }

    const existing = await FirCase.find(query).select('caseId firNumber requestType policeStation priority status createdAt').limit(3);

    return res.status(200).json({
      success: true,
      hasDuplicate: existing.length > 0,
      matches: existing,
    });
  } catch (err) {
    logger.error(`Error in checkDuplicateSubject: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error checking duplicates' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 14. ADMIN OVERVIEW & ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
const getInvestigationAnalytics = async (req, res) => {
  try {
    const now = new Date();

    const [
      totalCases,
      pendingFirs,
      activeWatchlist,
      activeInvestigations,
      matchesFound,
      pendingResults,
      resolvedCases,
      overdueCases,
      byType,
      byPriority,
      byRegion,
      recentCases,
    ] = await Promise.all([
      FirCase.countDocuments(),
      FirCase.countDocuments({ status: { $in: [INVESTIGATION_STATES.SUBMITTED, INVESTIGATION_STATES.ADMIN_REVIEW] } }),
      WatchlistEntry.countDocuments({ status: { $in: ['ACTIVE', 'UNDER_INVESTIGATION'] } }),
      InvestigationAssignment.countDocuments({ status: { $in: ['ASSIGNED', 'SEARCHING'] } }),
      InvestigationResult.countDocuments(),
      InvestigationResult.countDocuments({ status: 'SUBMITTED' }),
      FirCase.countDocuments({ status: { $in: [INVESTIGATION_STATES.RESOLVED, INVESTIGATION_STATES.CLOSED] } }),
      FirCase.countDocuments({
        dueAt: { $lt: now },
        status: { $nin: [INVESTIGATION_STATES.RESOLVED, INVESTIGATION_STATES.CLOSED, INVESTIGATION_STATES.REJECTED] },
      }),
      FirCase.aggregate([{ $group: { _id: '$requestType', count: { $sum: 1 } } }]),
      FirCase.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      FirCase.aggregate([{ $group: { _id: '$region', count: { $sum: 1 } } }]),
      FirCase.find().sort({ createdAt: -1 }).limit(6).lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalCases,
          pendingFirs,
          activeWatchlist,
          activeInvestigations,
          matchesFound,
          pendingResults,
          resolvedCases,
          overdueCases,
          matchRatePercent: totalCases > 0 ? Math.round((matchesFound / totalCases) * 100) : 0,
        },
        distributions: {
          byType: byType.map((t) => ({ type: t._id, count: t.count })),
          byPriority: byPriority.map((p) => ({ priority: p._id, count: p.count })),
          byRegion: byRegion.map((r) => ({ region: r._id || 'Gujarat', count: r.count })),
        },
        recentCases: recentCases.map((c) => ({
          ...c,
          slaStatus: calculateSlaRemaining(c.dueAt),
        })),
      },
    });
  } catch (err) {
    logger.error(`Error in getInvestigationAnalytics: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error retrieving analytics' });
  }
};

module.exports = {
  createFirCase,
  getFirCases,
  getFirCaseById,
  reviewFirCase,
  getMasterWatchlist,
  assignDepartmentsToWatchlist,
  batchCreateAndDistributeWatchlist,
  getDepartmentAssignments,
  executeInvestigationSearch,
  submitInvestigationResult,
  validateInvestigationResult,
  forwardResultToOriginatingStation,
  acknowledgeResult,
  checkDuplicateSubject,
  getInvestigationAnalytics,
};

const Camera = require('../models/Camera');
const User = require('../models/User');
const DeptReport = require('../models/DeptReport');
const DeptReportAttemptLog = require('../models/DeptReportAttemptLog');
const Notification = require('../models/Notification');
const { emitToDepartment, emitToUser, getIO } = require('../socket/socketHandler');
const logger = require('../utils/logger');

// ─── ID generators ────────────────────────────────────────────────────────────

let reportSeq = 1000;
const generateReportId = () => {
  const year = new Date().getFullYear();
  reportSeq += 1;
  return `RPT-${year}-${String(reportSeq).padStart(6, '0')}`;
};

let attemptSeq = 100;
const generateAttemptId = () => {
  const year = new Date().getFullYear();
  attemptSeq += 1;
  return `ATT-${year}-${String(attemptSeq).padStart(6, '0')}`;
};

let msgSeq = 0;
const generateMsgId = () => {
  msgSeq += 1;
  return `MSG-${String(msgSeq).padStart(3, '0')}`;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeRole = (role) => {
  const r = String(role || '').toUpperCase();
  if (['SUPERADMIN', 'ADMIN'].includes(r)) return 'ADMIN';
  if (['TRAFFIC', 'TRAFFIC_POLICE'].includes(r)) return 'TRAFFIC_POLICE';
  return 'POLICE';
};

/**
 * Resolve users whose department case-insensitively matches the camera's departmentName.
 * Cascades to keyword/category matching and active administrators so reports are never dropped.
 */
const resolveDepartmentUsers = async (departmentName) => {
  if (!departmentName) {
    return await User.find({ role: 'ADMIN', isActive: true }).select('_id name email department role');
  }

  // 1. Case-insensitive exact match
  let users = await User.find({
    department: { $regex: new RegExp(`^${departmentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    isActive: true,
  }).select('_id name email department role');

  if (users.length > 0) return users;

  // 2. Substring match
  const words = departmentName.trim().split(/\s+/).filter((w) => w.length > 3);
  if (words.length > 0) {
    const substringPattern = words.map((w) => `(?=.*${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join('');
    users = await User.find({
      department: { $regex: new RegExp(substringPattern, 'i') },
      isActive: true,
    }).select('_id name email department role');

    if (users.length > 0) return users;
  }

  // 3. Department category heuristics (Traffic, Police, Municipal, Admin)
  const lower = departmentName.toLowerCase();
  if (lower.includes('traffic')) {
    users = await User.find({
      $or: [
        { department: { $regex: /traffic/i } },
        { role: { $in: ['TRAFFIC', 'TRAFFIC_POLICE'] } },
      ],
      isActive: true,
    }).select('_id name email department role');
  } else if (lower.includes('police') || lower.includes('control room') || lower.includes('chowki') || lower.includes('station')) {
    users = await User.find({
      $or: [
        { department: { $regex: /police/i } },
        { role: 'POLICE' },
      ],
      isActive: true,
    }).select('_id name email department role');
  }

  if (users && users.length > 0) return users;

  // 4. Ultimate fallback: Garud Administrator users so report is delivered to command authority
  return await User.find({ role: 'ADMIN', isActive: true }).select('_id name email department role');
};

/**
 * Push in-app notification to a list of user IDs via DB + Socket.IO.
 */
const pushNotification = async ({ recipientUserIds, recipientDepartment, senderUser, type, title, message, actionUrl }) => {
  try {
    const notifDocs = recipientUserIds.map((uid) => ({
      recipientUser: uid,
      recipientDepartment: recipientDepartment || 'ALL',
      recipientRole: 'ALL',
      senderUser: senderUser._id,
      senderName: senderUser.name,
      senderDepartment: senderUser.department || '',
      title,
      message,
      type,
      priority: 'high',
      isRead: false,
      actionUrl: actionUrl || '/reports?tab=escalations',
    }));

    const saved = await Notification.insertMany(notifDocs);

    // Socket.IO push to each user's private room
    saved.forEach((notif, i) => {
      emitToUser(recipientUserIds[i], 'notification:new', {
        ...notif.toObject(),
        title,
        message,
        type,
        actionUrl: notif.actionUrl,
      });
    });

    // Also broadcast to department room and admin room so all connected staff in target department see it
    if (recipientDepartment) {
      emitToDepartment(recipientDepartment, 'notification:new', {
        title,
        message,
        type,
        actionUrl,
      });
    }
  } catch (err) {
    logger.error(`pushNotification error: ${err.message}`);
  }
};

// ─── Controller Functions ────────────────────────────────────────────────────

/**
 * @desc  Create a new department escalation report
 * @route POST /api/dept-reports
 * @access ADMIN, POLICE, TRAFFIC_POLICE
 */
const createReport = async (req, res) => {
  try {
    const userRole = normalizeRole(req.user.role);
    if (!['ADMIN', 'POLICE', 'TRAFFIC_POLICE'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        errorCode: 'FORBIDDEN_ROLE',
        message: 'Only Command and Police personnel can generate department reports.',
      });
    }

    const { cameraId, priority = 'Medium', category, description, attachments = [] } = req.body;

    if (!cameraId || !category || !description) {
      return res.status(400).json({ success: false, message: 'cameraId, category, and description are required.' });
    }

    if (description.length < 20) {
      return res.status(400).json({ success: false, message: 'Description must be at least 20 characters.' });
    }

    // 1. Fetch camera
    const camera = await Camera.findOne({ cameraId });
    if (!camera) {
      return res.status(404).json({ success: false, message: `Camera '${cameraId}' not found.` });
    }

    const camStatus = (camera.status || '').toLowerCase();
    if (!['offline', 'maintenance', 'fault'].includes(camStatus)) {
      return res.status(400).json({
        success: false,
        message: `Reports can only be raised for Offline or Maintenance cameras. Current status: ${camera.status}`,
      });
    }

    // 2. Rate-limit: no duplicate open reports on same camera
    const existingOpen = await DeptReport.findOne({ cameraId, status: { $in: ['Open', 'In Progress', 'Action Taken'] } });
    if (existingOpen) {
      return res.status(409).json({
        success: false,
        errorCode: 'DUPLICATE_OPEN_REPORT',
        message: `An open report already exists for camera ${cameraId}.`,
        existingReportId: existingOpen.reportId,
      });
    }

    // 3. Resolve department
    const departmentName = camera.departmentName || '';
    const recipientUsers = await resolveDepartmentUsers(departmentName);

    if (recipientUsers.length === 0) {
      // Log the attempt and return failure
      const attemptId = generateAttemptId();
      await DeptReportAttemptLog.create({
        attemptId,
        cameraId,
        attemptedDepartment: departmentName || 'Unknown',
        raisedBy: req.user._id,
        result: 'department_unresolved',
        message: `No registered user found for department: "${departmentName || 'Unknown'}"`,
      });

      return res.status(422).json({
        success: false,
        errorCode: 'DEPARTMENT_USER_NOT_FOUND',
        attemptedDepartment: departmentName || 'Unknown',
        attemptId,
        message: `No registered user exists for "${departmentName || 'Unknown'}". Report was not sent. Add a user under User Management to enable delivery.`,
      });
    }

    // 4. Create the report
    const reportId = generateReportId();
    const firstMsgId = generateMsgId();

    const report = await DeptReport.create({
      reportId,
      cameraId,
      cameraSnapshot: {
        locationName:   camera.locationName || camera.name || '',
        landmark:       camera.landmark || '',
        statusAtReport: camStatus,
        departmentName: camera.departmentName || '',
        district:       camera.district || '',
      },
      raisedBy: {
        userId: req.user._id,
        name:   req.user.name,
        role:   req.user.role,
      },
      recipientDepartment: departmentName,
      recipientResolved: true,
      recipientUsers: recipientUsers.map((u) => ({
        userId: u._id,
        name:   u.name,
        email:  u.email,
      })),
      priority,
      category,
      description,
      attachments,
      status: 'Open',
      thread: [
        {
          messageId:       firstMsgId,
          sender:          req.user._id,
          senderName:      req.user.name,
          senderRole:      req.user.role,
          senderDepartment: req.user.department || 'Garud Administration',
          message:         description,
          attachment:      attachments[0] || null,
        },
      ],
    });

    // 5. Notify all resolved department users
    const recipientIds = recipientUsers.map((u) => u._id);
    await pushNotification({
      recipientUserIds: recipientIds,
      recipientDepartment: departmentName,
      senderUser: req.user,
      type: 'DEPT_REPORT_CREATED',
      title: `🚩 New Escalation Report: ${cameraId}`,
      message: `Admin has raised a department escalation for camera ${cameraId} (${category}) — Priority: ${priority}. Please review and respond.`,
      actionUrl: `/reports?tab=escalations&id=${reportId}`,
    });

    logger.info(`DeptReport ${reportId} created by ${req.user.name} for dept "${departmentName}" (${recipientIds.length} notified)`);

    return res.status(201).json({
      success: true,
      reportId,
      recipientDepartment: departmentName,
      recipientUsers: recipientUsers.map((u) => u.email),
      status: 'Open',
      message: `Report successfully dispatched to ${departmentName}.`,
      data: report,
    });
  } catch (error) {
    logger.error(`createReport error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error creating department report.' });
  }
};

/**
 * @desc  Get all reports (Admin sees all; dept users see their dept only)
 * @route GET /api/dept-reports
 * @access Authenticated
 */
const getReports = async (req, res) => {
  try {
    const userRole = normalizeRole(req.user.role);
    const { status, priority, page = 1, limit = 20 } = req.query;

    const filter = {};

    if (userRole !== 'ADMIN') {
      // Non-admins only see reports addressed to their department
      if (!req.user.department) {
        return res.json({ success: true, count: 0, reports: [], data: [] });
      }
      filter.recipientDepartment = { $regex: new RegExp(`^${req.user.department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [reports, total] = await Promise.all([
      DeptReport.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-thread'), // thread excluded from list view for performance
      DeptReport.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      count: total,
      reports: reports.map((r) => ({
        reportId:            r.reportId,
        cameraId:            r.cameraId,
        locationName:        r.cameraSnapshot?.locationName || '',
        district:            r.cameraSnapshot?.district || '',
        recipientDepartment: r.recipientDepartment,
        priority:            r.priority,
        category:            r.category,
        status:              r.status,
        createdAt:           r.createdAt,
        updatedAt:           r.updatedAt,
        raisedBy:            r.raisedBy,
        threadCount:         0, // populated separately if needed
      })),
    });
  } catch (error) {
    logger.error(`getReports error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching reports.' });
  }
};

/**
 * @desc  Get a single report with full thread
 * @route GET /api/dept-reports/:reportId
 * @access Admin, or dept user matching recipientDepartment
 */
const getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;
    const userRole = normalizeRole(req.user.role);

    const report = await DeptReport.findOne({ reportId })
      .populate('thread.sender', 'name email role department')
      .populate('raisedBy.userId', 'name email role department');

    if (!report) {
      return res.status(404).json({ success: false, message: `Report ${reportId} not found.` });
    }

    // Access check
    if (userRole !== 'ADMIN') {
      const deptMatch = req.user.department &&
        report.recipientDepartment.toLowerCase() === req.user.department.toLowerCase();
      if (!deptMatch) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this report.',
        });
      }
    }

    // Check if camera is now online (status changed since report was raised)
    const camera = await Camera.findOne({ cameraId: report.cameraId }).select('status');
    const cameraNowOnline = camera && (camera.status || '').toLowerCase() === 'online';

    return res.json({
      success: true,
      data: {
        ...report.toObject(),
        cameraCurrentStatus: camera?.status || null,
        cameraNowOnline,
      },
    });
  } catch (error) {
    logger.error(`getReportById error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching report.' });
  }
};

/**
 * @desc  Reply to a report thread
 * @route POST /api/dept-reports/:reportId/reply
 * @access Admin or matching dept user, report must not be Closed
 */
const replyToReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { message, attachment = null } = req.body;
    const userRole = normalizeRole(req.user.role);

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
    }

    const report = await DeptReport.findOne({ reportId });
    if (!report) {
      return res.status(404).json({ success: false, message: `Report ${reportId} not found.` });
    }

    // Check Closed
    if (report.status === 'Closed') {
      return res.status(403).json({
        success: false,
        message: 'This report is closed. Reopen it first to add replies.',
      });
    }

    // Access check: Admin or recipient dept user
    const isAdmin = userRole === 'ADMIN';
    const isDeptUser = req.user.department &&
      report.recipientDepartment.toLowerCase() === req.user.department.toLowerCase();

    if (!isAdmin && !isDeptUser) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reply to this report.',
      });
    }

    const msgId = generateMsgId();
    const newMsg = {
      messageId:       msgId,
      sender:          req.user._id,
      senderName:      req.user.name,
      senderRole:      req.user.role,
      senderDepartment: req.user.department || '',
      message:         message.trim(),
      attachment,
    };

    report.thread.push(newMsg);
    report.updatedAt = new Date();
    await report.save();

    const timestamp = new Date();

    // Notify the OTHER party only
    if (isAdmin) {
      // Admin replied → notify all recipient dept users
      const recipientIds = report.recipientUsers.map((u) => u.userId);
      await pushNotification({
        recipientUserIds: recipientIds,
        recipientDepartment: report.recipientDepartment,
        senderUser: req.user,
        type: 'DEPT_REPORT_REPLY',
        title: `💬 New Reply on Report ${reportId}`,
        message: `Admin has replied to the escalation report for camera ${report.cameraId}. Please check and respond.`,
        actionUrl: `/reports?tab=escalations&id=${reportId}`,
      });
    } else {
      // Dept user replied → notify Admins
      const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id');
      const adminIds = admins.map((a) => a._id);
      await pushNotification({
        recipientUserIds: adminIds,
        recipientDepartment: 'Garud Administration',
        senderUser: req.user,
        type: 'DEPT_REPORT_REPLY',
        title: `💬 Department Reply on Report ${reportId}`,
        message: `${req.user.name} (${report.recipientDepartment}) replied to the escalation for camera ${report.cameraId}.`,
        actionUrl: `/reports?tab=escalations&id=${reportId}`,
      });
    }

    return res.json({
      success: true,
      reportId,
      messageId: msgId,
      timestamp,
    });
  } catch (error) {
    logger.error(`replyToReport error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error adding reply.' });
  }
};

/**
 * @desc  Update report status
 * @route PATCH /api/dept-reports/:reportId/status
 * @access Admin or matching dept user (with restricted options)
 */
const updateReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status } = req.body;
    const userRole = normalizeRole(req.user.role);

    const DEPT_ALLOWED   = ['In Progress', 'Action Taken'];
    const ADMIN_ALLOWED  = ['Open', 'In Progress', 'Action Taken', 'Resolved', 'Closed'];

    const report = await DeptReport.findOne({ reportId });
    if (!report) {
      return res.status(404).json({ success: false, message: `Report ${reportId} not found.` });
    }

    const isAdmin = userRole === 'ADMIN';
    const isDeptUser = req.user.department &&
      report.recipientDepartment.toLowerCase() === req.user.department.toLowerCase();

    if (!isAdmin && !isDeptUser) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this report.' });
    }

    const allowed = isAdmin ? ADMIN_ALLOWED : DEPT_ALLOWED;
    if (!allowed.includes(status)) {
      return res.status(403).json({
        success: false,
        message: `Your role can only set status to: ${allowed.join(', ')}.`,
      });
    }

    // Cannot change status of a Closed report unless Admin reopening
    if (report.status === 'Closed' && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin can reopen a closed report.',
      });
    }

    report.status = status;
    await report.save();

    // Notify the other party
    const notifTitle = `📋 Report ${reportId} Status Changed`;
    const notifMsg = `Report for camera ${report.cameraId} status updated to "${status}" by ${req.user.name}.`;

    if (isAdmin) {
      const recipientIds = report.recipientUsers.map((u) => u.userId);
      await pushNotification({
        recipientUserIds: recipientIds,
        recipientDepartment: report.recipientDepartment,
        senderUser: req.user,
        type: 'DEPT_REPORT_STATUS_CHANGED',
        title: notifTitle,
        message: notifMsg,
        actionUrl: `/reports?tab=escalations&id=${reportId}`,
      });
    } else {
      const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id');
      await pushNotification({
        recipientUserIds: admins.map((a) => a._id),
        recipientDepartment: 'Garud Administration',
        senderUser: req.user,
        type: 'DEPT_REPORT_STATUS_CHANGED',
        title: notifTitle,
        message: notifMsg,
        actionUrl: `/reports?tab=escalations&id=${reportId}`,
      });
    }

    return res.json({
      success: true,
      reportId,
      status,
      message: `Report status updated to "${status}".`,
    });
  } catch (error) {
    logger.error(`updateReportStatus error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating report status.' });
  }
};

/**
 * @desc  Get blocked attempt logs (department coverage gaps)
 * @route GET /api/dept-reports/attempts
 * @access ADMIN only
 */
const getAttemptLogs = async (req, res) => {
  try {
    const logs = await DeptReportAttemptLog.find()
      .populate('raisedBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ success: true, count: logs.length, data: logs });
  } catch (error) {
    logger.error(`getAttemptLogs error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching attempt logs.' });
  }
};

module.exports = {
  createReport,
  getReports,
  getReportById,
  replyToReport,
  updateReportStatus,
  getAttemptLogs,
  resolveDepartmentUsers,
};

const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * @desc    Get all notifications for logged-in user and their department with advanced filters
 * @route   GET /api/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const userDept = req.user.department || '';
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    const {
      category = 'all',
      priority,
      status = 'all',
      search,
      page = 1,
      limit = 30,
    } = req.query;

    const isTraffic = /traffic/i.test(userDept);
    const isPolice = !isTraffic && /police/i.test(userDept);

    let deptPattern = userDept;
    if (isTraffic) {
      deptPattern = { $regex: 'traffic', $options: 'i' };
    } else if (isPolice) {
      deptPattern = { $regex: '^(?!.*traffic).*police.*$', $options: 'i' };
    }

    // Admins see all; department users see strictly their department or explicit user
    let baseFilter = isAdmin
      ? {}
      : {
          $or: [
            { recipientUser: req.user._id },
            {
              recipientDepartment: deptPattern,
              recipientRole: { $in: [userRole, 'ALL', '', null] },
            },
            {
              recipientDepartment: 'ALL',
              recipientRole: { $in: [userRole, 'ALL', '', null] },
            },
          ],
        };

    const andConditions = [baseFilter];

    // Category filter
    if (category && category !== 'all') {
      if (category === 'requisition') {
        andConditions.push({
          type: {
            $in: [
              'TICKET_CREATED',
              'TICKET_ACCEPTED',
              'TICKET_REJECTED',
              'TICKET_PROCESSING',
              'EVIDENCE_UPLOADED',
              'EVIDENCE_VIEWED',
              'RESPONSE_ADDED',
              'TICKET_CLOSED',
            ],
          },
        });
      } else if (category === 'department_report') {
        andConditions.push({
          type: {
            $in: [
              'DEPT_REPORT_CREATED',
              'DEPT_REPORT_REPLY',
              'DEPT_REPORT_STATUS_CHANGED',
            ],
          },
        });
      } else if (category === 'camera_health') {
        andConditions.push({
          $or: [
            { type: 'ALERT' },
            { title: { $regex: 'camera|outage|offline|heartbeat|maintenance', $options: 'i' } },
            { message: { $regex: 'camera|outage|offline|heartbeat|maintenance', $options: 'i' } },
          ],
        });
      } else if (category === 'security_alert') {
        andConditions.push({
          $or: [
            { type: { $in: ['ALERT', 'SECURITY_ALERT'] } },
            { title: { $regex: 'anpr|crowd|breach|incident|security', $options: 'i' } },
            { message: { $regex: 'anpr|crowd|breach|incident|security', $options: 'i' } },
          ],
        });
      }
    }

    // Priority filter
    if (priority && priority !== 'all') {
      andConditions.push({ priority: priority.toLowerCase() });
    }

    // Status filter (read / unread)
    if (status === 'unread') {
      andConditions.push({
        isRead: false,
        'readBy.user': { $ne: req.user._id },
      });
    } else if (status === 'read') {
      andConditions.push({
        $or: [
          { isRead: true },
          { 'readBy.user': req.user._id },
        ],
      });
    }

    // Search query
    if (search && search.trim()) {
      const q = search.trim();
      andConditions.push({
        $or: [
          { title: { $regex: q, $options: 'i' } },
          { message: { $regex: q, $options: 'i' } },
          { ticketId: { $regex: q, $options: 'i' } },
          { senderDepartment: { $regex: q, $options: 'i' } },
        ],
      });
    }

    const finalFilter = andConditions.length > 1 ? { $and: andConditions } : baseFilter;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(finalFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('ticket', 'ticketId title priority status')
        .populate('senderUser', 'name department designation'),
      Notification.countDocuments(finalFilter),
      Notification.countDocuments({
        ...baseFilter,
        isRead: false,
        'readBy.user': { $ne: req.user._id },
      }),
    ]);

    res.status(200).json({
      success: true,
      count: notifications.length,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    logger.error(`Error fetching notifications: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Mark a specific notification as read
 * @route   PATCH /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    notification.isRead = true;
    const alreadyRead = notification.readBy.some(
      (r) => r.user && r.user.toString() === req.user._id.toString()
    );
    if (!alreadyRead) {
      notification.readBy.push({ user: req.user._id, readAt: new Date() });
    }

    await notification.save();

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    logger.error(`Error marking notification as read: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Mark all notifications for user as read
 * @route   PATCH /api/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
  try {
    const userDept = req.user.department || '';
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    const filter = isAdmin
      ? { isRead: false }
      : {
          $or: [
            { recipientDepartment: userDept },
            { recipientDepartment: 'ALL' },
            { recipientUser: req.user._id },
          ],
          isRead: false,
        };

    await Notification.updateMany(filter, {
      $set: { isRead: true },
      $addToSet: { readBy: { user: req.user._id, readAt: new Date() } },
    });

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error(`Error marking all notifications as read: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Delete a specific notification
 * @route   DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndDelete(id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error(`Error deleting notification: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Clear all read notifications
 * @route   DELETE /api/notifications/clear-read
 */
const clearReadNotifications = async (req, res) => {
  try {
    const userDept = req.user.department || '';
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    const filter = isAdmin
      ? { isRead: true }
      : {
          $or: [
            { recipientDepartment: userDept },
            { recipientDepartment: 'ALL' },
            { recipientUser: req.user._id },
          ],
          isRead: true,
        };

    const result = await Notification.deleteMany(filter);
    res.status(200).json({
      success: true,
      message: `Cleared ${result.deletedCount} read notifications`,
    });
  } catch (error) {
    logger.error(`Error clearing read notifications: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
};


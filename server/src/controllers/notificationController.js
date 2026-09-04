const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * @desc    Get all notifications for logged-in user and their department
 * @route   GET /api/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const userDept = req.user.department || '';
    const userRole = String(req.user.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN';

    // Admins see all or department-targeted; regular users see their department or explicit user
    const filter = isAdmin
      ? {}
      : {
          $or: [
            { recipientDepartment: userDept },
            { recipientDepartment: 'ALL' },
            { recipientUser: req.user._id },
            { recipientRole: { $in: [userRole, 'ALL'] } },
          ],
        };

    const limit = parseInt(req.query.limit) || 30;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('ticket', 'ticketId title priority status')
        .populate('senderUser', 'name department designation'),
      Notification.countDocuments({
        ...filter,
        isRead: false,
        'readBy.user': { $ne: req.user._id },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
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

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};

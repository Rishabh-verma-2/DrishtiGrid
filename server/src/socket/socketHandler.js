const { authenticateSocket } = require('../middleware/auth');
const logger = require('../utils/logger');

// Track connected operators
const connectedUsers = new Map();
let ioInstance = null;

const initializeSocket = (io) => {
  ioInstance = io;

  // Socket authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const user = socket.user;
    logger.info(`Socket connected: ${user.name} (${user.role}) - Dept: ${user.department || 'N/A'} - ${socket.id}`);

    // Store connected user
    connectedUsers.set(socket.id, {
      userId: user._id.toString(),
      name: user.name,
      role: user.role,
      department: user.department,
      district: user.district,
      socketId: socket.id,
      connectedAt: new Date(),
    });

    // Emit connected users count
    io.emit('users:online', connectedUsers.size);

    // Join user-specific private room
    socket.join(`user:${user._id.toString()}`);

    // Join department room for ticket and evidence notifications
    if (user.department) {
      socket.join(`dept:${user.department}`);
      logger.debug(`${user.name} joined dept room: dept:${user.department}`);
    }

    // Join district room
    if (user.district) {
      socket.join(`district:${user.district}`);
      logger.debug(`${user.name} joined district room: ${user.district}`);
    }

    // Join role-based room
    socket.join(`role:${user.role}`);
    if (['ADMIN', 'SUPERADMIN'].includes(String(user.role).toUpperCase())) {
      socket.join('role:admin');
    }

    // ─── Camera Events ───────────────────────────────────────────
    socket.on('camera:subscribe', (cameraId) => {
      socket.join(`camera:${cameraId}`);
      logger.debug(`${user.name} subscribed to camera: ${cameraId}`);
    });

    socket.on('camera:unsubscribe', (cameraId) => {
      socket.leave(`camera:${cameraId}`);
    });

    // ─── Alert Events ────────────────────────────────────────────
    socket.on('alert:acknowledge', async ({ alertId }) => {
      try {
        const Alert = require('../models/Alert');
        const alert = await Alert.findByIdAndUpdate(
          alertId,
          { status: 'acknowledged', acknowledgedBy: user._id, acknowledgedAt: new Date() },
          { new: true }
        ).populate('camera', 'name cameraId');

        if (alert) {
          io.emit('alert:updated', alert);
          logger.info(`Alert ${alertId} acknowledged by ${user.name}`);
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ─── Chat / Control Room ─────────────────────────────────────
    socket.on('control:message', (data) => {
      const message = {
        id: Date.now(),
        from: { name: user.name, role: user.role, department: user.department },
        text: data.text,
        timestamp: new Date(),
      };
      io.to(`role:operator`).to(`role:admin`).to(`role:superadmin`).emit('control:message', message);
    });

    // ─── Heartbeat ───────────────────────────────────────────────
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    // ─── Disconnect ──────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      connectedUsers.delete(socket.id);
      io.emit('users:online', connectedUsers.size);
      logger.info(`Socket disconnected: ${user.name} - Reason: ${reason}`);
    });
  });

  return { connectedUsers };
};

/**
 * Helper to broadcast from controllers
 */
const getConnectedUsers = () => connectedUsers;

const getIO = () => ioInstance;

const emitToDepartment = (department, event, data) => {
  if (ioInstance && department) {
    ioInstance.to(`dept:${department}`).emit(event, data);
    // Also notify Admins
    ioInstance.to('role:admin').to('role:ADMIN').emit(event, data);
  }
};

const emitToUser = (userId, event, data) => {
  if (ioInstance && userId) {
    ioInstance.to(`user:${userId.toString()}`).emit(event, data);
  }
};

const emitGlobal = (event, data) => {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
};

module.exports = {
  initializeSocket,
  getConnectedUsers,
  getIO,
  emitToDepartment,
  emitToUser,
  emitGlobal,
};

const { authenticateSocket } = require('../middleware/auth');
const logger = require('../utils/logger');

// Track connected operators
const connectedUsers = new Map();

const initializeSocket = (io) => {
  // Socket authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const user = socket.user;
    logger.info(`Socket connected: ${user.name} (${user.role}) - ${socket.id}`);

    // Store connected user
    connectedUsers.set(socket.id, {
      userId: user._id.toString(),
      name: user.name,
      role: user.role,
      district: user.district,
      socketId: socket.id,
      connectedAt: new Date(),
    });

    // Emit connected users count
    io.emit('users:online', connectedUsers.size);

    // Join district room
    if (user.district) {
      socket.join(`district:${user.district}`);
      logger.debug(`${user.name} joined district room: ${user.district}`);
    }

    // Join role-based room
    socket.join(`role:${user.role}`);

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
        from: { name: user.name, role: user.role },
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

module.exports = { initializeSocket, getConnectedUsers };

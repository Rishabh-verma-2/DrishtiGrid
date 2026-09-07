require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./src/app');
const connectDB = require('./src/config/db');
const { initializeSocket } = require('./src/socket/socketHandler');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Connect to MongoDB
  await connectDB();

  // Ensure canonical departments & camera departmentCodes are aligned with metadata
  const { syncDepartmentsAndCameras } = require('./src/utils/departmentSync');
  await syncDepartmentsAndCameras().catch((e) => logger.warn('Department sync warning:', e.message));

  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
        if (process.env.CLIENT_URL && origin === process.env.CLIENT_URL) return callback(null, true);
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Attach io to app for controllers to use
  app.set('io', io);
  app.use((req, res, next) => {
    req.io = io;
    next();
  });

  // Initialize socket handlers
  initializeSocket(io);

  server.listen(PORT, () => {
    logger.info(`🚀 DrishtiGrid Server running on port ${PORT}`);
    logger.info(`📡 WebSocket server ready`);
    logger.info(`🌐 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔗 API: http://localhost:${PORT}/api`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
  });
};

startServer();

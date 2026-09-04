require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const cameraRoutes = require('./routes/cameras');
const alertRoutes = require('./routes/alerts');
const streamRoutes = require('./routes/stream');
const footageTicketRoutes = require('./routes/footageTickets');
const userRoutes = require('./routes/users');
const auditLogRoutes = require('./routes/auditLogs');
const systemHealthRoutes = require('./routes/systemHealth');

const createApp = () => {
  const app = express();

  // ─── Security ────────────────────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  const isDev = process.env.NODE_ENV !== 'production';
  const allowedOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);
      if (isDev && allowedOriginPattern.test(origin)) return callback(null, true);
      if (process.env.CLIENT_URL && origin === process.env.CLIENT_URL) return callback(null, true);
      return callback(null, true); // Permissive in dev to avoid any port mismatch
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
    message: { success: false, message: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Auth-specific limiter (lenient in development to prevent lockouts)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 500 : 30,
    message: { success: false, message: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/login', authLimiter);

  // ─── Body Parsing ─────────────────────────────────────────────
  app.use(express.text({ type: 'application/sdp', limit: '2mb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ─── Logging ──────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }));
  }

  // ─── Static Uploads ───────────────────────────────────────────
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  // ─── Health Check ─────────────────────────────────────────────
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      message: 'DrishtiGrid API is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    });
  });

  // ─── API Routes ───────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/cameras', cameraRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/stream', streamRoutes);
  app.use('/api/footage-tickets', footageTicketRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit-logs', auditLogRoutes);
  app.use('/api/system-health', systemHealthRoutes);

  // ─── Error Handling ───────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;

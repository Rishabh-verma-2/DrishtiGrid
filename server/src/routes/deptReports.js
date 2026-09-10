const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createReport,
  getReports,
  getReportById,
  replyToReport,
  updateReportStatus,
  getAttemptLogs,
} = require('../controllers/deptReportController');

// GET /api/dept-reports/attempts — must be BEFORE /:reportId to avoid param clash
router.get('/attempts', authenticate, authorize('ADMIN'), getAttemptLogs);

// POST /api/dept-reports — Authorized Command Staff (Admin, Police, Traffic)
router.post('/', authenticate, authorize('ADMIN', 'POLICE', 'TRAFFIC_POLICE'), createReport);

// GET /api/dept-reports — role-filtered inside controller
router.get('/', authenticate, getReports);

// GET /api/dept-reports/:reportId — access checked inside controller
router.get('/:reportId', authenticate, getReportById);

// POST /api/dept-reports/:reportId/reply — access checked inside controller
router.post('/:reportId/reply', authenticate, replyToReport);

// PATCH /api/dept-reports/:reportId/status — role-aware inside controller
router.patch('/:reportId/status', authenticate, updateReportStatus);

module.exports = router;

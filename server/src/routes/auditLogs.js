const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLogController');
const { authenticate, authorize } = require('../middleware/auth');

// Audit logs are strictly restricted: Authenticated + ADMIN only
router.use(authenticate, authorize('ADMIN'));

router.get('/', getAuditLogs);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getSystemHealth } = require('../controllers/systemHealthController');
const { authenticate, authorize } = require('../middleware/auth');

// System Health is strictly restricted: Authenticated + ADMIN only
router.use(authenticate, authorize('ADMIN'));

router.get('/', getSystemHealth);

module.exports = router;

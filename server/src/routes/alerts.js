const express = require('express');
const router = express.Router();
const {
  getAlerts,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  getAlertStats,
} = require('../controllers/alertController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/stats', authenticate, getAlertStats);
router.get('/', authenticate, getAlerts);
router.post('/', authenticate, authorize('superadmin', 'admin', 'operator'), createAlert);
router.patch('/:id/acknowledge', authenticate, authorize('superadmin', 'admin', 'operator'), acknowledgeAlert);
router.patch('/:id/resolve', authenticate, authorize('superadmin', 'admin', 'operator'), resolveAlert);

module.exports = router;

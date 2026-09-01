const express = require('express');
const router = express.Router();
const {
  getCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  updateHeartbeat,
  getCameraStats,
} = require('../controllers/cameraController');
const { authenticate, authorize } = require('../middleware/auth');

// Stats (before :id to avoid route conflict)
router.get('/stats', authenticate, getCameraStats);

// CRUD
router.get('/', authenticate, getCameras);
router.get('/:id', authenticate, getCamera);
router.post('/', authenticate, authorize('superadmin', 'admin'), createCamera);
router.put('/:id', authenticate, authorize('superadmin', 'admin'), updateCamera);
router.delete('/:id', authenticate, authorize('superadmin'), deleteCamera);
router.patch('/:id/heartbeat', authenticate, authorize('superadmin', 'admin', 'operator'), updateHeartbeat);

module.exports = router;

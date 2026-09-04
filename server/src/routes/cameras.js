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
router.post('/', authenticate, authorize('ADMIN'), createCamera);
router.put('/:id', authenticate, authorize('ADMIN'), updateCamera);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteCamera);
router.patch('/:id/heartbeat', authenticate, authorize('ADMIN'), updateHeartbeat);

module.exports = router;

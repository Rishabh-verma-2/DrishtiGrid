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
  startCameraStream,
  stopCameraStream,
  getCameraAnprStatus,
} = require('../controllers/cameraController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');

const {
  getTemplate,
  validateBulk,
  commitImport,
  getImportSession,
  downloadReport,
  cancelImport,
} = require('../controllers/bulkCameraController');

// Stats (before :id to avoid route conflict)
router.get('/stats', authenticate, getCameraStats);

// ── Bulk Camera Onboarding & Registry Import ────────────────────────────────
router.get('/bulk/template', authenticate, requirePermission('bulk_import'), getTemplate);
router.post('/bulk/validate', authenticate, requirePermission('bulk_import'), validateBulk);
router.post('/bulk/import', authenticate, requirePermission('bulk_import'), commitImport);
router.get('/bulk/import/:importId', authenticate, requirePermission('bulk_import'), getImportSession);
router.get('/bulk/import/:importId/report', authenticate, requirePermission('bulk_import'), downloadReport);
router.post('/bulk/import/:importId/cancel', authenticate, requirePermission('bulk_import'), cancelImport);

// CRUD
router.get('/', authenticate, getCameras);
router.get('/:id', authenticate, getCamera);
router.post('/', authenticate, requirePermission('camera_add'), createCamera);
router.put('/:id', authenticate, authorize('ADMIN'), updateCamera);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteCamera);
router.patch('/:id/heartbeat', authenticate, authorize('ADMIN'), updateHeartbeat);

// Stream Sessions & Continuous ANPR
router.post('/:id/stream/start', authenticate, startCameraStream);
router.post('/:id/stream/stop', authenticate, stopCameraStream);
router.get('/:id/anpr/status', authenticate, getCameraAnprStatus);

module.exports = router;

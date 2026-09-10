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
router.get('/bulk/template', authenticate, authorize('ADMIN', 'SUPERADMIN'), getTemplate);
router.post('/bulk/validate', authenticate, authorize('ADMIN', 'SUPERADMIN'), validateBulk);
router.post('/bulk/import', authenticate, authorize('ADMIN', 'SUPERADMIN'), commitImport);
router.get('/bulk/import/:importId', authenticate, authorize('ADMIN', 'SUPERADMIN'), getImportSession);
router.get('/bulk/import/:importId/report', authenticate, authorize('ADMIN', 'SUPERADMIN'), downloadReport);
router.post('/bulk/import/:importId/cancel', authenticate, authorize('ADMIN', 'SUPERADMIN'), cancelImport);

// CRUD
router.get('/', authenticate, getCameras);
router.get('/:id', authenticate, getCamera);
router.post('/', authenticate, authorize('ADMIN'), createCamera);
router.put('/:id', authenticate, authorize('ADMIN'), updateCamera);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteCamera);
router.patch('/:id/heartbeat', authenticate, authorize('ADMIN'), updateHeartbeat);

module.exports = router;

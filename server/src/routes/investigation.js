const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const {
  createFirCase,
  getFirCases,
  getFirCaseById,
  reviewFirCase,
  getMasterWatchlist,
  assignDepartmentsToWatchlist,
  batchCreateAndDistributeWatchlist,
  getDepartmentAssignments,
  executeInvestigationSearch,
  submitInvestigationResult,
  validateInvestigationResult,
  forwardResultToOriginatingStation,
  acknowledgeResult,
  checkDuplicateSubject,
  getInvestigationAnalytics,
} = require('../controllers/investigationController');

// Multer memory storage configuration for file uploads (up to 50MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    const allowedMime = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/jpg',
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      'application/pdf',
    ];
    if (allowedMime.includes(file.mimetype) || /\.(jpg|jpeg|png|webp|mp4|mov|avi|webm|pdf)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Supported: JPEG, PNG, WebP, MP4, WebM, PDF.'), false);
    }
  },
});

// All investigation endpoints require authentication & government role authorization
router.use(authenticate);
router.use(authorize('ADMIN', 'POLICE', 'TRAFFIC_POLICE', 'DEPARTMENT', 'POLICE_STATION'));
router.use(requirePermission('investigation'));

// ─── Analytics & Duplicate Check ─────────────────────────────────────
router.get('/analytics', getInvestigationAnalytics);
router.get('/check-duplicate', checkDuplicateSubject);

// ─── FIR Investigation Cases ─────────────────────────────────────────
// All operational field law enforcement departments can initiate case requests. Admin cannot create FIRs.
router.post('/cases', authorize('POLICE', 'POLICE_STATION', 'TRAFFIC_POLICE', 'DEPARTMENT'), upload.any(), createFirCase);
router.get('/cases', getFirCases);
router.get('/cases/:id', getFirCaseById);
router.post('/cases/:id/review', authorize('ADMIN'), reviewFirCase);

// ─── Master Watchlist ────────────────────────────────────────────────
router.get('/watchlist', getMasterWatchlist);
router.post('/watchlist/:id/assign', authorize('ADMIN'), assignDepartmentsToWatchlist);
router.post('/watchlist/batch-create-and-distribute', authorize('ADMIN'), batchCreateAndDistributeWatchlist);

// ─── Department Assignments & Search ─────────────────────────────────
router.get('/assignments', getDepartmentAssignments);
router.post('/search', executeInvestigationSearch);

// ─── Investigation Results & Evidence ────────────────────────────────
router.post('/results', upload.any(), submitInvestigationResult);
router.post('/results/:id/validate', authorize('ADMIN'), validateInvestigationResult);
router.post('/results/:id/forward', authorize('ADMIN'), forwardResultToOriginatingStation);
router.post('/results/:id/acknowledge', acknowledgeResult);

module.exports = router;

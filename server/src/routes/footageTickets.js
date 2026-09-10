const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  createTicket,
  getTickets,
  getTicketStats,
  getTicketById,
  updateTicketStatus,
  approveTicket,
  rejectTicket,
  acknowledgeTicket,
  assignOperator,
  getDepartmentOperators,
  requestClarification,
  respondClarification,
  generateEvidenceToken,
  completeTicket,
  generateEvidencePackage,
  uploadEvidence,
  streamEvidence,
  downloadEvidence,
  verifyEvidenceIntegrity,
  addTicketResponse,
  getTicketResponses,
  getTicketAuditLogs,
  getAllAuditLogs,
  recordFootageAccess,
  dispatchFootage,
} = require('../controllers/footageTicketController');
const { authenticate, authorize } = require('../middleware/auth');

// Multer memory storage configuration for secure on-the-fly encryption
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max video file
  },
  fileFilter: (req, file, cb) => {
    // Accept common video formats
    const allowedTypes = /mp4|mkv|webm|avi|mov|octet-stream|quicktime/;
    const ext = file.originalname.split('.').pop().toLowerCase();
    const isMimeOk = allowedTypes.test(file.mimetype) || allowedTypes.test(ext);
    if (isMimeOk) {
      return cb(null, true);
    }
    cb(new Error('Invalid video format. Supported: MP4, MKV, WebM, AVI, MOV'));
  },
});

// All footage requisition endpoints are strictly authenticated
router.use(authenticate);

// Global list & creation
router.route('/')
  .post(createTicket)
  .get(getTickets);

router.get('/stats', getTicketStats);

// Department operators directory for assignment
router.get('/department-operators', getDepartmentOperators);

// Admin-level cross-ticket forensic audit query (defined before /:id)
router.get('/audit-logs/all', authorize('ADMIN'), getAllAuditLogs);

// Single ticket details
router.route('/:id')
  .get(getTicketById);

// State machine lifecycle transitions
router.post('/:id/approve', authorize('ADMIN'), approveTicket);
router.post('/:id/reject', rejectTicket);
router.post('/:id/acknowledge', acknowledgeTicket);
router.post('/:id/assign', assignOperator);
router.post('/:id/clarify', authorize('ADMIN'), requestClarification);
router.post('/:id/clarify-response', respondClarification);
router.post('/:id/complete', completeTicket);

// Court-admissible evidence package & manifest (Section 65B)
router.get('/:id/evidence-package', generateEvidencePackage);

// Status lifecycle update (Legacy & generic fallback)
router.patch('/:id/status', updateTicketStatus);

// Evidence handling
router.post('/:id/evidence', upload.single('footage'), uploadEvidence);
router.post('/:id/evidence/:evidenceId/token', generateEvidenceToken);
router.get('/:id/evidence/:evidenceId/stream', streamEvidence);
router.get('/:id/evidence/:evidenceId/download', downloadEvidence);
router.get('/:id/evidence/:evidenceId/verify', verifyEvidenceIntegrity);

// Case conversations / responses
router.route('/:id/responses')
  .get(getTicketResponses)
  .post(addTicketResponse);

// Ticket audit trail
router.get('/:id/audit-logs', getTicketAuditLogs);

// Chain of custody access record
router.post('/:id/access', recordFootageAccess);

// Legacy dispatch route
router.post('/:id/dispatch', authorize('ADMIN'), dispatchFootage);

module.exports = router;

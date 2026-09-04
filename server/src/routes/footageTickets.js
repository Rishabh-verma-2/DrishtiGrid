const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  createTicket,
  getTickets,
  getTicketStats,
  getTicketById,
  updateTicketStatus,
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

// Admin-level cross-ticket forensic audit query (defined before /:id)
router.get('/audit-logs/all', authorize('ADMIN'), getAllAuditLogs);

// Single ticket details
router.route('/:id')
  .get(getTicketById);

// Status lifecycle update (Accept, Reject, Processing, Closed, etc.)
router.patch('/:id/status', updateTicketStatus);

// Evidence handling
router.post('/:id/evidence', upload.single('footage'), uploadEvidence);
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

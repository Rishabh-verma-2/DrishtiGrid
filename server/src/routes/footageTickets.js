const express = require('express');
const router = express.Router();
const {
  createTicket,
  getTickets,
  getTicketStats,
  getTicketById,
  updateTicketStatus,
  dispatchFootage,
  recordFootageAccess,
  getTicketAuditLogs,
} = require('../controllers/footageTicketController');
const { authenticate, authorize } = require('../middleware/auth');

// All footage requisition endpoints are strictly authenticated
router.use(authenticate);

router.route('/')
  .post(createTicket)
  .get(getTickets);

router.get('/stats', getTicketStats);

router.route('/:id')
  .get(getTicketById);

// Administrative operations restricted to ADMIN
router.patch('/:id/status', authorize('ADMIN'), updateTicketStatus);
router.post('/:id/dispatch', authorize('ADMIN'), dispatchFootage);
router.get('/:id/audit-logs', authorize('ADMIN'), getTicketAuditLogs);

// Access tracking open to all authenticated users
router.post('/:id/access', recordFootageAccess);

module.exports = router;

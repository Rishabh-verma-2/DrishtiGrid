const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const gapAnalysisController = require('../controllers/gapAnalysisController');

// All gap analysis routes require authentication
router.use(authenticate);

// 1. Run authoritative gap analysis and generate report (ADMIN ONLY)
router.post('/analyze', authorize('ADMIN'), gapAnalysisController.runAnalysis);

// 2. List gap analysis reports (Role-filtered: Admin sees all, Department sees assigned)
router.get('/', gapAnalysisController.getReports);

// 3. Get single gap analysis report (IDOR protected: Department can only view their own)
router.get('/:id', gapAnalysisController.getReportById);

// 4. Send report to responsible department (ADMIN ONLY)
router.post('/:id/send', authorize('ADMIN'), gapAnalysisController.sendReport);

// 5. Update report lifecycle status (Department or Admin)
router.patch('/:id/status', gapAnalysisController.updateReportStatus);

module.exports = router;

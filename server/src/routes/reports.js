const express = require('express');
const router = express.Router();
const { dispatchReport, getDispatchHistory, downloadReportFile } = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');

router.post('/dispatch', authenticate, dispatchReport);
router.get('/history', authenticate, getDispatchHistory);
router.get('/download/:fileName', downloadReportFile);

module.exports = router;

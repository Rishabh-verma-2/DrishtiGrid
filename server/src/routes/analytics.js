const express = require('express');
const router = express.Router();
const {
  getCameraHealth,
  getCoverageGaps,
  getSearchSuggestions,
} = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

router.get('/camera-health/:id', authenticate, getCameraHealth);
router.get('/coverage-gaps', authenticate, getCoverageGaps);
router.get('/search-suggestions', authenticate, getSearchSuggestions);

module.exports = router;

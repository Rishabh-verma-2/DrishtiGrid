const express = require('express');
const router = express.Router();
const { getDepartments } = require('../controllers/departmentController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, getDepartments);

module.exports = router;

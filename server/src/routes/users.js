const express = require('express');
const router = express.Router();
const {
  getUsers,
  createUser,
  updateUser,
  toggleUserStatus,
} = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

// All User Management endpoints are strictly protected: Authenticated + ADMIN
router.use(authenticate, authorize('ADMIN'));

router.route('/')
  .get(getUsers)
  .post(createUser);

router.route('/:id')
  .put(updateUser);

router.patch('/:id/status', toggleUserStatus);

module.exports = router;

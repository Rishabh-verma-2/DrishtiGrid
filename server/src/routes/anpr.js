const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const {
  analyzeVehicleImages,
  getWatchlist,
  createWatchlistRecord,
  updateWatchlistRecord,
  deleteWatchlistRecord,
  getANPRStats,
} = require('../controllers/anprController');

// Configure multer memory storage for vehicle image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024, // 30 MB per file
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file type. Only JPEG, PNG, and WebP are supported.'), false);
    }
  },
});

// All ANPR endpoints require authentication & government role authorization
router.use(authenticate);
router.use(authorize('ADMIN', 'POLICE', 'TRAFFIC_POLICE'));

// Vehicle Image Analysis (single or batch up to 10 images)
router.post(
  '/analyze',
  upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'image', maxCount: 1 },
  ]),
  (req, res, next) => {
    // Normalize files so req.files is a flat array
    if (req.files) {
      const allFiles = [...(req.files['images'] || []), ...(req.files['image'] || [])];
      req.files = allFiles;
    }
    next();
  },
  analyzeVehicleImages
);

// Watchlist CRUD
router.get('/watchlist', getWatchlist);
router.post('/watchlist', createWatchlistRecord);
router.patch('/watchlist/:id', updateWatchlistRecord);
router.delete('/watchlist/:id', deleteWatchlistRecord);

// Operational Statistics
router.get('/stats', getANPRStats);

module.exports = router;

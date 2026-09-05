const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const {
  analyzeVehicleImages,
  uploadAndAnalyzeVideo,
  getVideoJobStatus,
  getVideoDetections,
  streamVideoFile,
  getDetections,
  getStoredPlates,
  getWatchlist,
  createWatchlistRecord,
  updateWatchlistRecord,
  deleteWatchlistRecord,
  getANPRStats,
  clearANPRIncidents,
} = require('../controllers/anprController');

// Public/Media Video Stream route (supports HTTP 206 Range for HTML5 video players)
router.get('/video/stream/:videoId', streamVideoFile);

// Multer memory storage for vehicle image uploads (up to 30 MB)
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
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

// Multer memory storage for video uploads (up to 150 MB)
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 150 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/mkv', 'application/octet-stream'];
    if (allowed.includes(file.mimetype) || /\.(mp4|mov|avi|webm|mkv)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video format. Supported formats: MP4, MOV, AVI, WebM, MKV.'), false);
    }
  },
});

// All ANPR endpoints require authentication & government role authorization
router.use(authenticate);
router.use(authorize('ADMIN', 'POLICE', 'TRAFFIC_POLICE'));

// Vehicle Image Analysis (single or batch up to 10 images)
router.post(
  '/analyze',
  (req, res, next) => {
    uploadImage.fields([
      { name: 'images', maxCount: 10 },
      { name: 'image', maxCount: 1 },
    ])(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      if (req.files) {
        const allFiles = [...(req.files['images'] || []), ...(req.files['image'] || [])];
        req.files = allFiles;
      }
      next();
    });
  },
  analyzeVehicleImages
);

// 1-FPS Video Surveillance Processing
router.post('/video/upload', uploadVideo.single('video'), uploadAndAnalyzeVideo);
router.get('/video/job/:jobId', getVideoJobStatus);
router.get('/video/detections/:videoId', getVideoDetections);

// Historical Detections Explorer & Stored Plates Registry
router.get('/detections', getDetections);
router.get('/stored-plates', getStoredPlates);

// Watchlist CRUD
router.get('/watchlist', getWatchlist);
router.post('/watchlist', createWatchlistRecord);
router.patch('/watchlist/:id', updateWatchlistRecord);
router.delete('/watchlist/:id', deleteWatchlistRecord);

// Operational Statistics & Maintenance
router.get('/stats', getANPRStats);
router.delete('/incidents', clearANPRIncidents);

module.exports = router;


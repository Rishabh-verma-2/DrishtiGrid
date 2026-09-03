const express = require('express');
const router = express.Router();
const Camera = require('../models/Camera');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Live Stream Gateway Configuration (Zero DB storage)
const STREAM_IP = '103.250.160.189';
const HLS_HOST = 'cctv.corp8.cloud';

/**
 * Gujarat Districts & Locations for the 30 Live Feeds
 * Generated dynamically on-the-fly without saving any video/stream data to MongoDB.
 */
const LIVE_FEED_CATALOG = [
  { id: 'cam01', name: 'Ahmedabad - Maninagar Junction', district: 'Ahmedabad', area: 'Maninagar', zone: 'Traffic', type: 'Bullet' },
  { id: 'cam02', name: 'Ahmedabad - Sardar Patel Stadium', district: 'Ahmedabad', area: 'Motera', zone: 'Public Space', type: 'Fixed' },
  { id: 'cam03', name: 'Ahmedabad - Sabarmati Riverfront', district: 'Ahmedabad', area: 'Riverfront West', zone: 'Public Space', type: 'PTZ' },
  { id: 'cam04', name: 'Gandhinagar - Akshardham Road', district: 'Gandhinagar', area: 'Sector 20', zone: 'Traffic', type: 'PTZ' },
  { id: 'cam05', name: 'Gandhinagar - Indroda Nature Park', district: 'Gandhinagar', area: 'Sector 7', zone: 'Public Space', type: 'Fixed' },
  { id: 'cam06', name: 'Gandhinagar - Mahatma Mandir', district: 'Gandhinagar', area: 'Sector 13', zone: 'Public Space', type: 'Dome' },
  { id: 'cam07', name: 'Surat - Ring Road Market', district: 'Surat', area: 'Udhna', zone: 'Market', type: 'Fixed' },
  { id: 'cam08', name: 'Surat - Athwa Lines Chowk', district: 'Surat', area: 'Athwa', zone: 'Traffic', type: 'PTZ' },
  { id: 'cam09', name: 'Surat - Surat Railway Station', district: 'Surat', area: 'Varachha', zone: 'Traffic', type: 'Bullet' },
  { id: 'cam10', name: 'Vadodara - Sursagar Lake', district: 'Vadodara', area: 'Mandvi', zone: 'Public Space', type: 'Dome' },
  { id: 'cam11', name: 'Vadodara - Sayaji Baug North', district: 'Vadodara', area: 'Fatehgunj', zone: 'Public Space', type: 'Fixed' },
  { id: 'cam12', name: 'Vadodara - Alkapuri Circle', district: 'Vadodara', area: 'Alkapuri', zone: 'Traffic', type: 'PTZ' },
  { id: 'cam13', name: 'Rajkot - Race Course Ring', district: 'Rajkot', area: 'Race Course', zone: 'Public Space', type: 'PTZ' },
  { id: 'cam14', name: 'Rajkot - Yagnik Road Junction', district: 'Rajkot', area: 'Yagnik Road', zone: 'Traffic', type: 'Bullet' },
  { id: 'cam15', name: 'Rajkot - Dharmendra Market', district: 'Rajkot', area: 'Old City', zone: 'Market', type: 'Fixed' },
  { id: 'cam16', name: 'Bhavnagar - Takhteshwar Temple', district: 'Bhavnagar', area: 'Hill Drive', zone: 'Religious Site', type: 'Fixed' },
  { id: 'cam17', name: 'Bhavnagar - Nilambag Palace Road', district: 'Bhavnagar', area: 'Nilambag', zone: 'Traffic', type: 'PTZ' },
  { id: 'cam18', name: 'Bhavnagar - Ghogha Circle', district: 'Bhavnagar', area: 'Port Road', zone: 'Traffic', type: 'Bullet' },
  { id: 'cam19', name: 'Jamnagar - Darbargadh Chowk', district: 'Jamnagar', area: 'Old Town', zone: 'Market', type: 'Fixed' },
  { id: 'cam20', name: 'Jamnagar - Ranmal Lake Promenade', district: 'Jamnagar', area: 'Lakhota', zone: 'Public Space', type: 'PTZ' },
  { id: 'cam21', name: 'Junagadh - Uparkot Fort Entry', district: 'Junagadh', area: 'Uparkot', zone: 'Public Space', type: 'Fixed' },
  { id: 'cam22', name: 'Junagadh - Girnar Taleti Gate', district: 'Junagadh', area: 'Girnar Base', zone: 'Religious Site', type: 'PTZ' },
  { id: 'cam23', name: 'Junagadh - Kalva Chowk', district: 'Junagadh', area: 'City Center', zone: 'Traffic', type: 'Bullet' },
  { id: 'cam24', name: 'Anand - Amul Dairy Overbridge', district: 'Anand', area: 'Amul Campus', zone: 'Industrial', type: 'Bullet' },
  { id: 'cam25', name: 'Anand - Vallabh Vidyanagar Circle', district: 'Anand', area: 'VV Nagar', zone: 'School Zone', type: 'PTZ' },
  { id: 'cam26', name: 'Anand - Station Road Chowk', district: 'Anand', area: 'Railway Colony', zone: 'Traffic', type: 'Fixed' },
  { id: 'cam27', name: 'Bharuch - Narmada Maiya Bridge', district: 'Bharuch', area: 'Zadeshwar', zone: 'Traffic', type: 'PTZ' },
  { id: 'cam28', name: 'Bharuch - Ankleshwar GIDC Gate', district: 'Bharuch', area: 'GIDC', zone: 'Industrial', type: 'Bullet' },
  { id: 'cam29', name: 'Mehsana - Modhera Cross Road', district: 'Mehsana', area: 'Highway Bypass', zone: 'Traffic', type: 'PTZ' },
  { id: 'cam30', name: 'Mehsana - Radhanpur Circle', district: 'Mehsana', area: 'North Ring Road', zone: 'Traffic', type: 'Bullet' },
];

/**
 * @desc    Get dynamic 30 live camera feeds (0 DB storage)
 * @route   GET /api/stream/feeds
 */
router.get('/feeds', authenticate, (req, res) => {
  const feeds = LIVE_FEED_CATALOG.map((cam) => ({
    ...cam,
    status: 'online',
    resolution: '1080p',
    fps: 30,
    streamUrl: {
      webrtc: `http://${STREAM_IP}:8889/stream/${cam.id}/whep`,
      hls: `https://${HLS_HOST}/${cam.id}/index.m3u8`,
      rtsp: `rtsp://${STREAM_IP}:8554/stream/${cam.id}`,
    },
    commands: {
      opencv: `cap = cv2.VideoCapture("rtsp://${STREAM_IP}:8554/stream/${cam.id}")`,
      ffmpeg: `ffplay -rtsp_transport tcp rtsp://${STREAM_IP}:8554/stream/${cam.id}`,
      hls: `https://${HLS_HOST}/${cam.id}/index.m3u8`,
    }
  }));

  res.status(200).json({
    success: true,
    count: feeds.length,
    data: feeds,
  });
});

/**
 * @desc    Get single feed details on-the-fly
 * @route   GET /api/stream/feeds/:id
 */
router.get('/feeds/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const cam = LIVE_FEED_CATALOG.find((c) => c.id.toLowerCase() === id.toLowerCase());

  if (!cam) {
    return res.status(404).json({ success: false, message: `Live feed '${id}' not found in catalog (available: cam01-cam30)` });
  }

  res.status(200).json({
    success: true,
    data: {
      ...cam,
      status: 'online',
      resolution: '1080p',
      streamUrl: {
        webrtc: `http://${STREAM_IP}:8889/stream/${cam.id}/whep`,
        hls: `https://${HLS_HOST}/${cam.id}/index.m3u8`,
        rtsp: `rtsp://${STREAM_IP}:8554/stream/${cam.id}`,
      },
    }
  });
});

/**
 * @desc    Optional WHEP signaling forwarder (only forwards the small SDP text exchange, 0 storage)
 * @route   POST /api/stream/whep/:id
 */
router.post('/whep/:id', async (req, res) => {
  try {
    let { id } = req.params;
    // Map any non-canonical ID (like GJ-DEMO-STREAM-0001) to an active channel (cam01 - cam30)
    if (!/^cam([0-2][0-9]|30)$/i.test(id)) {
      const numMatch = id.match(/\d+/g);
      const num = numMatch ? parseInt(numMatch[numMatch.length - 1], 10) : 1;
      const channel = ((num - 1) % 30) + 1;
      id = `cam${String(channel).padStart(2, '0')}`;
    }
    const targetUrl = `http://${STREAM_IP}:8889/stream/${id}/whep`;

    const sdpOffer = req.body;
    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: sdpOffer,
    });

    const status = upstreamResponse.status;
    const answerSdp = await upstreamResponse.text();

    const location = upstreamResponse.headers.get('location');
    if (location) res.setHeader('Location', location);

    res.setHeader('Content-Type', 'application/sdp');
    res.status(status).send(answerSdp);
  } catch (error) {
    res.status(502).json({ success: false, message: error.message });
  }
});

module.exports = router;

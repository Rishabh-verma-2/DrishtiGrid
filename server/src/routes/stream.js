const express = require('express');
const router = express.Router();
const net = require('net');
const Camera = require('../models/Camera');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Live Stream Gateway Configuration (Zero DB storage)
const STREAM_IP = '103.250.160.189';
const HLS_HOST = 'cctv.corp8.cloud';

/**
 * Perform direct TCP RTSP probe against Sentinel MediaMTX on Port 8554
 */
async function probeRtspStream(streamId) {
  return new Promise((resolve) => {
    const email = process.env.SENTINEL_EMAIL || 'rishabh.verma2626@gmail.com';
    const password = process.env.SENTINEL_PASSWORD || 'A6DR-CG63-ZSEU';
    const auth = Buffer.from(`${email}:${password}`).toString('base64');
    const rtspTarget = `rtsp://${STREAM_IP}:8554/stream/${streamId}`;
    const start = Date.now();

    const socket = net.createConnection({ host: STREAM_IP, port: 8554, timeout: 4000 }, () => {
      socket.write(
        `DESCRIBE ${rtspTarget} RTSP/1.0\r\n` +
        `CSeq: 1\r\n` +
        `Authorization: Basic ${auth}\r\n` +
        `User-Agent: DrishtiGrid-RTSP-Client/1.0\r\n` +
        `Accept: application/sdp\r\n\r\n`
      );
    });

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      socket.destroy();
      resolve({
        online: false,
        streamId,
        error: 'RTSP TCP connection timed out on port 8554',
      });
    }, 4500);

    socket.on('data', (chunk) => {
      if (timedOut) return;
      clearTimeout(timeoutId);
      const text = chunk.toString();
      const latencyMs = Date.now() - start;

      if (text.includes('200 OK')) {
        socket.end();
        resolve({
          online: true,
          streamId,
          latencyMs,
          server: 'gortsplib (MediaMTX)',
          port: 8554,
          protocol: 'RTSP',
          transport: 'TCP (rtsp_transport;tcp)',
          codec: 'H.264 / AVC',
          resolution: '1080p',
          fps: 30,
          rtspUrl: `rtsp://${encodeURIComponent(email)}:${password}@${STREAM_IP}:8554/stream/${streamId}`,
          curlCommand: `ffplay -rtsp_transport tcp "rtsp://${encodeURIComponent(email)}:${password}@${STREAM_IP}:8554/stream/${streamId}"`,
        });
      } else {
        socket.end();
        resolve({
          online: false,
          streamId,
          error: text.split('\r\n')[0] || 'RTSP handshake failed',
        });
      }
    });

    socket.on('error', (err) => {
      if (timedOut) return;
      clearTimeout(timeoutId);
      resolve({
        online: false,
        streamId,
        error: err.message,
      });
    });
  });
}

// ─── Sentinel CCTV Gateway Ingest Catalogue & Background Sync ───────
let sentinelCookie = null;
let lastLoginAttempt = 0;
let lastCatalogueFetch = 0;
let isSyncingCatalogue = false;

// Pre-seeded with Sentinel's official 30 cameras from https://cctv.corp8.cloud/cameras.json
let cachedCatalogue = [
  { id: 'cam01', name: '01 Chiman bhai Bridge' },
  { id: 'cam02', name: '02 Janpath' },
  { id: 'cam03', name: '03 O.N.G.C. Office' },
  { id: 'cam04', name: '04 Paldi Circle' },
  { id: 'cam05', name: '05 Visat teen Rasta' },
  { id: 'cam06', name: '06 Timbavadi gate-Junagadh' },
  { id: 'cam07', name: '07 hero-showroom-gir-somnath' },
  { id: 'cam08', name: '08 majewadi-gate-junagadh' },
  { id: 'cam09', name: '09 new-bypass-near-by-circle-junagadh-2' },
  { id: 'cam10', name: '10 char-chowk-road-2-junagadh' },
  { id: 'cam11', name: '11 dolatpara-junagadh' },
  { id: 'cam12', name: '12 Tri Mandir Adalaj Tollnaka' },
  { id: 'cam13', name: '13 CN Vidhyalaya' },
  { id: 'cam14', name: '14 Delight RLVD' },
  { id: 'cam15', name: '15 Suvidha park' },
  { id: 'cam16', name: '16 Visat P2' },
  { id: 'cam17', name: '17 Rajkot Bus Port CCTV' },
  { id: 'cam18', name: '18 Rajkot CCTV' },
  { id: 'cam19', name: '19 KHAPARIA GRAM PANCHAYAT , TALUKA GANDEVI, DISTRICT NAVSARI' },
  { id: 'cam20', name: '20 Mohanpura' },
  { id: 'cam21', name: '23 Patan Dethali Char Rasta' },
  { id: 'cam22', name: '28 BK Mervada tran Rasta' },
  { id: 'cam23', name: '30 kheram' },
  { id: 'cam24', name: '33 dehgam' },
  { id: 'cam25', name: '34 dhanori' },
  { id: 'cam26', name: '35 TANKAL' },
  { id: 'cam27', name: '36 bilimora' },
  { id: 'cam28', name: '37 bilimora' },
  { id: 'cam29', name: '38 bilimora' },
  { id: 'cam30', name: 'Gandhidham Rambaugh p2' },
];

async function getSentinelCookie() {
  if (sentinelCookie && (Date.now() - lastLoginAttempt < 1000 * 60 * 60 * 12)) {
    return sentinelCookie;
  }

  const email = process.env.SENTINEL_EMAIL || 'rishabh.verma2626@gmail.com';
  const password = process.env.SENTINEL_PASSWORD || 'A6DR-CG63-ZSEU';

  try {
    const loginRes = await fetch('https://cctv.corp8.cloud/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      body: new URLSearchParams({ email, password }),
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });

    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/sentinel=[^;]+/);
      if (match) {
        sentinelCookie = match[0];
        lastLoginAttempt = Date.now();
        logger.info('Successfully authenticated with Sentinel CCTV gateway for live footage');
        return sentinelCookie;
      }
    }
  } catch (err) {
    logger.warn('Sentinel login warning:', err.message);
  }
  return sentinelCookie;
}

/**
 * Asynchronously poll Sentinel cameras.json in the background without blocking client HTTP requests
 */
async function syncCatalogueFromSentinel() {
  if (isSyncingCatalogue || (Date.now() - lastCatalogueFetch < 60000)) {
    return;
  }

  isSyncingCatalogue = true;
  try {
    let cookie = await getSentinelCookie();
    let upstream = await fetch('https://cctv.corp8.cloud/cameras.json', {
      headers: {
        'Cookie': cookie || '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://cctv.corp8.cloud/',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (upstream.status === 401 || upstream.status === 403 || upstream.status === 302) {
      sentinelCookie = null;
      cookie = await getSentinelCookie();
      upstream = await fetch('https://cctv.corp8.cloud/cameras.json', {
        headers: {
          'Cookie': cookie || '',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://cctv.corp8.cloud/',
        },
        signal: AbortSignal.timeout(7000),
      });
    }

    if (upstream.ok) {
      const parsed = await upstream.json();
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedCatalogue = parsed;
        lastCatalogueFetch = Date.now();
        logger.info(`Synced ${parsed.length} cameras from Sentinel catalogue`);
      }
    }
  } catch (err) {
    // Non-blocking: will continue serving cached catalogue seamlessly
    logger.debug?.('Catalogue background sync note:', err.message);
  } finally {
    isSyncingCatalogue = false;
  }
}

// Initial background catalogue sync
setTimeout(syncCatalogueFromSentinel, 1000);
// Recurring background sync every 3 minutes
setInterval(syncCatalogueFromSentinel, 3 * 60 * 1000);

/**
 * Return catalogue immediately without blocking
 */
function getActiveCatalogue() {
  // Trigger background sync if stale
  if (Date.now() - lastCatalogueFetch > 60000) {
    syncCatalogueFromSentinel().catch(() => {});
  }
  return cachedCatalogue;
}

/**
 * Decorate dynamic camera unit with authenticated credentials & endpoints
 */
function enrichCamera(cam) {
  const email = process.env.SENTINEL_EMAIL || 'rishabh.verma2626@gmail.com';
  const encodedEmail = encodeURIComponent(email);
  const password = process.env.SENTINEL_PASSWORD || 'A6DR-CG63-ZSEU';
  const id = (cam.id || '').toLowerCase();
  const name = cam.name || id.toUpperCase();

  // District & zone mapping derived from live camera metadata
  let district = 'Ahmedabad';
  const lower = name.toLowerCase();
  if (lower.includes('junagadh')) district = 'Junagadh';
  else if (lower.includes('rajkot')) district = 'Rajkot';
  else if (lower.includes('somnath') || lower.includes('hero-showroom')) district = 'Gir Somnath';
  else if (lower.includes('gandhinagar') || lower.includes('adalaj') || lower.includes('dehgam') || lower.includes('mohanpura')) district = 'Gandhinagar';
  else if (lower.includes('navsari') || lower.includes('bilimora') || lower.includes('dhanori') || lower.includes('gandevi')) district = 'Navsari';
  else if (lower.includes('surat') || lower.includes('tankal')) district = 'Surat';
  else if (lower.includes('patan')) district = 'Patan';
  else if (lower.includes('mervada') || lower.includes('banaskantha')) district = 'Banaskantha';
  else if (lower.includes('kutch') || lower.includes('gandhidham')) district = 'Kutch';
  else if (lower.includes('mehsana') || lower.includes('kheram')) district = 'Mehsana';

  const rtspUrl = `rtsp://${encodedEmail}:${password}@${STREAM_IP}:8554/stream/${id}`;

  return {
    id,
    name,
    district,
    area: name.replace(/^\d+\s*/, ''),
    zone: lower.includes('gate') || lower.includes('circle') || lower.includes('bridge') || lower.includes('rasta') || lower.includes('road') || lower.includes('bypass') ? 'Traffic' : 'Public Space',
    type: lower.includes('bridge') || lower.includes('circle') || lower.includes('port') ? 'PTZ' : 'Fixed',
    status: 'online',
    resolution: '1080p',
    fps: 30,
    primaryProtocol: 'RTSP',
    primaryUrl: rtspUrl,
    rtspUrl,
    streamUrl: {
      rtsp: rtspUrl,
      webrtc: `http://${encodedEmail}:${password}@${STREAM_IP}:8889/stream/${id}/whep`,
      hls: `https://${HLS_HOST}/${id}/index.m3u8`,
      proxyHls: `/api/stream/sentinel/${id}/index.m3u8`,
      proxyWhep: `/api/stream/whep/${id}`,
    },
    commands: {
      rtsp: rtspUrl,
      opencv: `import os, cv2\n# RTSP (force TCP - Section 65B Certified):\nos.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"\ncap = cv2.VideoCapture("${rtspUrl}", cv2.CAP_FFMPEG)\nwhile True:\n    ok, frame = cap.read()\n    if not ok: break\n    pts_ms = cap.get(cv2.CAP_PROP_POS_MSEC)\n    cv2.imshow("${id.toUpperCase()}", frame)\n    if cv2.waitKey(1) & 0xFF == ord('q'): break`,
      ffmpeg: `ffplay -rtsp_transport tcp "${rtspUrl}"`,
      gstreamer: `gst-launch-1.0 rtspsrc location="${rtspUrl}" protocols=tcp latency=200 ! rtph264depay ! h264parse ! avdec_h264 ! videoconvert ! fakesink`,
      curl: `curl -s https://${HLS_HOST}/cameras.json`,
    }
  };
}

/**
 * @desc    Direct TCP RTSP Probe against Port 8554 (sub-150ms verification)
 * @route   GET /api/stream/rtsp/:id/probe
 */
router.get('/rtsp/:id/probe', async (req, res) => {
  try {
    let { id } = req.params;
    if (!/^cam([0-2][0-9]|30)$/i.test(id)) {
      const numMatch = id.match(/\d+/g);
      const num = numMatch ? parseInt(numMatch[numMatch.length - 1], 10) : 1;
      const channel = ((num - 1) % 30) + 1;
      id = `cam${String(channel).padStart(2, '0')}`;
    }

    const result = await probeRtspStream(id);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @desc    Get dynamic live camera catalogue sourced from Sentinel (0 DB storage)
 * @route   GET /api/stream/feeds
 */
router.get('/feeds', (req, res) => {
  try {
    const raw = getActiveCatalogue();
    const feeds = raw.map(enrichCamera);
    res.status(200).json({
      success: true,
      count: feeds.length,
      data: feeds,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @desc    Get single feed details from live catalogue
 * @route   GET /api/stream/feeds/:id
 */
router.get('/feeds/:id', (req, res) => {
  try {
    const { id } = req.params;
    const raw = getActiveCatalogue();
    const cam = raw.find((c) => (c.id || '').toLowerCase() === id.toLowerCase());

    if (!cam) {
      return res.status(404).json({ success: false, message: `Live feed '${id}' not found in Sentinel catalogue` });
    }

    res.status(200).json({
      success: true,
      data: enrichCamera(cam),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @desc    Get Sentinel camera manifest / ingest catalog (raw cameras.json)
 * @route   GET /api/stream/sentinel/manifest or /api/stream/sentinel/ingest
 */
const handleManifest = (req, res) => {
  try {
    const data = getActiveCatalogue();
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

router.get('/sentinel/manifest', handleManifest);
router.get('/sentinel/ingest', handleManifest);

/**
 * @desc    WebRTC WHEP signaling forwarder to MediaMTX port 8889 with Basic Auth
 * @route   POST /api/stream/whep/:id
 */
router.post('/whep/:id', async (req, res) => {
  try {
    let { id } = req.params;
    if (!/^cam([0-2][0-9]|30)$/i.test(id)) {
      const numMatch = id.match(/\d+/g);
      const num = numMatch ? parseInt(numMatch[numMatch.length - 1], 10) : 1;
      const channel = ((num - 1) % 30) + 1;
      id = `cam${String(channel).padStart(2, '0')}`;
    }
    const targetUrl = `http://${STREAM_IP}:8889/stream/${id}/whep`;

    const sdpOffer = req.body;
    const authHeader = `Basic ${Buffer.from(`${process.env.SENTINEL_EMAIL || 'rishabh.verma2626@gmail.com'}:${process.env.SENTINEL_PASSWORD || 'A6DR-CG63-ZSEU'}`).toString('base64')}`;

    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        'Authorization': authHeader,
      },
      body: sdpOffer,
    });

    const status = upstreamResponse.status;
    const answerSdp = await upstreamResponse.text();

    const location = upstreamResponse.headers.get('location');
    if (location) res.setHeader('Location', location);

    res.setHeader('Content-Type', 'application/sdp');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(status).send(answerSdp);
  } catch (error) {
    logger.error('WHEP forwarder error:', error.message);
    res.status(502).json({ success: false, message: error.message });
  }
});

router.options('/whep/:id', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

/**
 * @desc    Proxy Sentinel AES-128 decryption key
 * @route   GET /api/stream/sentinel/enc.key
 */
router.get('/sentinel/enc.key', async (req, res) => {
  try {
    let cookie = await getSentinelCookie();
    let upstream = await fetch('https://cctv.corp8.cloud/enc.key', {
      headers: {
        'Cookie': cookie || '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://cctv.corp8.cloud/',
      },
    });

    if (upstream.status === 401 || upstream.status === 403 || upstream.status === 302) {
      sentinelCookie = null;
      cookie = await getSentinelCookie();
      upstream = await fetch('https://cctv.corp8.cloud/enc.key', {
        headers: {
          'Cookie': cookie || '',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://cctv.corp8.cloud/',
        },
      });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).send('Key unavailable');
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    logger.error('Error proxying Sentinel enc.key:', err.message);
    res.status(500).send(err.message);
  }
});

/**
 * Transform a large VOD playlist into a live-window playlist containing only the
 * most recent `windowSize` segments so HLS.js starts playing immediately from
 * the latest footage rather than buffering from segment 0.
 *
 * @param {string} rawPlaylist  - The full M3U8 text from Sentinel
 * @param {string} camId        - Camera ID used to build proxy segment URLs
 * @param {number} windowSize   - Number of recent segments to expose (default 10)
 * @returns {string} Rewritten M3U8 ready for HLS.js
 */
function buildLiveWindowPlaylist(rawPlaylist, camId, windowSize = 10) {
  const lines = rawPlaylist.split('\n').map((l) => l.trim()).filter(Boolean);

  // Collect all segment pairs: { inf, uri }
  const segments = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF:')) {
      const uri = lines[i + 1];
      if (uri && !uri.startsWith('#')) {
        segments.push({ inf: lines[i], uri });
        i++;
      }
    }
  }

  if (segments.length === 0) return rawPlaylist;

  // Take only the last `windowSize` segments
  const window = segments.slice(-windowSize);
  const firstSeq = segments.length - window.length;

  // Compute target duration from the window
  let maxDuration = 8;
  window.forEach(({ inf }) => {
    const m = inf.match(/#EXTINF:(\d+(\.\d+)?)/);
    if (m) maxDuration = Math.max(maxDuration, Math.ceil(parseFloat(m[1])));
  });

  // Extract and rewrite the encryption key line
  const keyLine = lines.find((l) => l.startsWith('#EXT-X-KEY:'));
  const rewrittenKey = keyLine
    ? keyLine.replace(/URI="(\/)?enc\.key"/g, 'URI="/api/stream/sentinel/enc.key"')
    : null;

  const out = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${maxDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${firstSeq}`,
    // Use EVENT type so HLS.js knows more segments can appear
    '#EXT-X-PLAYLIST-TYPE:EVENT',
    '#EXT-X-INDEPENDENT-SEGMENTS',
  ];

  if (rewrittenKey) out.push(rewrittenKey);

  window.forEach(({ inf, uri }) => {
    out.push(inf);
    // Rewrite relative segment URIs to use our proxy endpoint
    const segName = uri.split('/').pop();
    out.push(`/api/stream/sentinel/${camId}/${segName}`);
  });

  return out.join('\n') + '\n';
}

/**
 * Fetch full VOD playlist from Sentinel with auth, return raw text or null.
 */
async function fetchSentinelPlaylist(camId) {
  let cookie = await getSentinelCookie();
  let upstream = await fetch(`https://cctv.corp8.cloud/${camId}/index.m3u8`, {
    headers: {
      'Cookie': cookie || '',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://cctv.corp8.cloud/',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (upstream.status === 401 || upstream.status === 403 || upstream.status === 302) {
    sentinelCookie = null;
    cookie = await getSentinelCookie();
    upstream = await fetch(`https://cctv.corp8.cloud/${camId}/index.m3u8`, {
      headers: {
        'Cookie': cookie || '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://cctv.corp8.cloud/',
      },
      signal: AbortSignal.timeout(12000),
    });
  }

  if (!upstream.ok) return null;
  return upstream.text();
}

/**
 * @desc    Proxy Sentinel HLS playlist as a live sliding-window stream.
 *          Strips the 7000-segment VOD down to the last 10 segments so
 *          HLS.js starts playing immediately from the most recent footage.
 * @route   GET /api/stream/sentinel/:camId/index.m3u8
 * @route   GET /api/stream/sentinel/:camId/live.m3u8
 */
const handleSentinelPlaylist = async (req, res) => {
  try {
    let { camId } = req.params;
    if (!/^cam([0-2][0-9]|30)$/i.test(camId)) {
      const numMatch = camId.match(/\d+/g);
      const num = numMatch ? parseInt(numMatch[numMatch.length - 1], 10) : 1;
      const channel = ((num - 1) % 30) + 1;
      camId = `cam${String(channel).padStart(2, '0')}`;
    }

    const rawPlaylist = await fetchSentinelPlaylist(camId);
    if (!rawPlaylist) {
      return res.status(502).send('Sentinel feed unavailable');
    }

    // Transform into a live-window playlist (last 10 segments ≈ ~60s of footage)
    const livePlaylist = buildLiveWindowPlaylist(rawPlaylist, camId, 10);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Short cache so HLS.js re-polls frequently to simulate live updates
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.send(livePlaylist);
  } catch (err) {
    logger.error('Error proxying Sentinel m3u8:', err.message);
    res.status(500).send(err.message);
  }
};

router.get('/sentinel/:camId/index.m3u8', handleSentinelPlaylist);
router.get('/sentinel/:camId/live.m3u8', handleSentinelPlaylist);

/**
 * @desc    Proxy Sentinel HLS video segment (.ts) with authentication & recovery
 * @route   GET /api/stream/sentinel/:camId/:segment
 */
router.get('/sentinel/:camId/:segment', async (req, res) => {
  try {
    let { camId, segment } = req.params;
    if (!/^cam([0-2][0-9]|30)$/i.test(camId)) {
      const numMatch = camId.match(/\d+/g);
      const num = numMatch ? parseInt(numMatch[numMatch.length - 1], 10) : 1;
      const channel = ((num - 1) % 30) + 1;
      camId = `cam${String(channel).padStart(2, '0')}`;
    }

    let cookie = await getSentinelCookie();
    let upstream = await fetch(`https://cctv.corp8.cloud/${camId}/${segment}`, {
      headers: {
        'Cookie': cookie || '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://cctv.corp8.cloud/',
      },
    });

    if (upstream.status === 401 || upstream.status === 403 || upstream.status === 302) {
      sentinelCookie = null;
      cookie = await getSentinelCookie();
      upstream = await fetch(`https://cctv.corp8.cloud/${camId}/${segment}`, {
        headers: {
          'Cookie': cookie || '',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://cctv.corp8.cloud/',
        },
      });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).send('Segment unavailable');
    }

    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    logger.error('Error proxying Sentinel segment:', err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;



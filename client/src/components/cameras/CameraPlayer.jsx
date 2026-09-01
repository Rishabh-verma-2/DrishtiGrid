import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  Camera as CameraIcon, RefreshCw, AlertCircle, Wifi, Radio,
  Layers, Shield
} from 'lucide-react';
import Hls from 'hls.js';

/**
 * CameraPlayer — High-performance CCTV Player
 * Connects directly to live WebRTC (WHEP) and HLS streams.
 * Zero database storage — completely dynamic streaming.
 */
export default function CameraPlayer({
  streamId = 'cam01',
  cameraName = 'Live Camera Feed',
  district = 'Gujarat',
  autoConnect = false, // When false, does NOT connect until user clicks!
  autoPlay = true,
  className = '',
  aspectRatio = 'aspect-video',
  showControls = true,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const peerConnRef = useRef(null);
  const hlsRef = useRef(null);
  const sessionUrlRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const [isStarted, setIsStarted] = useState(autoConnect);
  const [mode, setMode] = useState('webrtc'); // 'webrtc' | 'hls'
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState(autoConnect ? 'connecting' : 'standby'); // 'standby' | 'connecting' | 'live' | 'error' | 'reconnecting'
  const [errorMessage, setErrorMessage] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Live digital clock overlay
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0').slice(0, 2));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Clean up existing connections
  const cleanupConnections = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up WebRTC
    if (peerConnRef.current) {
      peerConnRef.current.oniceconnectionstatechange = null;
      peerConnRef.current.ontrack = null;
      peerConnRef.current.close();
      peerConnRef.current = null;
    }

    // Close WHEP session on gateway if URL was provided
    if (sessionUrlRef.current) {
      fetch(sessionUrlRef.current, { method: 'DELETE' }).catch(() => {});
      sessionUrlRef.current = null;
    }

    // Clean up HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }
  }, []);

  // ─── 1. WebRTC WHEP Connection (Low-latency) ─────────────────────
  const startWhepStream = useCallback(async () => {
    cleanupConnections();
    setStatus('connecting');
    setErrorMessage('');

    const targetWhepUrl = `http://103.250.160.189:8889/stream/${streamId}/whep`;
    const proxyWhepUrl = `/api/stream/whep/${streamId}`;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      peerConnRef.current = pc;

      // Add transceivers for receiving video and audio
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().then(() => {
            setIsPlaying(true);
            setStatus('live');
            setReconnectAttempts(0);
          }).catch((err) => {
            console.warn('Auto-play muted fallback:', err);
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current.play();
            }
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          handleStreamDisconnect();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Try direct WHEP endpoint first, fallback to proxy
      let response;
      try {
        response = await fetch(targetWhepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp,
        });
      } catch (directErr) {
        console.warn('Direct WHEP blocked, trying backend proxy:', directErr);
        response = await fetch(proxyWhepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp,
        });
      }

      if (!response || !response.ok) {
        throw new Error(`WHEP gateway responded with ${response?.status || 'Network Error'}`);
      }

      // Store session location for cleanup
      const location = response.headers.get('Location');
      if (location) {
        sessionUrlRef.current = location.startsWith('http') ? location : `http://103.250.160.189:8889${location}`;
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      console.error(`WHEP connection failed for ${streamId}:`, err);
      handleStreamDisconnect(err.message);
    }
  }, [streamId, cleanupConnections]);

  // ─── 2. HLS Connection (Fallback / CDN) ───────────────────────────
  const startHlsStream = useCallback(() => {
    cleanupConnections();
    setStatus('connecting');
    setErrorMessage('');

    const hlsUrl = `https://cctv.corp8.cloud/${streamId}/index.m3u8`;

    if (!videoRef.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 10,
      });
      hlsRef.current = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
          setStatus('live');
          setReconnectAttempts(0);
        }).catch(() => {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play();
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              handleStreamDisconnect('HLS network error');
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              handleStreamDisconnect('HLS playback fatal error');
              break;
          }
        }
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = hlsUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
          setStatus('live');
        });
      });
    } else {
      setStatus('error');
      setErrorMessage('HLS is not supported in this browser.');
    }
  }, [streamId, cleanupConnections]);

  // Reconnection backoff (~2s to 30s as per guide)
  const handleStreamDisconnect = useCallback((msg = 'Stream interrupted') => {
    setStatus('reconnecting');
    setErrorMessage(msg);

    const backoff = Math.min(2000 * Math.pow(1.5, reconnectAttempts), 30000);
    setReconnectAttempts((prev) => prev + 1);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (mode === 'webrtc') {
        startWhepStream();
      } else {
        startHlsStream();
      }
    }, backoff);
  }, [mode, reconnectAttempts, startWhepStream, startHlsStream]);

  // Synchronize with autoConnect prop changes
  useEffect(() => {
    setIsStarted(autoConnect);
  }, [autoConnect]);

  // Start stream when streamId, mode, or isStarted changes
  useEffect(() => {
    if (!isStarted) {
      cleanupConnections();
      setStatus('standby');
      return;
    }

    if (mode === 'webrtc') {
      startWhepStream();
    } else {
      startHlsStream();
    }

    return () => {
      cleanupConnections();
    };
  }, [streamId, mode, isStarted]);

  // Snapshot capture
  const handleSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Add government CCTV timestamp watermark
    ctx.font = '16px monospace';
    ctx.fillStyle = '#10b981';
    ctx.fillText(`GUJ-CCTV [${streamId.toUpperCase()}] ${new Date().toISOString()}`, 20, 30);

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `CCTV_${streamId.toUpperCase()}_${Date.now()}.png`;
    a.click();
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-2xl overflow-hidden border border-white/10 group ${aspectRatio} ${className}`}
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover bg-black"
        autoPlay={autoPlay}
        playsInline
        muted={isMuted}
      />

      {/* CCTV HUD Scanline & Crosshair Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-30 [background:linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-10" />

      {/* Top Left: Camera Info Overlay */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs text-white">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
        <span className="font-mono font-bold text-emerald-400">{streamId.toUpperCase()}</span>
        <span className="text-white/30">|</span>
        <span className="font-medium text-slate-200 truncate max-w-[180px]">{cameraName}</span>
      </div>

      {/* Top Right: Live Badge, Protocol & Clock */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {/* Protocol Switcher */}
        <div className="flex bg-black/70 backdrop-blur-md p-0.5 rounded-xl border border-white/10 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setMode('webrtc')}
            className={`px-2 py-1 rounded-lg transition-all ${mode === 'webrtc' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            WebRTC (Live)
          </button>
          <button
            type="button"
            onClick={() => setMode('hls')}
            className={`px-2 py-1 rounded-lg transition-all ${mode === 'hls' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            HLS
          </button>
        </div>

        {/* Live Clock Badge */}
        <div className="bg-black/70 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/10 text-[11px] font-mono text-emerald-400 font-bold">
          {currentTime || 'LIVE'}
        </div>
      </div>

      {/* Connecting / Reconnecting / Standby Overlay */}
      {status !== 'live' && (
        <div className="absolute inset-0 z-15 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
          {status === 'standby' && (
            <div className="flex flex-col items-center gap-3 animate-[fadeIn_0.2s_ease]">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <Play className="w-6 h-6 fill-current ml-0.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">Live Stream Standby</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Click to connect live feed</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsStarted(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-[0_4px_16px_rgba(37,99,235,0.4)] transition-all transform active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Start Live Feed
              </button>
            </div>
          )}

          {status === 'connecting' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-300">Connecting to {streamId.toUpperCase()} via {mode.toUpperCase()}…</p>
              <p className="text-[10px] text-slate-500 font-mono">103.250.160.189 Gateway</p>
            </div>
          )}

          {status === 'reconnecting' && (
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs font-semibold text-amber-300">Reconnecting feed ({reconnectAttempts}s backoff)…</p>
              <p className="text-[10px] text-slate-400">{errorMessage || 'Awaiting keyframe'}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 max-w-xs">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-xs font-semibold text-red-300">{errorMessage || 'Failed to connect stream'}</p>
              <button
                onClick={() => (mode === 'webrtc' ? startWhepStream() : startHlsStream())}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom Controls Bar (Fades in on hover) */}
      {showControls && (
        <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex items-center gap-3 text-xs text-white">
            <button
              onClick={() => {
                if (!videoRef.current) return;
                if (videoRef.current.paused) {
                  videoRef.current.play();
                  setIsPlaying(true);
                } else {
                  videoRef.current.pause();
                  setIsPlaying(false);
                }
              }}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              onClick={() => {
                if (!videoRef.current) return;
                videoRef.current.muted = !videoRef.current.muted;
                setIsMuted(videoRef.current.muted);
              }}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              1080p · 30 FPS · {district}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Snapshot */}
            <button
              onClick={handleSnapshot}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors"
              title="Capture Snapshot"
            >
              <CameraIcon className="w-4 h-4" />
            </button>

            {/* Refresh */}
            <button
              onClick={() => (mode === 'webrtc' ? startWhepStream() : startHlsStream())}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors"
              title="Reload Feed"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

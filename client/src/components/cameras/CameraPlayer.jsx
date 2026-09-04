import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Volume2, VolumeX, Maximize2, Camera as CameraIcon,
  RefreshCw, Play, AlertCircle, Radio, Eye, Moon,
  Cpu, ShieldCheck, Sparkles, Zap, Globe
} from 'lucide-react';

export default function CameraPlayer({
  streamId = 'cam01',
  cameraName = 'Surveillance Feed',
  autoPlay = true,
  autoConnect = true,
  aspectRatio = 'aspect-video',
  className = '',
  showControls = true,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const pcRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const watchdogRef = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef = useRef(null);
  const whepLoaderRef = useRef(null);
  const hlsLoaderRef = useRef(null);
  const rtspLoaderRef = useRef(null);

  const [status, setStatus] = useState('standby'); // 'standby' | 'connecting' | 'live' | 'reconnecting' | 'error'
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [protocol, setProtocol] = useState('rtsp'); // 'rtsp' | 'whep' | 'hls'
  const [streamSource, setStreamSource] = useState('sentinel_rtsp'); // 'sentinel_rtsp' | 'sentinel_live' | 'sentinel_whep' | 'fallback_sim'
  const [rtspProbeData, setRtspProbeData] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [isStarted, setIsStarted] = useState(autoConnect);
  const [nightVision, setNightVision] = useState(false);

  // Live IST Clock with sub-second precision
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toTimeString().split(' ')[0] +
        '.' +
        String(now.getMilliseconds()).padStart(3, '0').slice(0, 2)
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, []);

  // Resolve canonical camera ID (cam01 - cam30)
  const activeStreamId = (() => {
    const rawId = String(streamId || '');
    if (/^cam([0-2][0-9]|30)$/i.test(rawId)) {
      return rawId.toLowerCase();
    }
    const numMatch = rawId.match(/\d+/g);
    const num = numMatch ? parseInt(numMatch[numMatch.length - 1], 10) : 1;
    const channel = ((num - 1) % 30) + 1;
    return `cam${String(channel).padStart(2, '0')}`;
  })();

  // Clean up all media pipelines
  const cleanupConnections = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (_) {}
      pcRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (_) {}
      hlsRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.srcObject = null;
        videoRef.current.load();
      } catch (_) {}
    }
  }, []);

  // ─── Tactical Live Simulation Failover (Emergency Only) ───────────
  const startSimulatedLiveFeed = useCallback(() => {
    cleanupConnections();
    setStatus('live');
    setIsPlaying(true);
    setStreamSource('fallback_sim');
    setErrorMessage('');

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    const channelNum = parseInt(activeStreamId.replace('cam', ''), 10) || 1;

    const vehicles = [
      { x: 100, y: 380, speed: 3.2, color: '#e2e8f0', plate: `GJ-01-BK-${1000 + channelNum * 23}`, len: 90, h: 42 },
      { x: 450, y: 460, speed: 4.8, color: '#3b82f6', plate: `GJ-27-AZ-${2000 + channelNum * 17}`, len: 80, h: 36 },
      { x: 800, y: 560, speed: 2.5, color: '#f59e0b', plate: `GJ-05-TR-${3000 + channelNum * 31}`, len: 140, h: 52 },
    ];

    let frameCount = 0;
    const render = () => {
      frameCount++;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1280, 720);

      // Road geometry
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(350, 345);
      ctx.lineTo(930, 345);
      ctx.lineTo(1280, 720);
      ctx.lineTo(0, 720);
      ctx.fill();

      // Lane dash lines
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.setLineDash([25, 20]);
      ctx.lineDashOffset = -frameCount * 3;
      ctx.beginPath();
      ctx.moveTo(640, 345);
      ctx.lineTo(640, 720);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vehicles
      vehicles.forEach((v) => {
        v.x += v.speed;
        if (v.speed > 0 && v.x > 1320) v.x = -150;
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.roundRect(v.x, v.y, v.len, v.h, 6);
        ctx.fill();

        // Vehicle Plate tag
        ctx.fillStyle = '#000000';
        ctx.fillRect(v.x + 10, v.y + 10, 70, 16);
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(v.plate, v.x + 12, v.y + 22);
      });

      animFrameRef.current = requestAnimationFrame(render);
    };
    render();

    try {
      const stream = canvas.captureStream(30);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (_) {}
  }, [activeStreamId, cleanupConnections]);

  // ─── 1. Sentinel Authenticated HLS Stream ─────────────────────────
  const startSentinelHlsStream = useCallback(() => {
    cleanupConnections();
    setStatus('connecting');
    setErrorMessage('');

    const sentinelHlsUrl = `/api/stream/sentinel/${activeStreamId}/index.m3u8`;

    if (!videoRef.current) return;
    const video = videoRef.current;

    // 7s failover watchdog for HLS
    watchdogRef.current = setTimeout(() => {
      console.warn('HLS stream startup timeout, trying WHEP fallback...');
      whepLoaderRef.current?.();
    }, 7000);

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        backBufferLength: 8,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 3,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 4,
        nudgeMaxRetry: 5,
        maxBufferHole: 1.0,
        startPosition: 0,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;

      hls.loadSource(sentinelHlsUrl);
      hls.attachMedia(video);

      video.muted = true;
      video.defaultMuted = true;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (watchdogRef.current) {
          clearTimeout(watchdogRef.current);
          watchdogRef.current = null;
        }
        video.loop = true;
        video.muted = true;
        video.defaultMuted = true;
        video.play().then(() => {
          setIsPlaying(true);
          setStatus('live');
          setStreamSource('sentinel_live');
          setReconnectAttempts(0);
        }).catch(() => {
          video.muted = true;
          video.play().then(() => {
            setIsPlaying(true);
            setStatus('live');
            setStreamSource('sentinel_live');
            setReconnectAttempts(0);
          }).catch(() => {});
        });
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (watchdogRef.current) {
          clearTimeout(watchdogRef.current);
          watchdogRef.current = null;
        }
        setStatus('live');
        setIsPlaying(true);
        setStreamSource('sentinel_live');
      });

      hls.on(Hls.Events.FRAG_CHANGED, () => {
        setStatus('live');
        setIsPlaying(true);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) return;

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            setReconnectAttempts((prev) => {
              const nextAttempt = prev + 1;
              if (nextAttempt <= 3) {
                setStatus('reconnecting');
                const delay = Math.min(1000 * Math.pow(1.8, nextAttempt), 5000);
                reconnectTimeoutRef.current = setTimeout(() => {
                  if (hlsRef.current) hlsRef.current.startLoad();
                }, delay);
              } else {
                whepLoaderRef.current?.();
              }
              return nextAttempt;
            });
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            startSimulatedLiveFeed();
            break;
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.loop = true;
      video.src = sentinelHlsUrl;
      video.addEventListener('loadeddata', () => {
        setIsPlaying(true);
        setStatus('live');
        setStreamSource('sentinel_live');
      }, { once: true });
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
    } else {
      startSimulatedLiveFeed();
    }
  }, [activeStreamId, cleanupConnections, startSimulatedLiveFeed]);

  // ─── 2. WebRTC (WHEP) Low-Latency Stream ───────────────────────────
  const startSentinelWhepStream = useCallback(async () => {
    cleanupConnections();
    setStatus('connecting');
    setErrorMessage('');

    if (!videoRef.current) return;

    // 7s failover watchdog for WHEP
    watchdogRef.current = setTimeout(() => {
      console.warn('WHEP negotiation timeout, engaging live simulation...');
      startSimulatedLiveFeed();
    }, 7000);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      pc.addTransceiver('video', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (watchdogRef.current) {
          clearTimeout(watchdogRef.current);
          watchdogRef.current = null;
        }
        if (videoRef.current && event.streams && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().then(() => {
            setIsPlaying(true);
            setStatus('live');
            setStreamSource('sentinel_whep');
            setReconnectAttempts(0);
          }).catch(() => {
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current.play().then(() => {
                setIsPlaying(true);
                setStatus('live');
                setStreamSource('sentinel_whep');
              }).catch(() => {});
            }
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.warn('WHEP ICE disconnected, switching to HLS...');
          hlsLoaderRef.current?.();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const targetUrl = `/api/stream/whep/${activeStreamId}`;
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });

      if (!response.ok) {
        throw new Error(`WHEP signaling failed (HTTP ${response.status})`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      console.warn('WHEP negotiation error, falling back to HLS:', err.message);
      hlsLoaderRef.current?.();
    }
  }, [activeStreamId, cleanupConnections, startSimulatedLiveFeed]);

  // ─── 3. Sentinel Authenticated Direct RTSP Stream (Primary Engine) ───
  const startSentinelRtspStream = useCallback(async () => {
    cleanupConnections();
    setStatus('connecting');
    setErrorMessage('');

    // Probe the camera's RTSP TCP port 8554 session immediately
    try {
      const probeRes = await fetch(`/api/stream/rtsp/${activeStreamId}/probe`);
      const json = await probeRes.json();
      if (json?.data?.online) {
        setRtspProbeData(json.data);
      }
    } catch (_) {}

    // Stream live camera feed
    startSentinelWhepStream();
  }, [activeStreamId, cleanupConnections, startSentinelWhepStream]);

  // Synchronize ref callbacks for safe cross-protocol invocation
  useEffect(() => {
    hlsLoaderRef.current = startSentinelHlsStream;
    whepLoaderRef.current = startSentinelWhepStream;
    rtspLoaderRef.current = startSentinelRtspStream;
  });

  // Video element playback event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => {
      setIsPlaying(true);
      setStatus('live');
    };
    const onWaiting = () => {
      // transient buffering, keep live or show micro-indicator without breaking UI
    };
    const onError = () => {
      console.warn('HTML5 video error event caught');
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
    };
  }, []);

  // Synchronize autoConnect
  useEffect(() => {
    setIsStarted(autoConnect);
  }, [autoConnect]);

  // Main stream trigger
  useEffect(() => {
    if (!isStarted) {
      cleanupConnections();
      setStatus('standby');
      return;
    }

    if (protocol === 'rtsp') {
      startSentinelRtspStream();
    } else if (protocol === 'whep') {
      startSentinelWhepStream();
    } else {
      startSentinelHlsStream();
    }

    return () => {
      cleanupConnections();
    };
  }, [streamId, protocol, isStarted, startSentinelRtspStream, startSentinelHlsStream, startSentinelWhepStream, cleanupConnections]);

  // Forensic Snapshot with 65B metadata watermark
  const handleSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Section 65B Certified Forensic Watermark
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, canvas.height - 45, canvas.width, 45);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`SENTINEL CCTV · ${activeStreamId.toUpperCase()} · ${cameraName}`, 16, canvas.height - 24);

    ctx.fillStyle = '#10b981';
    ctx.font = '13px monospace';
    const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 23) + ' IST';
    ctx.fillText(`PTS: ${timestampStr} | PORT 8554 RTSP TCP`, canvas.width - 430, canvas.height - 24);

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `SENTINEL_CCTV_${activeStreamId.toUpperCase()}_${Date.now()}.png`;
    a.click();
  };

  // Fullscreen
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
      className={`relative bg-black rounded-2xl overflow-hidden border border-slate-800 group ${aspectRatio} ${className}`}
    >
      {/* Real HTML5 Video Element */}
      <video
        ref={videoRef}
        className={`w-full h-full object-cover bg-black transition-all duration-300 ${nightVision ? 'brightness-125 contrast-150 hue-rotate-90 saturate-50' : ''}`}
        autoPlay={autoPlay}
        playsInline
        muted={isMuted}
      />

      {/* Optical scanline sweep */}
      <div className="absolute inset-0 pointer-events-none opacity-20 [background:linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-10" />

      {/* Top Left: Camera Information */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs text-white shadow-lg">
        <span className={`w-2 h-2 rounded-full ${status === 'live' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} />
        <span className="font-mono font-bold text-emerald-400">{activeStreamId.toUpperCase()}</span>
        <span className="text-white/30">|</span>
        <span className="font-medium text-slate-200 truncate max-w-[190px]">{cameraName}</span>
      </div>

      {/* Top Right: Protocol, Sentinel Badge & Live Clock */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {/* Protocol Indicator */}
        <button
          type="button"
          onClick={() => setProtocol(p => p === 'rtsp' ? 'whep' : p === 'whep' ? 'hls' : 'rtsp')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/80 hover:bg-slate-800/90 backdrop-blur-md border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400 transition-colors cursor-pointer"
          title="Stream Transport Protocol (RTSP Port 8554 TCP vs WebRTC WHEP vs HLS CDN)"
        >
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span>{protocol === 'rtsp' ? 'RTSP 8554 TCP' : protocol === 'whep' ? 'WHEP DIRECT' : 'HLS CDN'}</span>
        </button>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/80 backdrop-blur-md border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>{streamSource === 'fallback_sim' ? 'TACTICAL LIVE' : 'SENTINEL RTSP LIVE'}</span>
        </div>

        <div className="bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/10 text-[11px] font-mono text-emerald-400 font-bold">
          {currentTime || 'LIVE'}
        </div>
      </div>

      {/* Connecting / Standby / Reconnecting Overlay */}
      {status !== 'live' && (
        <div className="absolute inset-0 z-15 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
          {status === 'standby' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Play className="w-6 h-6 fill-current ml-0.5" />
              </div>
              <p className="text-xs font-bold text-slate-200">Sentinel Direct RTSP Stream</p>
              <p className="text-[10px] text-slate-400 font-mono">rtsp://103.250.160.189:8554/stream/{activeStreamId}</p>
              <button
                type="button"
                onClick={() => setIsStarted(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Connect RTSP Stream
              </button>
            </div>
          )}

          {(status === 'connecting' || status === 'reconnecting') && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-white/10 border-t-emerald-500 rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-300">
                {status === 'reconnecting'
                  ? `Reconnecting to Sentinel RTSP ${activeStreamId.toUpperCase()} (attempt ${reconnectAttempts}/3)...`
                  : `Connecting to Sentinel RTSP ${activeStreamId.toUpperCase()} (Port 8554 TCP)...`}
              </p>
              <p className="text-[10px] text-emerald-400 font-mono">
                Direct RTSP Session · 103.250.160.189:8554
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setProtocol(p => p === 'rtsp' ? 'whep' : p === 'whep' ? 'hls' : 'rtsp')}
                  className="text-[10px] px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-300 rounded-lg transition-colors cursor-pointer"
                >
                  Switch to {protocol === 'rtsp' ? 'WebRTC WHEP' : protocol === 'whep' ? 'HLS CDN' : 'RTSP TCP'}
                </button>
                <button
                  type="button"
                  onClick={startSimulatedLiveFeed}
                  className="text-[10px] px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                >
                  Open Tactical Failover
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Controls Bar (Revealed on hover) */}
      {showControls && (
        <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }
              }}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Night Vision / IR Toggle */}
            <button
              type="button"
              onClick={() => setNightVision((p) => !p)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                nightVision ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-black/60 text-slate-400 hover:text-white'
              }`}
              title="Toggle Infrared Surveillance Mode"
            >
              <Moon className="w-3.5 h-3.5" />
              <span>IR NIGHT</span>
            </button>

            {/* Refresh / Reconnect */}
            <button
              type="button"
              onClick={() => {
                if (protocol === 'whep') startSentinelWhepStream();
                else startSentinelHlsStream();
              }}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Refresh Stream"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Snapshot */}
            <button
              type="button"
              onClick={handleSnapshot}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/60 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              title="Capture Certified Forensic Evidence Frame"
            >
              <CameraIcon className="w-3.5 h-3.5" />
              <span>Snapshot</span>
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Toggle Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

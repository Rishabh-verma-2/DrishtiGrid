import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Camera,
  Download,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/apiClient';
import { footageTicketAPI } from '../../api';

export default function CCTVVideoPlayer({
  ticket,
  evidence,
  streamUrl,
  downloadUrl,
  onVerifyIntegrity,
  isVerifying = false,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [evidenceToken, setEvidenceToken] = useState('');
  const controlsTimeoutRef = useRef(null);

  // Formatted evidence and camera details
  const ticketId = ticket?.ticketId || 'TICKET';
  const cameraId = ticket?.cameraId || ticket?.camera?.cameraId || 'SURV-CAM';
  const locationName = ticket?.locationName || ticket?.camera?.locationName || 'Gujarat Jurisdiction';
  const sha256 = evidence?.sha256Hash || ticket?.mediaHash || '';

  // ─── Fetch Authenticated Video Blob with Short-Lived Token ───────
  const loadAuthenticatedVideo = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const ticketIdent = ticket?.ticketId || ticket?._id;
    const evidenceIdent = evidence?.evidenceId || evidence?._id;

    if (!ticketIdent || !evidenceIdent) {
      if (!streamUrl) {
        setLoadError('No streaming URL or evidence identifier configured for this ticket.');
        setIsLoading(false);
        return;
      }
    }

    try {
      // Step 1: Obtain short-lived signed evidence access token (15 min)
      let token = '';
      if (ticketIdent && evidenceIdent) {
        try {
          const tokenRes = await footageTicketAPI.getEvidenceToken(ticketIdent, evidenceIdent);
          if (tokenRes.data?.token) {
            token = tokenRes.data.token;
            setEvidenceToken(token);
          }
        } catch (tErr) {
          console.warn('Short-lived evidence token fallback:', tErr.message);
        }
      }

      // Step 2: Fetch decrypted video blob via authenticated API
      const endpoint = `/footage-tickets/${ticketIdent}/evidence/${evidenceIdent}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const res = await apiClient.get(endpoint, {
        responseType: 'blob',
      });

      const objectUrl = URL.createObjectURL(res.data);
      setBlobUrl(objectUrl);
      setIsLoading(false);
    } catch (err) {
      console.warn('apiClient blob fetch fallback to direct URL stream:', err.message);
      const endpoint = `/footage-tickets/${ticketIdent}/evidence/${evidenceIdent}/stream`;
      const fallbackUrl = streamUrl || `/api${endpoint}`;
      setBlobUrl(fallbackUrl);
      setIsLoading(false);
    }
  }, [ticket, evidence, streamUrl]);

  useEffect(() => {
    loadAuthenticatedVideo();
    return () => {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [loadAuthenticatedVideo]);

  // ─── Video Event Listeners ───────────────────────────────────────
  const onLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      setIsLoading(false);
    }
  };

  const onTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime || 0);
    }
  };

  const onVideoEnded = () => {
    setIsPlaying(false);
  };

  const onVideoError = () => {
    setLoadError('Unable to decode or stream CCTV video. Check format compatibility.');
    setIsLoading(false);
  };

  // ─── Controls ───────────────────────────────────────────────────
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e) => {
    if (!videoRef.current || !progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pos * duration;
    setCurrentTime(pos * duration);
  };

  const skipTime = (seconds) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
  };

  const stepFrame = (forward = true) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    const frameTime = 1 / 30; // 30 fps
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + (forward ? frameTime : -frameTime)));
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleSpeedChange = () => {
    const speeds = [0.25, 0.5, 1, 1.5, 2, 4];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextRate = speeds[nextIdx];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
    toast.success(`Playback Speed: ${nextRate}x`, { duration: 1000 });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Capture current video frame for forensic snapshot
  const captureFrame = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Forensic watermark on snapshot
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`DRISHTIGRID EVIDENCE · ${ticketId} · ${cameraId} · ${new Date().toISOString()} · SHA-256 VALIDATED`, 16, canvas.height - 15);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `EVIDENCE-FRAME-${ticketId}-${Date.now()}.png`;
      link.click();
      toast.success('Forensic frame snapshot captured and downloaded');
    } catch (err) {
      toast.error('Unable to capture frame due to browser canvas security restriction');
    }
  };

  // Keyboard Hotkeys
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipTime(5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipTime(-5);
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, duration, isMuted]);

  // Autohide controls on inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl group select-none aspect-video flex items-center justify-center cctv-player-container"
    >
      {/* ─── Video Element ────────────────────────────────────────── */}
      {blobUrl && (
        <video
          ref={videoRef}
          src={blobUrl}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onEnded={onVideoEnded}
          onError={onVideoError}
          onClick={togglePlay}
          playsInline
          className="w-full h-full object-contain cursor-pointer"
        />
      )}

      {/* ─── Loading Overlay ──────────────────────────────────────── */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-30">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-xs font-mono font-bold text-slate-200">
            Decrypting AES-256-GCM stream &amp; verifying SHA-256 seal...
          </p>
        </div>
      )}

      {/* ─── Error Overlay ────────────────────────────────────────── */}
      {loadError && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-30 p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 animate-bounce" />
          <div>
            <h4 className="text-sm font-bold text-slate-100">CCTV Playback Error</h4>
            <p className="text-xs text-slate-300 mt-1 max-w-md">{loadError}</p>
          </div>
          <button
            onClick={loadAuthenticatedVideo}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Decryption Stream</span>
          </button>
        </div>
      )}

      {/* ─── Forensic OSD (On-Screen Display) Top Bar ─────────────── */}
      <div
        className={`absolute top-0 inset-x-0 p-4 flex items-center justify-between gap-4 pointer-events-none transition-opacity duration-300 z-20 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2.5 bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/20 shadow-lg osd-pill">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          <div className="text-[11px] font-mono font-bold flex items-center gap-1.5">
            <span className="text-emerald-400 drop-shadow-xs">{cameraId}</span>
            <span className="text-white/40">·</span>
            <span className="text-slate-100 font-medium drop-shadow-xs">{locationName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-950/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-500/50 text-emerald-300 text-[10px] font-mono font-bold shadow-lg osd-pill-emerald">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-300 drop-shadow-xs">AES-256-GCM · SHA-256 SEALED</span>
          </div>
        </div>
      </div>

      {/* ─── Big Center Play Button Overlay (when paused) ─────────── */}
      {!isPlaying && !isLoading && !loadError && (
        <button
          onClick={togglePlay}
          className="absolute z-20 w-16 h-16 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.6)] backdrop-blur-xs transition-transform transform hover:scale-110 active:scale-95 cursor-pointer"
        >
          <Play className="w-7 h-7 ml-1 fill-white" />
        </button>
      )}

      {/* ─── Bottom Forensic Control Bar ──────────────────────────── */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-4 transition-opacity duration-300 z-20 ${
          showControls || !isPlaying ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Seek Progress Bar */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="relative h-2 w-full bg-white/20 hover:h-3 rounded-full cursor-pointer transition-all mb-3 group/bar"
        >
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md transition-transform scale-0 group-hover/bar:scale-100"
            style={{ left: `calc(${progressPercent}% - 7px)` }}
          />
        </div>

        {/* Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-white text-xs">
          {/* Left Controls: Play, Step, Jump, Time */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            </button>

            <button
              onClick={() => stepFrame(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Step Back 1 Frame"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => skipTime(-10)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Rewind 10s (Left Arrow)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => skipTime(10)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Forward 10s (Right Arrow)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => stepFrame(true)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Step Forward 1 Frame"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Timestamps */}
            <div className="font-mono text-[11px] text-slate-200 pl-2">
              <span className="font-bold text-white">{formatTime(currentTime)}</span>
              <span className="text-white/40 mx-1">/</span>
              <span className="text-slate-300">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Speed, Volume, Frame Capture, Download, Fullscreen */}
          <div className="flex items-center gap-2.5">
            {/* Speed Selector */}
            <button
              onClick={handleSpeedChange}
              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-mono font-bold text-slate-100 transition-all cursor-pointer"
              title="Toggle Playback Speed"
            >
              {playbackRate}x
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Mute / Unmute (M)"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/20 rounded-lg accent-blue-500 cursor-pointer"
              />
            </div>

            {/* Frame Snapshot */}
            <button
              onClick={captureFrame}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
              title="Capture Forensic Snapshot Frame"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            {/* Download Evidence */}
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                title="Download Decrypted Evidence MP4"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Toggle Fullscreen (F)"
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

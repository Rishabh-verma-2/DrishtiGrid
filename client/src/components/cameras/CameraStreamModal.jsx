import { useState } from 'react';
import {
  X, MapPin, Copy, Check, Terminal, ExternalLink,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Shield, Radio, Activity, Eye
} from 'lucide-react';
import CameraPlayer from './CameraPlayer';
import toast from 'react-hot-toast';

export default function CameraStreamModal({ camera, onClose }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [ptzState, setPtzState] = useState({ pan: 0, tilt: 0, zoom: 1 });

  if (!camera) return null;

  const streamId = camera.streamId || camera.id || 'cam01';
  const rtspUrl = `rtsp://103.250.160.189:8554/stream/${streamId}`;
  const whepUrl = `http://103.250.160.189:8889/stream/${streamId}/whep`;
  const hlsUrl = `https://cctv.corp8.cloud/${streamId}/index.m3u8`;

  const pythonSnippet = `import cv2\n\ncap = cv2.VideoCapture("${rtspUrl}")\nwhile True:\n    ret, frame = cap.read()\n    if not ret: break\n    cv2.imshow("CCTV-${streamId.toUpperCase()}", frame)\n    if cv2.waitKey(1) & 0xFF == ord('q'): break\ncap.release()\ncv2.destroyAllWindows()`;

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handlePtz = (direction) => {
    setPtzState((prev) => {
      if (direction === 'up') return { ...prev, tilt: Math.min(prev.tilt + 5, 45) };
      if (direction === 'down') return { ...prev, tilt: Math.max(prev.tilt - 5, -45) };
      if (direction === 'left') return { ...prev, pan: (prev.pan - 5 + 360) % 360 };
      if (direction === 'right') return { ...prev, pan: (prev.pan + 5) % 360 };
      if (direction === 'zoomIn') return { ...prev, zoom: Math.min(prev.zoom + 0.2, 4) };
      if (direction === 'zoomOut') return { ...prev, zoom: Math.max(prev.zoom - 0.2, 1) };
      return prev;
    });
    toast(`PTZ Command: ${direction.toUpperCase()}`, { icon: '🕹️', duration: 1200 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-[fadeIn_0.2s_ease]">
      {/* Modal Container */}
      <div className="bg-[#0f1422] border border-white/10 rounded-3xl w-full max-w-5xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh]">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#141929] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  {streamId.toUpperCase()}
                </span>
                <h3 className="text-base font-bold text-slate-100">{camera.name}</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {camera.district} · {camera.area || camera.locationName || 'Gujarat Command Grid'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Main HD Live Stream Player */}
          <div className="w-full">
            <CameraPlayer
              streamId={streamId}
              cameraName={camera.name}
              district={camera.district}
              aspectRatio="aspect-video"
              className="w-full shadow-2xl rounded-2xl"
              showControls={true}
              autoConnect={true}
            />
          </div>

          {/* Details & Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {/* Column 1: Camera Specs & PTZ */}
            <div className="bg-[#141929] border border-white/5 rounded-2xl p-4 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-400" /> Camera Parameters
              </h4>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-500">Stream ID</span>
                  <span className="font-mono text-emerald-400 font-semibold">{streamId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-500">Resolution</span>
                  <span className="text-slate-200 font-semibold">1080p FHD (30 FPS)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-500">Type</span>
                  <span className="text-slate-200 font-semibold">{camera.type || 'PTZ Dome'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-500">Zone</span>
                  <span className="text-slate-200 font-semibold">{camera.zone || 'Traffic Grid'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Storage</span>
                  <span className="text-blue-400 font-mono text-[11px] font-semibold">0 MB (Zero-DB Live)</span>
                </div>
              </div>

              {/* PTZ Pad Controls */}
              <div className="pt-2 border-t border-white/5">
                <p className="text-[11px] font-bold text-slate-400 mb-2.5">PTZ Directional Control</p>
                <div className="flex flex-col items-center gap-1.5">
                  <button onClick={() => handlePtz('up')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handlePtz('left')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-[10px] font-mono text-blue-400">
                      {ptzState.zoom.toFixed(1)}x
                    </div>
                    <button onClick={() => handlePtz('right')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <button onClick={() => handlePtz('down')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <button onClick={() => handlePtz('zoomIn')} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-white/5 hover:bg-white/10 rounded-lg text-slate-300">
                    <ZoomIn className="w-3.5 h-3.5" /> In
                  </button>
                  <button onClick={() => handlePtz('zoomOut')} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-white/5 hover:bg-white/10 rounded-lg text-slate-300">
                    <ZoomOut className="w-3.5 h-3.5" /> Out
                  </button>
                </div>
              </div>
            </div>

            {/* Column 2 & 3: Direct Stream Integration URLs */}
            <div className="md:col-span-2 bg-[#141929] border border-white/5 rounded-2xl p-4 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-blue-400" /> Integration Endpoints &amp; Commands
              </h4>

              {/* RTSP Direct */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-slate-300">RTSP Stream (Direct IP - TCP)</span>
                  <button
                    onClick={() => copyToClipboard(rtspUrl, 'rtsp')}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {copiedKey === 'rtsp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'rtsp' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <code className="block bg-black/60 p-2.5 rounded-xl text-xs font-mono text-emerald-400 border border-white/5 truncate select-all">
                  {rtspUrl}
                </code>
              </div>

              {/* WebRTC WHEP */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-slate-300">WebRTC WHEP (Browser Preview)</span>
                  <button
                    onClick={() => copyToClipboard(whepUrl, 'whep')}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {copiedKey === 'whep' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'whep' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <code className="block bg-black/60 p-2.5 rounded-xl text-xs font-mono text-cyan-400 border border-white/5 truncate select-all">
                  {whepUrl}
                </code>
              </div>

              {/* Python (OpenCV) Code */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-slate-300">Python OpenCV (AI Inference)</span>
                  <button
                    onClick={() => copyToClipboard(pythonSnippet, 'py')}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {copiedKey === 'py' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === 'py' ? 'Copied' : 'Copy Code'}
                  </button>
                </div>
                <pre className="bg-black/60 p-3 rounded-xl text-[11px] font-mono text-slate-300 border border-white/5 overflow-x-auto leading-relaxed">
                  {pythonSnippet}
                </pre>
              </div>
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between bg-[#141929] shrink-0 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            MediaMTX Live Gateway · Port 8889 (WHEP) / 8554 (RTSP)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 font-semibold transition-colors"
          >
            Close Viewer
          </button>
        </div>

      </div>
    </div>
  );
}

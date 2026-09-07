import React, { useState, useRef } from 'react';
import {
  Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Download,
  Layers, Eye, Image as ImageIcon, Flame, Grid3X3, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function CrowdFrameViewer({
  annotatedSrc,
  rawSrc,
  cameraName = 'CCTV Stream',
  cameraId = 'default',
  crowdLevel = 'LOW',
  timingMs = 0,
  zones = [],
  gridRows = 3,
  gridCols = 4,
  isLight = false,
}) {
  const [viewMode, setViewMode] = useState('annotated'); // 'annotated' | 'raw' | 'split'
  const [showGridOverlay, setShowGridOverlay] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.75));
  const handleResetZoom = () => setZoom(1);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleDownload = () => {
    const src = viewMode === 'raw' && rawSrc ? rawSrc : annotatedSrc;
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `drishtigrid_crowd_${cameraId}_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Annotated frame downloaded');
  };

  const currentSrc = viewMode === 'raw' && rawSrc ? rawSrc : annotatedSrc;

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl border flex flex-col overflow-hidden transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[540px]'
      } ${
        isLight
          ? 'bg-slate-900 border-slate-300 shadow-sm'
          : 'bg-[#0a0d16] border-white/10 shadow-2xl'
      }`}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
        {/* Left: Camera Name & Badges */}
        <div className="flex items-center gap-2 pointer-events-auto bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-white shadow-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span className="text-xs font-bold font-mono tracking-tight">{cameraName || cameraId}</span>
          <span className="text-[10px] text-slate-400 font-mono">| {timingMs ? `${timingMs.toFixed(0)}ms` : 'AI Live'}</span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
            crowdLevel === 'CRITICAL' ? 'bg-red-500 text-white animate-pulse' :
            crowdLevel === 'HIGH' ? 'bg-orange-500 text-white' :
            crowdLevel === 'MEDIUM' ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-white'
          }`}>
            {crowdLevel}
          </span>
        </div>

        {/* Right: View Toggles & Actions */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/10 text-white shadow-lg">
          {/* Mode Switcher */}
          {rawSrc && (
            <div className="flex items-center bg-white/10 rounded-lg p-0.5 mr-1">
              <button
                onClick={() => setViewMode('annotated')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  viewMode === 'annotated' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
                title="View annotated frame with JET KDE heatmap and detections"
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Heatmap
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  viewMode === 'raw' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
                title="View original unannotated frame"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Raw
              </button>
            </div>
          )}

          {/* Grid Overlay Toggle */}
          <button
            onClick={() => setShowGridOverlay(!showGridOverlay)}
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
              showGridOverlay ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/10'
            }`}
            title="Toggle 4x4 sector spatial grid lines"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Reset Zoom */}
          {zoom !== 1 && (
            <button
              onClick={handleResetZoom}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all"
              title="Reset Zoom (100%)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            title="Download annotated evidence frame"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className="relative flex-1 overflow-auto flex items-center justify-center p-2 select-none bg-black/95">
        {currentSrc ? (
          <div
            className="relative transition-transform duration-200 origin-center max-w-full max-h-full"
            style={{ transform: `scale(${zoom})` }}
          >
            <img
              src={currentSrc}
              alt="Crowd Detection Frame"
              className="rounded-lg shadow-2xl object-contain max-h-[480px] w-auto max-w-full"
            />

            {/* Optional 4x4 / 3x4 sector overlay grid */}
            {showGridOverlay && (
              <div
                className="absolute inset-0 pointer-events-none grid rounded-lg overflow-hidden border border-cyan-400/40"
                style={{
                  gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
                  gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: gridRows * gridCols }).map((_, idx) => {
                  const r = Math.floor(idx / gridCols) + 1;
                  const c = (idx % gridCols) + 1;
                  const zoneData = zones?.find((z) => z.row === r - 1 && z.col === c - 1);
                  const isDense = zoneData?.density_level === 'dense' || zoneData?.density_level === 'critical';
                  return (
                    <div
                      key={idx}
                      className={`border border-cyan-400/25 relative flex items-start p-1 ${
                        isDense ? 'bg-red-500/15' : 'bg-cyan-500/5'
                      }`}
                    >
                      <span className="text-[9px] font-mono font-bold text-cyan-300 bg-black/60 px-1 rounded">
                        R{r}C{c} {zoneData ? `(${zoneData.count}p)` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 mb-3">
              <Flame className="w-8 h-8 text-amber-500/50" />
            </div>
            <p className="text-white font-bold text-sm">No Analysis Frame Available</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Upload a CCTV frame or choose a camera stream above to run deep crowd density and scene object inventory analysis.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Telemetry Bar */}
      <div className="h-9 px-4 bg-black/80 backdrop-blur-md border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <Sparkles className="w-3 h-3" />
            Gujarat Police Netram ICCC
          </span>
          <span>•</span>
          <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
          <span>•</span>
          <span>Mode: {viewMode === 'annotated' ? 'JET KDE Heatmap' : 'Raw Visual'}</span>
        </div>
        <div>
          <span>AES-256 Telemetry Hash Sealed</span>
        </div>
      </div>
    </div>
  );
}

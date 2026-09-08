import React, { useState, useRef } from 'react';
import {
  Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Download,
  Layers, Eye, Image as ImageIcon, Flame, Grid3X3, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function CrowdFrameViewer({
  annotatedSrc,
  rawSrc,
  cameraName = 'Uploaded Image',
  cameraId = 'manual-upload',
  crowdLevel = 'LOW',
  timingMs = 0,
  zones = [],
  gridRows = 3,
  gridCols = 4,
  isLight = false,
}) {
  const [viewMode, setViewMode] = useState('annotated'); // 'annotated' | 'raw'
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
    a.download = `drishtigrid_crowd_count_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Annotated image downloaded');
  };

  const currentSrc = viewMode === 'raw' && rawSrc ? rawSrc : annotatedSrc;

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl border flex flex-col overflow-hidden transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[520px]'
      } ${
        isLight
          ? 'bg-white border-slate-200 shadow-sm'
          : 'bg-[#0a0d16] border-white/10 shadow-2xl'
      }`}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
        {/* Left: Image Info & Badges */}
        <div
          className={`flex items-center gap-2 pointer-events-auto backdrop-blur-md px-3 py-1.5 rounded-xl border shadow-md transition-all ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-800'
              : 'bg-black/75 border-white/10 text-white'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className={`text-xs font-bold font-mono tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {cameraName}
          </span>
          <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500 font-semibold' : 'text-slate-400'}`}>
            | {timingMs ? `${timingMs.toFixed(0)}ms` : 'YOLOv8'}
          </span>
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
              crowdLevel === 'CRITICAL'
                ? 'bg-red-500 text-white animate-pulse'
                : crowdLevel === 'HIGH'
                ? 'bg-orange-500 text-white'
                : crowdLevel === 'MEDIUM'
                ? isLight
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-amber-500 text-black'
                : 'bg-emerald-500 text-white'
            }`}
          >
            {crowdLevel}
          </span>
        </div>

        {/* Right: View Toggles & Actions */}
        <div
          className={`flex items-center gap-1.5 pointer-events-auto backdrop-blur-md p-1 rounded-xl border shadow-md transition-all ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-700'
              : 'bg-black/75 border-white/10 text-white'
          }`}
        >
          {/* Mode Switcher */}
          {rawSrc && (
            <div className={`flex items-center rounded-lg p-0.5 mr-1 ${isLight ? 'bg-slate-100' : 'bg-white/10'}`}>
              <button
                onClick={() => setViewMode('annotated')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  viewMode === 'annotated'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="View image with detected people bounding boxes"
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Detections
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  viewMode === 'raw'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="View original unannotated image"
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
              showGridOverlay
                ? 'bg-indigo-600 text-white'
                : isLight
                ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
            title="Toggle spatial grid lines"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            className={`p-1.5 rounded-lg transition-all ${
              isLight
                ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            className={`p-1.5 rounded-lg transition-all ${
              isLight
                ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Reset Zoom */}
          {zoom !== 1 && (
            <button
              onClick={handleResetZoom}
              className={`p-1.5 rounded-lg transition-all ${
                isLight
                  ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title="Reset Zoom (100%)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Download */}
          <button
            onClick={handleDownload}
            className={`p-1.5 rounded-lg transition-all ${
              isLight
                ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
            title="Download annotated image"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className={`p-1.5 rounded-lg transition-all ${
              isLight
                ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className={`relative flex-1 overflow-auto flex items-center justify-center p-2 select-none ${
        isLight ? 'bg-slate-950' : 'bg-black/95'
      }`}>
        {currentSrc ? (
          <div
            className="relative transition-transform duration-200 origin-center max-w-full max-h-full"
            style={{ transform: `scale(${zoom})` }}
          >
            <img
              src={currentSrc}
              alt="Crowd Detection Frame"
              className="rounded-lg shadow-2xl object-contain max-h-[460px] w-auto max-w-full"
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
            <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-3 ${
              isLight ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-white/5 border-white/10 text-slate-500'
            }`}>
              <Flame className="w-8 h-8 text-amber-500" />
            </div>
            <p className="text-white font-bold text-sm">No Image Uploaded Yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Upload an image below to detect and accurately count every person in the scene with YOLOv8.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Telemetry Bar */}
      <div
        className={`h-9 px-4 backdrop-blur-md border-t flex items-center justify-between text-[11px] font-mono ${
          isLight
            ? 'bg-slate-100/90 border-slate-200 text-slate-600'
            : 'bg-black/80 border-white/5 text-slate-400'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
            <Sparkles className="w-3 h-3" />
            Gujarat Police Netram Vision
          </span>
          <span>•</span>
          <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
          <span>•</span>
          <span>Mode: {viewMode === 'annotated' ? 'YOLOv8 Detection Boxes' : 'Raw Visual'}</span>
        </div>
        <div>
          <span className={isLight ? 'text-slate-500 font-semibold' : 'text-slate-400'}>
            Person Detection Engine Active
          </span>
        </div>
      </div>
    </div>
  );
}

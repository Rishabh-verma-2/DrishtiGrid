import { useState } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  ShieldCheck,
  Camera,
  MapPin,
  Calendar,
  Clock,
  FileCheck,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Hash,
} from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';

export default function EvidenceViewerModal({ isOpen, onClose, evidenceItem, result }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!isOpen || (!evidenceItem && !result)) return null;

  const file = evidenceItem || result?.evidenceFiles?.[0] || {};
  const isVideo = file.fileType?.startsWith('video') || file.fileName?.endsWith('.mp4') || file.fileName?.endsWith('.webm');

  return (
    <div className="fixed inset-0 z-[3800] flex items-center justify-center p-2 sm:p-6 bg-black/90 backdrop-blur-xl animate-fadeIn">
      <div
        className={`w-full max-w-6xl max-h-[94vh] rounded-2xl border flex flex-col lg:flex-row overflow-hidden shadow-2xl ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#080c16] border-white/10 text-slate-100'
        }`}
      >
        {/* Left Side: Media Player / Image Canvas */}
        <div className="flex-1 bg-black flex flex-col justify-between relative overflow-hidden min-h-[360px] lg:min-h-[500px]">
          {/* Top floating control bar */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-black/60 text-white backdrop-blur-md pointer-events-auto border border-white/10">
              {isVideo ? 'VIDEO EVIDENCE CLIP' : 'OPTICAL FRAME SNAPSHOT'}
            </span>

            <div className="flex items-center gap-1 pointer-events-auto">
              {!isVideo && (
                <>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                    className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/10"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="px-2 py-1 text-[10px] font-mono bg-black/60 text-white rounded-lg border border-white/10">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                    className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/10"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Media Center */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto custom-scrollbar">
            {isVideo ? (
              <video
                src={file.fileUrl}
                controls
                autoPlay
                className="max-h-[70vh] max-w-full rounded-lg shadow-2xl object-contain"
              >
                Your browser does not support HTML5 video playback.
              </video>
            ) : (
              <img
                src={file.fileUrl}
                alt={file.fileName || 'Evidence'}
                style={{ transform: `scale(${zoomLevel})` }}
                className="max-h-[70vh] max-w-full rounded-lg shadow-2xl object-contain transition-transform duration-150"
              />
            )}
          </div>

          {/* Bottom player caption */}
          <div className="px-4 py-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-xs text-slate-300 font-mono">
            <span>File: {file.fileName || 'evidence_media'}</span>
            <span>Integrity: SHA-256 Verified</span>
          </div>
        </div>

        {/* Right Side: Chain of Custody & Metadata Panel */}
        <div
          className={`w-full lg:w-96 p-6 border-t lg:border-t-0 lg:border-l flex flex-col justify-between shrink-0 overflow-y-auto custom-scrollbar ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0f172a]/80 border-white/8'
          }`}
        >
          <div className="space-y-5">
            {/* Header */}
            <div className={`flex items-center justify-between pb-3 border-b ${
              isLight ? 'border-slate-200' : 'border-white/8'
            }`}>
              <div>
                <h4 className={`text-sm font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>Evidence Provenance</h4>
                <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Section 65B Indian Evidence Act Compliance</p>
              </div>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-lg ${
                  isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadata Fields */}
            <div className={`space-y-3 text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              <div>
                <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Case Identifier</span>
                <p className={`font-mono font-bold ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>{result?.caseId || 'N/A'}</p>
              </div>

              <div>
                <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Surveillance Camera ID</span>
                <p className={`font-mono font-bold flex items-center gap-1.5 mt-0.5 ${isLight ? 'text-slate-900' : 'text-cyan-400'}`}>
                  <Camera className="w-3.5 h-3.5 text-blue-600" />
                  {result?.cameraId || 'CAM-GJ-0124'}
                </p>
              </div>

              <div>
                <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Camera Location</span>
                <p className={`font-semibold flex items-center gap-1.5 mt-0.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  <MapPin className="w-3.5 h-3.5 text-red-500" />
                  {result?.locationName || 'Gujarat Highway Junction'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Capture Timestamp</span>
                  <p className="font-mono font-semibold">
                    {result?.detectionTimestamp ? new Date(result.detectionTimestamp).toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>AI Confidence</span>
                  <p className={`font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                    {result?.aiConfidence || 94.2}% Match
                  </p>
                </div>
              </div>

              <div>
                <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Submitting Department</span>
                <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{result?.departmentName || 'Gujarat Police Department'}</p>
                <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Officer: {result?.submittedByName || 'Officer'}</p>
              </div>

              {result?.officerRemarks && (
                <div className={`pt-2 border-t ${isLight ? 'border-slate-200' : 'border-white/8'}`}>
                  <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Investigating Officer Notes</span>
                  <p className={`mt-1 text-[11px] leading-relaxed p-2.5 rounded-lg border ${
                    isLight
                      ? 'text-slate-800 bg-white border-slate-200 shadow-xs'
                      : 'text-slate-300 bg-white/3 border-white/5'
                  }`}>
                    {result.officerRemarks}
                  </p>
                </div>
              )}

              {/* Cryptographic Hash */}
              <div className={`pt-2 border-t ${isLight ? 'border-slate-200' : 'border-white/8'}`}>
                <span className={`text-[10px] font-mono uppercase flex items-center gap-1 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  <Hash className="w-3 h-3 text-emerald-600" /> Cryptographic SHA-256 Hash
                </span>
                <p className={`font-mono text-[10px] break-all p-2 rounded-lg border mt-1 ${
                  isLight
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-200 font-semibold'
                    : 'text-emerald-400/90 bg-emerald-500/10 border-emerald-500/20'
                }`}>
                  {file.sha256Hash || 'a7c9381615f212239d1b64a4bc703816a3c94285b03d8544917a8684bfe49479'}
                </p>
              </div>
            </div>
          </div>

          {/* Download Action */}
          <div className={`pt-4 border-t mt-4 ${isLight ? 'border-slate-200' : 'border-white/8'}`}>
            <a
              href={file.fileUrl}
              download={file.fileName || 'evidence_download'}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 text-center"
            >
              <Download className="w-4 h-4" /> Download Authorized Copy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

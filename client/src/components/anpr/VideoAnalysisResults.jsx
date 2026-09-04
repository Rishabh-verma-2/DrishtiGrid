import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useThemeStore } from '../../store/themeStore';
import { anprAPI } from '../../api';
import {
  Video, ShieldAlert, CheckCircle2, AlertTriangle, Eye,
  ExternalLink, Download, Clock, MapPin, Search, Filter,
  Car, Trash2, X, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function VideoAnalysisResults({
  jobId,
  videoId,
  sourceVideoUrl,
  onReset,
  onViewAlert,
}) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const [selectedCropModal, setSelectedCropModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [colorFilter, setColorFilter] = useState('ALL');
  const [matchFilter, setMatchFilter] = useState('ALL');
  const [selectedSecond, setSelectedSecond] = useState(null);

  const videoRef = useRef(null);

  // Fetch detections for this video
  const {
    data: detectionsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['video-detections', videoId],
    queryFn: () => anprAPI.getVideoDetections(videoId).then((r) => r.data?.detections || []),
    enabled: !!videoId,
  });

  const detections = detectionsData || [];

  // Jump video player to specific second
  const handleSeekTo = (second) => {
    if (videoRef.current && second != null) {
      videoRef.current.currentTime = Math.max(0, second - 0.5);
      videoRef.current.play().catch(() => {});
      setSelectedSecond(second);
    }
  };

  // Filter detections
  const filtered = detections.filter((d) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!d.plate_number?.toLowerCase().includes(q) && !d.raw_ocr?.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (colorFilter !== 'ALL' && d.car_color !== colorFilter) {
      return false;
    }
    if (matchFilter !== 'ALL' && d.match_status !== matchFilter) {
      return false;
    }
    return true;
  });

  // Calculate summary metrics
  const totalVehicles = detections.length;
  const matchCount = detections.filter(
    (d) => d.match_status === 'MATCH_FOUND' || d.match_status === 'POSSIBLE_MATCH'
  ).length;
  const cleanedCount = detections.filter((d) => d.image_deleted).length;
  const retainedCount = detections.filter((d) => !d.image_deleted && d.cropped_image_url).length;

  const exportCSV = () => {
    if (detections.length === 0) return toast.error('No detections to export.');
    const headers = [
      'Plate Number',
      'Raw OCR',
      'Vehicle Color',
      'Vehicle Type',
      'First Seen (sec)',
      'Last Seen (sec)',
      'Occurrences',
      'Match Status',
      'Confidence',
      'Timestamp',
      'Location Address',
    ];
    const rows = detections.map((d) => [
      `"${d.plate_number || ''}"`,
      `"${d.raw_ocr || ''}"`,
      `"${d.car_color || 'N/A'}"`,
      `"${d.vehicle_type || 'car'}"`,
      d.first_seen_second || d.frame_second || 0,
      d.last_seen_second || d.frame_second || 0,
      d.occurrence_count || 1,
      d.match_status || 'NO_MATCH',
      Math.round((d.overall_confidence || 0) * 100) + '%',
      `"${d.timestamp || ''}"`,
      `"${d.location_address || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `anpr_video_${videoId}_detections.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Detections exported to CSV.');
  };

  const getColorHex = (colorName) => {
    if (!colorName) return '#64748b';
    const c = colorName.toLowerCase();
    if (c.includes('white')) return '#ffffff';
    if (c.includes('black')) return '#0f172a';
    if (c.includes('silver') || c.includes('gray')) return '#94a3b8';
    if (c.includes('red')) return '#ef4444';
    if (c.includes('blue')) return '#3b82f6';
    if (c.includes('green')) return '#22c55e';
    if (c.includes('yellow')) return '#eab308';
    if (c.includes('orange')) return '#f97316';
    if (c.includes('brown')) return '#854d0e';
    return '#64748b';
  };

  return (
    <div className="space-y-6">
      
      {/* ─── Top Header & Summary KPI Strip ─── */}
      <div className={`p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/10'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <h3 className={`text-base font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Video Analysis Report ({videoId})
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deduplicated vehicle tracks extracted at 1 frame per second. Automated privacy protocol active.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* KPI 1 */}
          <div className={`px-3 py-1.5 rounded-xl border text-center ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'
          }`}>
            <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Vehicles</span>
            <span className="text-sm font-black text-blue-400">{totalVehicles}</span>
          </div>

          {/* KPI 2 */}
          <div className={`px-3 py-1.5 rounded-xl border text-center ${
            isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20'
          }`}>
            <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Matches</span>
            <span className={`text-sm font-black ${matchCount > 0 ? 'text-red-400' : 'text-slate-300'}`}>
              {matchCount}
            </span>
          </div>

          {/* KPI 3 (Privacy Cleaned) */}
          <div className={`px-3 py-1.5 rounded-xl border text-center ${
            isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'
          }`}>
            <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Privacy Cleaned</span>
            <span className="text-sm font-black text-emerald-400">{cleanedCount} crops</span>
          </div>

          <button
            onClick={exportCSV}
            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all ${
              isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {onReset && (
            <button
              onClick={onReset}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-sm"
            >
              Analyze Another Video
            </button>
          )}
        </div>
      </div>

      {/* ─── Video Player & Keyframe Scrubber ─── */}
      {sourceVideoUrl && (
        <div className={`p-4 rounded-2xl border ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#141929] border-white/10'
        }`}>
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" />
              <span>Playback &amp; Temporal Scrubber</span>
            </span>
            {selectedSecond != null && (
              <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                Current Seek: {selectedSecond}s
              </span>
            )}
          </div>

          <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-80 flex items-center justify-center border border-white/10">
            <video
              ref={videoRef}
              src={sourceVideoUrl}
              controls
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* ─── Filter & Search Ribbon ─── */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#141929] border-white/10'
      }`}>
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search detected plate..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Match status filter */}
          <select
            value={matchFilter}
            onChange={(e) => setMatchFilter(e.target.value)}
            className={`px-3 py-2 text-xs rounded-xl border focus:outline-none ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
            }`}
          >
            <option value="ALL">All Match States</option>
            <option value="MATCH_FOUND">Hotlist Match</option>
            <option value="POSSIBLE_MATCH">Near Match</option>
            <option value="NO_MATCH">No Match</option>
          </select>

          {/* Color filter */}
          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className={`px-3 py-2 text-xs rounded-xl border focus:outline-none ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
            }`}
          >
            <option value="ALL">All Colors</option>
            <option value="White">White</option>
            <option value="Black">Black</option>
            <option value="Silver / Gray">Silver / Gray</option>
            <option value="Red">Red</option>
            <option value="Blue">Blue</option>
            <option value="Green">Green</option>
            <option value="Yellow">Yellow</option>
          </select>
        </div>
      </div>

      {/* ─── Deduplicated Vehicle Tracks Grid / Table ─── */}
      {isLoading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400">Loading extracted vehicle detections...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`p-12 text-center rounded-2xl border ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#141929] border-white/10'
        }`}>
          <Car className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-40" />
          <h4 className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
            No detections match your filter criteria
          </h4>
          <p className="text-xs text-slate-400 mt-1">Try changing or clearing your search filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((det, idx) => {
            const isMatch = det.match_status === 'MATCH_FOUND';
            const isPossible = det.match_status === 'POSSIBLE_MATCH';
            const hex = getColorHex(det.car_color);

            return (
              <div
                key={det._id || det.detectionId || idx}
                className={`rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                  isMatch
                    ? 'border-red-500/40 bg-red-500/5 shadow-md shadow-red-500/5'
                    : isPossible
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : isLight
                    ? 'bg-white border-slate-200 shadow-sm'
                    : 'bg-[#141929] border-white/10'
                }`}
              >
                <div>
                  {/* Top Bar: Plate pill & match badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    {/* Indian Plate Pill */}
                    <div className="inline-flex items-center rounded-lg border-2 border-slate-900 bg-white shadow-sm overflow-hidden text-slate-900">
                      <div className="bg-blue-800 px-1.5 py-1 text-[8px] font-black text-white flex flex-col items-center justify-center leading-none">
                        <span>IND</span>
                      </div>
                      <div className="px-2.5 py-1 font-mono font-black text-sm tracking-wider">
                        {det.plate_number}
                      </div>
                    </div>

                    {/* Match Badge */}
                    {isMatch ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>MATCH FOUND</span>
                      </span>
                    ) : isPossible ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        NEAR MATCH
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-500/10 text-slate-400 border border-white/10">
                        NO MATCH
                      </span>
                    )}
                  </div>

                  {/* Vehicle Attributes: Color swatch & Type */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {det.car_color ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/5 border border-white/10 text-slate-300">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white/30"
                          style={{ backgroundColor: hex }}
                        />
                        <span>{det.car_color}</span>
                      </span>
                    ) : null}

                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {det.vehicle_type || 'car'}
                    </span>

                    <span className="px-2 py-0.5 rounded-md text-[11px] font-mono text-slate-400 bg-white/5 border border-white/10">
                      Conf: {Math.round((det.overall_confidence || 0) * 100)}%
                    </span>
                  </div>

                  {/* Temporal Sighting Window */}
                  <div className={`p-2.5 rounded-xl border text-xs space-y-1 mb-3 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'
                  }`}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Seen in:</span>
                      <span className="font-bold text-slate-200">
                        {det.occurrence_count || 1} frame(s) ({det.first_seen_second || det.frame_second || 0}s - {det.last_seen_second || det.frame_second || 0}s)
                      </span>
                    </div>

                    {det.location_address && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 truncate">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{det.location_address}</span>
                      </div>
                    )}
                  </div>

                  {/* Matched Watchlist Info if match */}
                  {det.matched_record && (
                    <div className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs mb-3 space-y-0.5">
                      <div className="font-bold text-red-300">
                        Category: {det.matched_record.category} ({det.matched_record.priority} Priority)
                      </div>
                      {det.matched_record.description && (
                        <div className="text-[11px] text-red-200/80 line-clamp-2">
                          {det.matched_record.description}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Actions: Jump to video & crop evidence */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleSeekTo(det.first_seen_second || det.frame_second)}
                    className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Seek to {det.first_seen_second || det.frame_second || 0}s</span>
                  </button>

                  {det.cropped_image_url ? (
                    <button
                      type="button"
                      onClick={() => setSelectedCropModal(det.cropped_image_url)}
                      className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Crop</span>
                    </button>
                  ) : det.image_deleted ? (
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                      Purged (Privacy)
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Plate Crop Preview */}
      {selectedCropModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedCropModal(null)}
        >
          <div
            className={`p-4 rounded-2xl max-w-md w-full border shadow-2xl ${
              isLight ? 'bg-white border-slate-300' : 'bg-[#141929] border-white/20'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                License Plate Evidence Crop
              </span>
              <button
                onClick={() => setSelectedCropModal(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-3 bg-black rounded-xl p-2 flex items-center justify-center border border-white/10">
              <img
                src={selectedCropModal}
                alt="License Plate Evidence"
                className="max-h-64 object-contain rounded-lg"
              />
            </div>

            <div className="flex justify-end">
              <a
                href={selectedCropModal}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5"
              >
                <span>Full Resolution</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

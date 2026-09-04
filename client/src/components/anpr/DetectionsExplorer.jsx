import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useThemeStore } from '../../store/themeStore';
import { anprAPI } from '../../api';
import {
  Search, Filter, Car, Clock, MapPin, Eye, ExternalLink,
  Download, RefreshCw, AlertTriangle, CheckCircle2, Shield, X
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function DetectionsExplorer() {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const [activeSubTab, setActiveSubTab] = useState('ALL_EVENTS'); // 'ALL_EVENTS' or 'STORED_REGISTRY'
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [selectedCropModal, setSelectedCropModal] = useState(null);

  // 1. Fetch Detections (Event occurrences)
  const {
    data: detectionsData,
    isLoading: detectionsLoading,
    refetch: refetchDetections,
  } = useQuery({
    queryKey: ['anpr-detections', search, colorFilter, typeFilter, statusFilter, page],
    queryFn: () =>
      anprAPI
        .getDetections({
          plate_number: search || undefined,
          car_color: colorFilter !== 'ALL' ? colorFilter : undefined,
          vehicle_type: typeFilter !== 'ALL' ? typeFilter : undefined,
          match_status: statusFilter !== 'ALL' ? statusFilter : undefined,
          page,
          limit: 30,
        })
        .then((r) => r.data || {}),
    enabled: activeSubTab === 'ALL_EVENTS',
  });

  // 2. Fetch Stored Plates Registry (Unique vehicles aggregated)
  const {
    data: storedPlatesData,
    isLoading: storedLoading,
    refetch: refetchStored,
  } = useQuery({
    queryKey: ['anpr-stored-plates', search, colorFilter, statusFilter],
    queryFn: () =>
      anprAPI
        .getStoredPlates({
          search: search || undefined,
          car_color: colorFilter !== 'ALL' ? colorFilter : undefined,
          match_status: statusFilter !== 'ALL' ? statusFilter : undefined,
          limit: 100,
        })
        .then((r) => r.data?.plates || []),
    enabled: activeSubTab === 'STORED_REGISTRY',
  });

  const detections = detectionsData?.detections || [];
  const totalDetections = detectionsData?.total || 0;
  const storedPlates = storedPlatesData || [];

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
    return '#64748b';
  };

  const exportCSV = () => {
    const list = activeSubTab === 'ALL_EVENTS' ? detections : storedPlates;
    if (!list || list.length === 0) return toast.error('No detections to export.');

    const headers = [
      'Plate Number',
      'Raw OCR',
      'Vehicle Color',
      'Vehicle Type',
      'Match Status',
      'Occurrence Count',
      'Timestamp',
      'Location Address',
    ];
    const rows = list.map((d) => [
      `"${d.plate_number || ''}"`,
      `"${d.raw_ocr || ''}"`,
      `"${d.car_color || 'N/A'}"`,
      `"${d.vehicle_type || 'car'}"`,
      d.match_status || 'NO_MATCH',
      d.occurrence_count || 1,
      `"${d.timestamp || ''}"`,
      `"${d.location_address || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `drishti_anpr_detections_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Detections exported to CSV.');
  };

  return (
    <div className="space-y-6">
      
      {/* ─── Header & Sub-Tab Switcher ─── */}
      <div className={`p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/10'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Car className="w-5 h-5" />
            </span>
            <h3 className={`text-base font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Historical Detections &amp; Plate Registry
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Browse all vehicle sightings captured across CCTV video streams and surveillance image scans.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sub-tab switcher */}
          <div className={`p-1 rounded-xl border flex items-center ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#0f1420] border-white/10'
          }`}>
            <button
              onClick={() => setActiveSubTab('ALL_EVENTS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'ALL_EVENTS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Frame Sightings
            </button>
            <button
              onClick={() => setActiveSubTab('STORED_REGISTRY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'STORED_REGISTRY'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Unique Plate Registry
            </button>
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
        </div>
      </div>

      {/* ─── Filters Ribbon ─── */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#141929] border-white/10'
      }`}>
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search plate number (e.g. GJ01AB)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
            }`}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Match Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-3 py-2 text-xs rounded-xl border focus:outline-none ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
            }`}
          >
            <option value="ALL">All Match States</option>
            <option value="MATCH_FOUND">Hotlist Match</option>
            <option value="POSSIBLE_MATCH">Near Match</option>
            <option value="NO_MATCH">No Match</option>
          </select>

          {/* Vehicle Color */}
          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className={`px-3 py-2 text-xs rounded-xl border focus:outline-none ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
            }`}
          >
            <option value="ALL">All Vehicle Colors</option>
            <option value="White">White</option>
            <option value="Black">Black</option>
            <option value="Silver / Gray">Silver / Gray</option>
            <option value="Red">Red</option>
            <option value="Blue">Blue</option>
            <option value="Green">Green</option>
            <option value="Yellow">Yellow</option>
          </select>

          {/* Vehicle Type */}
          {activeSubTab === 'ALL_EVENTS' && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`px-3 py-2 text-xs rounded-xl border focus:outline-none ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
              }`}
            >
              <option value="ALL">All Vehicle Types</option>
              <option value="car">Car</option>
              <option value="motorcycle">Motorcycle</option>
              <option value="bus">Bus</option>
              <option value="truck">Truck</option>
            </select>
          )}

          <button
            onClick={() => {
              setSearch('');
              setColorFilter('ALL');
              setTypeFilter('ALL');
              setStatusFilter('ALL');
            }}
            className={`px-3 py-2 text-xs font-bold rounded-xl border ${
              isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            Reset
          </button>
        </div>
      </div>

      {/* ─── Detections Table / Cards ─── */}
      <div className={`rounded-2xl border overflow-hidden ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#141929] border-white/10'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b text-[10px] font-extrabold uppercase tracking-wider ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-white/5 border-white/10 text-slate-400'
            }`}>
              <tr>
                <th className="py-3 px-4">License Plate</th>
                <th className="py-3 px-4">Vehicle Attributes</th>
                <th className="py-3 px-4">Match Status</th>
                <th className="py-3 px-4">Sighting Info</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4 text-right">Evidence Crop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(activeSubTab === 'ALL_EVENTS' ? detectionsLoading : storedLoading) ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    <span>Loading intelligence records...</span>
                  </td>
                </tr>
              ) : (activeSubTab === 'ALL_EVENTS' ? detections : storedPlates).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Car className="w-10 h-10 opacity-30 mx-auto mb-2" />
                    <span>No detections found matching current filters.</span>
                  </td>
                </tr>
              ) : (
                (activeSubTab === 'ALL_EVENTS' ? detections : storedPlates).map((item, idx) => {
                  const isMatch = item.match_status === 'MATCH_FOUND';
                  const isPossible = item.match_status === 'POSSIBLE_MATCH';
                  const hex = getColorHex(item.car_color);

                  return (
                    <tr
                      key={item._id || item.detectionId || idx}
                      className={`hover:bg-white/3 transition-colors ${
                        isMatch ? 'bg-red-500/5' : ''
                      }`}
                    >
                      {/* Plate number */}
                      <td className="py-3 px-4 font-mono font-black">
                        <div className="inline-flex items-center rounded-md border border-slate-800 bg-white text-slate-900 overflow-hidden shadow-xs">
                          <span className="bg-blue-800 px-1 py-0.5 text-[7px] font-black text-white">IND</span>
                          <span className="px-2 py-0.5 text-xs">{item.plate_number}</span>
                        </div>
                        {item.raw_ocr && item.raw_ocr !== item.plate_number && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            OCR: {item.raw_ocr}
                          </div>
                        )}
                      </td>

                      {/* Vehicle Attributes */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.car_color ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white/5 border border-white/10 text-slate-300">
                              <span
                                className="w-2 h-2 rounded-full border border-white/30 shrink-0"
                                style={{ backgroundColor: hex }}
                              />
                              <span>{item.car_color}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Color: N/A</span>
                          )}

                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {item.vehicle_type || 'car'}
                          </span>
                        </div>
                      </td>

                      {/* Match Status */}
                      <td className="py-3 px-4">
                        {isMatch ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>MATCH FOUND</span>
                          </span>
                        ) : isPossible ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            NEAR MATCH
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-500/10 text-slate-400 border border-white/10">
                            NO MATCH
                          </span>
                        )}
                      </td>

                      {/* Sighting Info */}
                      <td className="py-3 px-4">
                        <div className="text-[11px] space-y-0.5">
                          <div className="flex items-center gap-1 text-slate-300">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{new Date(item.timestamp || item.createdAt).toLocaleString()}</span>
                          </div>
                          {item.location_address && (
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 truncate max-w-xs">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{item.location_address}</span>
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.source_type} {item.first_seen_second != null ? `(Sec ${item.first_seen_second}s-${item.last_seen_second}s)` : ''}
                          </div>
                        </div>
                      </td>

                      {/* Confidence */}
                      <td className="py-3 px-4 font-mono">
                        <span className="font-bold text-slate-200">
                          {Math.round((item.overall_confidence || 0.9) * 100)}%
                        </span>
                      </td>

                      {/* Actions / Evidence Crop */}
                      <td className="py-3 px-4 text-right">
                        {item.cropped_image_url ? (
                          <button
                            type="button"
                            onClick={() => setSelectedCropModal(item.cropped_image_url)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs font-bold inline-flex items-center gap-1 border border-blue-500/30"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Crop</span>
                          </button>
                        ) : item.image_deleted ? (
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                            Cleaned (Privacy)
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">No image</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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

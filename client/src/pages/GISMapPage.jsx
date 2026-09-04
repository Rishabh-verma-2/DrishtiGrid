import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet';
import { cameraAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import CameraClusterLayer from '../components/map/CameraClusterLayer';
import CameraStreamModal from '../components/cameras/CameraStreamModal';
import {
  Search,
  MapPin,
  Camera,
  RotateCcw,
  Layers,
  Video,
  X,
  Compass,
  Building,
  Radio,
} from 'lucide-react';

const STATUS_COLOR = {
  online:      { fill: '#10b981', label: 'Online',      tw: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  offline:     { fill: '#ef4444', label: 'Offline',     tw: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  maintenance: { fill: '#f59e0b', label: 'Maintenance', tw: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  fault:       { fill: '#f87171', label: 'Fault',       tw: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
};

export default function GISMapPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [streamCamera, setStreamCamera] = useState(null);

  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ['cameras', 'gis-all'],
    queryFn: () => cameraAPI.getAll({ limit: 1000 }).then((r) => r.data.data || []),
    staleTime: 60000,
  });

  const districts = useMemo(() => {
    const list = new Set(cameras.map((c) => c.district).filter(Boolean));
    return ['all', ...Array.from(list).sort()];
  }, [cameras]);

  const cameraTypes = useMemo(() => {
    const list = new Set(cameras.map((c) => c.type || c.cameraType).filter(Boolean));
    return ['all', ...Array.from(list).sort()];
  }, [cameras]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cameras.filter((c) => {
      const matchStatus = statusFilter === 'all' || (c.status || '').toLowerCase() === statusFilter.toLowerCase();
      const matchDistrict = districtFilter === 'all' || c.district === districtFilter;
      const camType = c.type || c.cameraType;
      const matchType = typeFilter === 'all' || camType === typeFilter;

      const matchSearch =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.cameraName?.toLowerCase().includes(q) ||
        c.cameraId?.toLowerCase().includes(q) ||
        c.locationName?.toLowerCase().includes(q) ||
        c.landmark?.toLowerCase().includes(q) ||
        c.roadName?.toLowerCase().includes(q) ||
        c.taluka?.toLowerCase().includes(q) ||
        c.district?.toLowerCase().includes(q) ||
        c.address?.full?.toLowerCase().includes(q) ||
        c.address?.street?.toLowerCase().includes(q) ||
        c.camera_model?.toLowerCase().includes(q);

      const hasCoords =
        (c.latitude && c.longitude) ||
        (Array.isArray(c.location?.coordinates) && c.location.coordinates.length === 2);

      return matchStatus && matchDistrict && matchType && matchSearch && hasCoords;
    });
  }, [cameras, statusFilter, districtFilter, typeFilter, search]);

  const counts = useMemo(() => ({
    total:       cameras.length,
    online:      cameras.filter((c) => (c.status || '').toLowerCase() === 'online').length,
    offline:     cameras.filter((c) => (c.status || '').toLowerCase() === 'offline').length,
    maintenance: cameras.filter((c) => (c.status || '').toLowerCase() === 'maintenance').length,
  }), [cameras]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDistrictFilter('all');
    setTypeFilter('all');
  };

  const isFiltered = search || statusFilter !== 'all' || districtFilter !== 'all' || typeFilter !== 'all';

  const legendCounts = useMemo(() => {
    const list = isFiltered ? filtered : cameras;
    return {
      total:       list.length,
      online:      list.filter((c) => (c.status || '').toLowerCase() === 'online').length,
      offline:     list.filter((c) => (c.status || '').toLowerCase() === 'offline').length,
      maintenance: list.filter((c) => (c.status || '').toLowerCase() === 'maintenance').length,
    };
  }, [cameras, filtered, isFiltered]);

  return (
    <div className={`flex flex-col h-full ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#0a0d14] text-slate-100'}`}>
      {/* Top Header & Toolbar */}
      <div
        className={`px-4 lg:px-6 py-3 border-b shrink-0 flex flex-wrap items-center justify-between gap-3 transition-colors ${
          isLight
            ? 'bg-white/95 border-slate-200 shadow-xs backdrop-blur-md'
            : 'bg-[#0e1322]/90 border-white/5 backdrop-blur-md'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
              isLight
                ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-xs'
                : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
            }`}
          >
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-sm font-bold tracking-wide ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Gujarat State GIS Surveillance Grid
              </h1>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  isLight
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}
              >
                {counts.total} TOTAL CAMS
              </span>
            </div>
            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Interactive Geospatial Cluster Network • Auto-clustering & High-Accuracy Placement
            </p>
          </div>
        </div>

        {/* Live Counters */}
        <div
          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs border ${
            isLight
              ? 'bg-slate-50 border-slate-200 shadow-xs'
              : 'bg-white/3 border-white/6'
          }`}
        >
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            {counts.online} Online
          </span>
          <span className={isLight ? 'text-slate-300' : 'text-slate-600'}>|</span>
          <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            {counts.offline} Offline
          </span>
          <span className={isLight ? 'text-slate-300' : 'text-slate-600'}>|</span>
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
            <span className="w-2 h-2 bg-amber-500 rounded-full" />
            {counts.maintenance} Maint.
          </span>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, name, road, taluka..."
              className={`border rounded-lg text-xs pl-8 pr-8 py-2 outline-none w-52 transition-all ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs'
                  : 'bg-white/4 border-white/8 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 focus:bg-cyan-500/5'
              }`}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`border rounded-lg text-xs px-3 py-2 outline-none transition-all cursor-pointer ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800 focus:border-blue-500 shadow-xs'
                : 'bg-white/4 border-white/8 text-slate-300 focus:border-cyan-500/50'
            }`}
          >
            <option value="all">All Status</option>
            <option value="online">Online Only</option>
            <option value="offline">Offline Only</option>
            <option value="maintenance">Maintenance</option>
          </select>

          {/* Camera Type Dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`border rounded-lg text-xs px-3 py-2 outline-none transition-all cursor-pointer ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800 focus:border-blue-500 shadow-xs'
                : 'bg-white/4 border-white/8 text-slate-300 focus:border-cyan-500/50'
            }`}
          >
            <option value="all">All Types</option>
            {cameraTypes
              .filter((t) => t !== 'all')
              .map((t) => (
                <option key={t} value={t}>
                  {t} Camera
                </option>
              ))}
          </select>

          {/* District Dropdown */}
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className={`border rounded-lg text-xs px-3 py-2 outline-none transition-all max-w-[150px] cursor-pointer ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800 focus:border-blue-500 shadow-xs'
                : 'bg-white/4 border-white/8 text-slate-300 focus:border-cyan-500/50'
            }`}
          >
            {districts.map((d) => (
              <option key={d} value={d}>
                {d === 'all' ? 'All Districts' : d}
              </option>
            ))}
          </select>

          {isFiltered && (
            <button
              onClick={resetFilters}
              title="Reset all filters"
              className={`p-2 border rounded-lg transition-all ${
                isLight
                  ? 'text-slate-500 hover:text-blue-600 bg-white hover:bg-slate-50 border-slate-200 shadow-xs'
                  : 'text-slate-400 hover:text-cyan-400 bg-white/4 hover:bg-cyan-500/10 border-white/8'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <div
            className={`text-[11px] font-mono px-2.5 py-1.5 rounded-lg border font-semibold ${
              isLight
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-cyan-500/5 border-cyan-500/15 text-cyan-400/80'
            }`}
          >
            Showing <strong className={isLight ? 'text-blue-900' : 'text-cyan-300'}>{filtered.length}</strong> units
          </div>
        </div>
      </div>

      {/* Main Map Container */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-[2000] backdrop-blur-sm">
            <div className={`flex flex-col items-center gap-3 p-6 rounded-2xl border shadow-2xl ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#141929] border-white/10 text-slate-200'}`}>
              <div className="w-10 h-10 border-3 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm font-bold">Loading Gujarat Surveillance Network</p>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Fetching 500 CCTV units and GIS coordinates...</p>
              </div>
            </div>
          </div>
        )}

        <MapContainer
          center={[22.4, 71.9]}
          zoom={7}
          maxZoom={19}
          minZoom={6}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* High-Performance Clustering Layer with Only One Above-Marker Popup */}
          <CameraClusterLayer
            cameras={filtered}
            onOpenStream={(cam) => setStreamCamera(cam)}
            onRequestFootage={(cam) => navigate(`/footage-requests?requestCam=${cam.cameraId}`)}
          />
        </MapContainer>

        {/* Legend Box - Adaptive Light and Dark with Live Unit Counts */}
        <div
          className={`absolute bottom-6 left-5 z-[1000] backdrop-blur-md border rounded-2xl p-3.5 space-y-2.5 min-w-[215px] transition-colors ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-800 shadow-xl'
              : 'bg-[#0d121f]/95 border-white/10 text-slate-100 shadow-2xl'
          }`}
        >
          <div
            className={`flex items-center justify-between pb-2 border-b text-[11px] font-bold uppercase tracking-wider ${
              isLight ? 'border-slate-200 text-slate-700' : 'border-white/8 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Layers className={`w-3.5 h-3.5 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
              Map Legend
            </div>
            <span
              className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                isLight ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-white/5 text-slate-400 border border-white/8'
              }`}
            >
              {legendCounts.total} Total
            </span>
          </div>

          <div className="space-y-2 text-[11px]">
            {/* Online Units */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                <span className={isLight ? 'text-slate-700 font-medium' : 'text-slate-300'}>Online Units</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                  isLight
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                }`}
              >
                {legendCounts.online}
              </span>
            </div>

            {/* Offline Units */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                <span className={isLight ? 'text-slate-700 font-medium' : 'text-slate-300'}>Offline Units</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                  isLight
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-red-500/15 text-red-400 border border-red-500/25'
                }`}
              >
                {legendCounts.offline}
              </span>
            </div>

            {/* Maintenance Units */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                <span className={isLight ? 'text-slate-700 font-medium' : 'text-slate-300'}>Maintenance</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                  isLight
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                }`}
              >
                {legendCounts.maintenance}
              </span>
            </div>
          </div>

          <div className={`pt-2 border-t ${isLight ? 'border-slate-200' : 'border-white/8'}`}>
            <p className={`text-[10px] uppercase font-bold tracking-wider mb-1.5 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              Cluster Status
            </p>
            <div className={`flex items-center gap-2 text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 ${
                  isLight ? 'bg-blue-600 border border-blue-400' : 'bg-cyan-600/60 border border-cyan-400'
                }`}
              >
                #
              </div>
              <span>Click cluster to auto-zoom & split</span>
            </div>
          </div>
        </div>

        {/* Live CCTV Stream Player Modal */}
        {streamCamera && (
          <CameraStreamModal
            camera={streamCamera}
            onClose={() => setStreamCamera(null)}
          />
        )}
      </div>
    </div>
  );
}


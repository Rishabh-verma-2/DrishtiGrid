import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, ZoomControl, Polygon, useMap, useMapEvents } from 'react-leaflet';
import { cameraAPI, departmentAPI, reportAPI } from '../api';
import toast from 'react-hot-toast';
import { useThemeStore } from '../store/themeStore';
import CameraClusterLayer from '../components/map/CameraClusterLayer';
import CameraStreamModal from '../components/cameras/CameraStreamModal';
import ReportToDeptModal from '../components/cameras/ReportToDeptModal';
import UnifiedSearchBar from '../components/gis/UnifiedSearchBar';
import GISStatsDrawer from '../components/gis/GISStatsDrawer';
import CoverageGapModal from '../components/gis/CoverageGapModal';
import SendReportModal from '../components/gis/SendReportModal';
import FilterDropdown from '../components/gis/FilterDropdown';
import {
  OFFICIAL_DISTRICTS,
  getOfficialAreaFeature,
  getOfficialBorderPositions,
  getOfficialInvertedMask,
  getOfficialAreaBounds,
  isCameraInOfficialArea,
  getOfficialAreaCameras,
} from '../utils/geoUtils';
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
  ShieldAlert,
  Sliders,
  Send,
  Activity,
  FileText,
  Shield,
  Eye,
  CircleDot,
  Cctv,
  Map,
  Users,
} from 'lucide-react';

const STATUS_COLOR = {
  online:      { fill: '#10b981', label: 'Online',      tw: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  offline:     { fill: '#ef4444', label: 'Offline',     tw: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  maintenance: { fill: '#f59e0b', label: 'Maintenance', tw: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  fault:       { fill: '#f87171', label: 'Fault',       tw: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
};

/**
 * Helper component inside MapContainer to programmatically fly or fit bounds
 */
function MapController({ targetBounds, flyTarget }) {
  const map = useMap();

  useEffect(() => {
    if (targetBounds) {
      map.fitBounds(targetBounds, { padding: [50, 50], maxZoom: 13, animate: true });
    }
  }, [map, targetBounds]);

  useEffect(() => {
    if (flyTarget) {
      map.flyTo(flyTarget, 17, { duration: 1.2 });
    }
  }, [map, flyTarget]);

  return null;
}

/**
 * Captures background map clicks to clear selection
 */
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      const target = e.originalEvent?.target;
      if (
        target?.classList?.contains('leaflet-container') ||
        target?.tagName === 'path' ||
        target?.classList?.contains('leaflet-tile')
      ) {
        onMapClick();
      }
    },
  });
  return null;
}

export default function GISMapPage() {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  // Interactive Highlighting & Selection State
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [mapFlyTarget, setMapFlyTarget] = useState(null);
  const [mapTargetBounds, setMapTargetBounds] = useState(null);

  // Modals & Panels State
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isCoverageModalOpen, setIsCoverageModalOpen] = useState(false);
  const [isSendReportModalOpen, setIsSendReportModalOpen] = useState(false);
  const [reportModalContext, setReportModalContext] = useState({});
  const [streamCamera, setStreamCamera] = useState(null);
  const [showCoverageLayer, setShowCoverageLayer] = useState(false);
  const [isDeptReportOpen, setIsDeptReportOpen] = useState(false);
  const [deptReportCamera, setDeptReportCamera] = useState(null);
  const [isGeneratingAudit, setIsGeneratingAudit] = useState(false);

  // Fetch cameras
  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ['cameras', 'gis-all'],
    queryFn: () => cameraAPI.getAll({ limit: 0 }).then((r) => r.data.data || []),
    staleTime: 60000,
  });

  // Fetch departments
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentAPI.getAll().then((r) => r.data.data || []),
    staleTime: 120000,
  });

  const districts = useMemo(() => {
    return ['all', 'Gujarat', ...OFFICIAL_DISTRICTS];
  }, []);

  const cameraTypes = useMemo(() => {
    const list = new Set(cameras.map((c) => c.type || c.cameraType).filter(Boolean));
    return ['all', ...Array.from(list).sort()];
  }, [cameras]);

  // Helper to resolve camera to its canonical department code based on metadata
  const getCameraDeptCode = (c) => {
    if (c.departmentCode && ['POLICE', 'TRAFFIC', 'HOME_DEPT', 'SMART_CITY', 'MUNICIPAL'].includes(c.departmentCode)) {
      return c.departmentCode;
    }
    const name = (c.departmentName || c.department || '').toLowerCase();
    if (name.includes('traffic')) return 'TRAFFIC';
    if (name.includes('police')) return 'POLICE';
    if (name.includes('home')) return 'HOME_DEPT';
    if (name.includes('smart city') || name.includes('smartcity')) return 'SMART_CITY';
    if (
      name.includes('municipal') ||
      name.includes('corporation') ||
      name.includes('amc') ||
      name.includes('smc') ||
      name.includes('vmc') ||
      name.includes('rmc')
    ) {
      return 'MUNICIPAL';
    }
    return 'POLICE';
  };

  const departmentOptions = useMemo(() => {
    const counts = {
      all: cameras.length,
      POLICE: 0,
      TRAFFIC: 0,
      HOME_DEPT: 0,
      SMART_CITY: 0,
      MUNICIPAL: 0,
    };

    cameras.forEach((c) => {
      const code = getCameraDeptCode(c);
      if (counts[code] !== undefined) {
        counts[code]++;
      }
    });

    return [
      { code: 'all',        label: 'All Departments',          badge: counts.all },
      { code: 'POLICE',     label: 'Gujarat Police',           badge: counts.POLICE },
      { code: 'TRAFFIC',    label: 'Gujarat Traffic Police',   badge: counts.TRAFFIC },
      { code: 'HOME_DEPT',  label: 'Gujarat Home Department',  badge: counts.HOME_DEPT },
      { code: 'SMART_CITY', label: 'Smart City Mission',       badge: counts.SMART_CITY },
      { code: 'MUNICIPAL',  label: 'Municipal Corporation',    badge: counts.MUNICIPAL },
    ];
  }, [cameras]);

  // Filter cameras based on multi-dimensional criteria & live search
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return cameras.filter((c) => {
      const matchStatus = statusFilter === 'all' || (c.status || '').toLowerCase() === statusFilter.toLowerCase();
      const matchDistrict =
        districtFilter === 'all' ||
        districtFilter === 'Gujarat' ||
        (c.district || '').toLowerCase() === districtFilter.toLowerCase();
      const camType = c.type || c.cameraType;
      const matchType = typeFilter === 'all' || camType === typeFilter;

      const camDeptCode = getCameraDeptCode(c);
      const matchDept = deptFilter === 'all' || camDeptCode === deptFilter;

      const matchSearch =
        !q ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.cameraName || '').toLowerCase().includes(q) ||
        (c.cameraId || '').toLowerCase().includes(q) ||
        (c.roadName || '').toLowerCase().includes(q) ||
        (c.landmark || '').toLowerCase().includes(q) ||
        (c.locationName || '').toLowerCase().includes(q) ||
        (c.taluka || '').toLowerCase().includes(q) ||
        (c.district || '').toLowerCase().includes(q);

      const hasCoords =
        (c.latitude && c.longitude) ||
        (Array.isArray(c.location?.coordinates) && c.location.coordinates.length === 2);

      return matchStatus && matchDistrict && matchType && matchDept && matchSearch && hasCoords;
    });
  }, [cameras, statusFilter, districtFilter, typeFilter, deptFilter, searchQuery]);

  // Handle Official Map Administrative Boundary & Google Maps Style Inverted Mask
  const { officialFeature, closedBorderPolygon, invertedMask, areaCameras } = useMemo(() => {
    if (!selectedArea) {
      return { officialFeature: null, closedBorderPolygon: null, invertedMask: null, areaCameras: [] };
    }

    const feature = getOfficialAreaFeature(selectedArea);
    if (!feature) {
      return { officialFeature: null, closedBorderPolygon: null, invertedMask: null, areaCameras: [] };
    }

    const borderPositions = getOfficialBorderPositions(feature);
    const mask = getOfficialInvertedMask(feature);
    const inArea = cameras.filter((c) => isCameraInOfficialArea(c, feature));

    return {
      officialFeature: feature,
      closedBorderPolygon: borderPositions,
      invertedMask: mask,
      areaCameras: inArea,
    };
  }, [cameras, selectedArea]);

  // HIDE cameras outside the official administrative boundary
  const displayedCameras = useMemo(() => {
    if (selectedArea && officialFeature) {
      return filtered.filter((c) => isCameraInOfficialArea(c, officialFeature));
    }
    return filtered;
  }, [filtered, selectedArea, officialFeature]);

  // Handlers for Area & Camera Selection
  const handleSelectArea = (areaName) => {
    setSelectedArea(areaName);
    setDistrictFilter(areaName === 'Gujarat' ? 'all' : areaName);
    setSelectedCamera(null);
    setIsStatsOpen(true);

    const feature = getOfficialAreaFeature(areaName);
    if (feature) {
      const bounds = getOfficialAreaBounds(feature);
      if (bounds) {
        setMapTargetBounds(bounds);
      }
    }
  };

  const handleSelectCamera = (cam) => {
    setSelectedCamera(cam);
    setIsStatsOpen(true);

    const lat = cam.latitude || cam.location?.coordinates?.[1];
    const lng = cam.longitude || cam.location?.coordinates?.[0];
    if (lat && lng) {
      setMapFlyTarget([lat, lng]);
    }
  };

  const handleSearchChange = (text) => {
    setSearchQuery(text);
    const q = text.trim();
    if (!q) {
      if (selectedArea && districtFilter === 'all') {
        setSelectedArea(null);
        setMapTargetBounds(null);
      }
    }
  };

  const handleClearAreaHighlight = () => {
    setSelectedArea(null);
    setDistrictFilter('all');
    setMapTargetBounds(null);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDistrictFilter('all');
    setTypeFilter('all');
    setDeptFilter('all');
    setSelectedArea(null);
    setSelectedCamera(null);
    setMapFlyTarget(null);
    setMapTargetBounds(null);
    setIsStatsOpen(false);
  };

  const isFiltered =
    selectedArea ||
    statusFilter !== 'all' ||
    districtFilter !== 'all' ||
    typeFilter !== 'all' ||
    deptFilter !== 'all';

  const counts = useMemo(
    () => ({
      total: cameras.length,
      online: cameras.filter((c) => (c.status || '').toLowerCase() === 'online').length,
      offline: cameras.filter((c) => (c.status || '').toLowerCase() === 'offline').length,
      maintenance: cameras.filter((c) => (c.status || '').toLowerCase() === 'maintenance').length,
    }),
    [cameras]
  );

  const legendCounts = useMemo(() => {
    const list = isFiltered ? displayedCameras : cameras;
    return {
      total: list.length,
      online: list.filter((c) => (c.status || '').toLowerCase() === 'online').length,
      offline: list.filter((c) => (c.status || '').toLowerCase() === 'offline').length,
      maintenance: list.filter((c) => (c.status || '').toLowerCase() === 'maintenance').length,
    };
  }, [cameras, displayedCameras, isFiltered]);

  const handleGenerateAreaAudit = async (districtParam) => {
    const dist = districtParam && districtParam !== 'all' ? districtParam : (selectedArea || 'Gujarat');
    const label = dist.toLowerCase() === 'gujarat' || dist.toLowerCase() === 'all' ? 'Gujarat State' : `${dist} District`;
    try {
      setIsGeneratingAudit(true);
      toast.loading(`Generating official Area Compliance & Gap Audit PDF for ${label}...`, { id: 'audit-pdf' });

      const res = await reportAPI.dispatch({
        reportType: 'COVERAGE_GAP',
        departmentCode: 'ALL',
        district: dist,
        timeframe: '30d',
        format: 'PDF',
        sendEmail: false,
      });

      const fileName = res.data?.data?.fileName;
      if (fileName) {
        toast.loading(`Downloading verified audit PDF for ${label}...`, { id: 'audit-pdf' });
        try {
          const blobRes = await reportAPI.download(fileName);
          const blob = new Blob([blobRes.data], { type: 'application/pdf' });
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);

          toast.success(`Area Compliance & Gap Audit PDF for ${label} downloaded successfully!`, { id: 'audit-pdf' });
        } catch (downloadErr) {
          const link = document.createElement('a');
          link.href = res.data?.data?.downloadUrl || `/api/reports/download/${fileName}`;
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success(`Area Compliance & Gap Audit PDF downloaded!`, { id: 'audit-pdf' });
        }
      } else {
        toast.success(`Audit report generated successfully!`, { id: 'audit-pdf' });
      }
    } catch (err) {
      console.error('Audit PDF error:', err);
      toast.error('Failed to generate Area Compliance & Gap Audit PDF.', { id: 'audit-pdf' });
    } finally {
      setIsGeneratingAudit(false);
    }
  };

  return (
    <div className={`flex flex-col h-full relative overflow-hidden ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#0a0d14] text-slate-100'}`}>
      {/* Top Header & Toolbar */}
      <div
        className={`px-4 lg:px-6 py-2.5 border-b shrink-0 flex flex-wrap items-center justify-between gap-3 transition-colors ${
          isLight
            ? 'bg-white/95 border-slate-200 shadow-xs backdrop-blur-md'
            : 'bg-[#0e1322]/90 border-white/5 backdrop-blur-md'
        }`}
      >
        {/* Left Branding & Live Stats */}
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
                className={`text-[11px] font-sans px-2.5 py-0.5 rounded-full font-bold border tracking-normal ${
                  isLight
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}
              >
                {counts.total} TOTAL CAMS
              </span>
            </div>
            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Geospatial Area Highlighting • Optical Buffers & Compliance Dispatch
            </p>
          </div>
        </div>

        {/* Live Counters */}
        <div
          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs border ${
            isLight ? 'bg-slate-50 border-slate-200 shadow-xs' : 'bg-white/3 border-white/6'
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

        {/* Unified Search & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Unified Search with Area & Camera Autocomplete */}
          <UnifiedSearchBar
            cameras={cameras}
            districts={districts}
            onSelectArea={handleSelectArea}
            onSelectCamera={handleSelectCamera}
            onSearchChange={handleSearchChange}
            onClear={resetAllFilters}
            selectedArea={selectedArea}
            selectedCamera={selectedCamera}
            isLight={isLight}
          />

          {/* Status Dropdown */}
          <FilterDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            isLight={isLight}
            icon={<CircleDot className="w-3.5 h-3.5" />}
            width="min-w-[120px]"
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'online',      label: 'Online',      dot: '#10b981' },
              { value: 'offline',     label: 'Offline',     dot: '#ef4444' },
              { value: 'maintenance', label: 'Maintenance', dot: '#f59e0b' },
            ]}
          />

          {/* Camera Type Dropdown */}
          <FilterDropdown
            value={typeFilter}
            onChange={setTypeFilter}
            isLight={isLight}
            icon={<Cctv className="w-3.5 h-3.5" />}
            width="min-w-[120px]"
            options={[
              { value: 'all', label: 'All Types' },
              ...cameraTypes
                .filter((t) => t !== 'all')
                .map((t) => ({ value: t, label: `${t} Camera` })),
            ]}
          />

          {/* District Dropdown */}
          <FilterDropdown
            value={selectedArea || districtFilter}
            onChange={(val) => {
              if (val === 'all') handleClearAreaHighlight();
              else handleSelectArea(val);
            }}
            isLight={isLight}
            icon={<Map className="w-3.5 h-3.5" />}
            width="min-w-[130px]"
            groups={[
              {
                label: 'Overview',
                options: [
                  { value: 'all', label: 'All Districts' },
                  { value: 'Gujarat', label: 'Gujarat State' },
                ],
              },
              {
                label: 'Districts',
                options: OFFICIAL_DISTRICTS.map((d) => ({ value: d, label: d })),
              },
            ]}
          />

          {/* Department Filter Dropdown */}
          <FilterDropdown
            value={deptFilter}
            onChange={setDeptFilter}
            isLight={isLight}
            icon={<Users className="w-3.5 h-3.5" />}
            width="min-w-[160px]"
            options={departmentOptions.map((opt) => ({
              value: opt.code,
              label: opt.label,
              badge: opt.badge,
            }))}
          />

          {/* Coverage Gap Analysis Trigger */}
          <button
            onClick={() => setIsCoverageModalOpen(true)}
            className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
              isLight
                ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-400'
            }`}
            title="Open Coverage Gap Analysis"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Gap Analysis</span>
          </button>

          {/* Sliding Stats Drawer Toggle */}
          <button
            onClick={() => setIsStatsOpen(!isStatsOpen)}
            className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
              isStatsOpen
                ? 'bg-cyan-500 text-slate-950 font-black border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : isLight
                ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
            }`}
            title="Toggle Statistics Tab"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Stats Panel</span>
          </button>

          {/* Reset Filters */}
          {isFiltered && (
            <button
              onClick={resetAllFilters}
              title="Reset all filters and selection"
              className={`p-2 border rounded-lg transition-all cursor-pointer ${
                isLight
                  ? 'text-slate-500 hover:text-blue-600 bg-white hover:bg-slate-50 border-slate-200 shadow-xs'
                  : 'text-slate-400 hover:text-cyan-400 bg-white/4 hover:bg-cyan-500/10 border-white/8'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Map Canvas */}
      <div className="flex-1 relative overflow-hidden">
        {/* Active Area Official Boundary Banner */}
        {selectedArea && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] animate-in fade-in slide-in-from-top-4 duration-300">
            <div
              className={`px-4 py-2 rounded-2xl border shadow-xl backdrop-blur-xl flex items-center gap-3 text-xs ${
                isLight
                  ? 'bg-white/95 border-blue-200 text-slate-800 shadow-blue-500/10'
                  : 'bg-[#090e1a]/90 border-blue-500/50 text-slate-100 shadow-[0_0_20px_rgba(37,99,235,0.35)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                <span className={isLight ? 'text-slate-700 font-semibold' : 'text-slate-300'}>
                  Official Administrative Boundary:
                </span>
                <strong
                  className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg border ${
                    isLight
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  }`}
                >
                  {selectedArea === 'Gujarat' ? 'Gujarat State' : `${selectedArea} District`}
                </strong>
                <span className={isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}>
                  ({displayedCameras.length} cameras in boundary)
                </span>
              </div>
              <button
                onClick={handleClearAreaHighlight}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                    : 'bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white'
                }`}
                title="Clear Area Highlighting"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-[2000] backdrop-blur-sm">
            <div
              className={`flex flex-col items-center gap-3 p-6 rounded-2xl border shadow-2xl ${
                isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#141929] border-white/10 text-slate-200'
              }`}
            >
              <div className="w-10 h-10 border-3 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm font-bold">Loading Gujarat Surveillance Network</p>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Syncing CCTV nodes and geospatial bounds...
                </p>
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

          {/* Programmatic map navigation controller */}
          <MapController targetBounds={mapTargetBounds} flyTarget={mapFlyTarget} />

          {/* Map click listener to clear active selection */}
          <MapClickHandler
            onMapClick={() => {
              if (selectedCamera) setSelectedCamera(null);
            }}
          />

          {/* ============================================================ */}
          {/* OFFICIAL ADMINISTRATIVE BOUNDARY & OUTSIDE DARKEN MASK       */}
          {/* ============================================================ */}
          {/* 1. Inverted Mask: Dims everything OUTSIDE official border */}
          {invertedMask && (
            <Polygon
              key={`mask-${selectedArea}`}
              positions={invertedMask}
              pathOptions={{
                color: 'transparent',
                fillColor: isLight ? '#0f172a' : '#030712',
                fillOpacity: isLight ? 0.65 : 0.76,
                interactive: false,
              }}
            />
          )}

          {/* 2. Official Administrative Border (Google Maps style) */}
          {closedBorderPolygon && (() => {
            const borderStyle = {
              color: '#2563eb',
              weight: 2.5,
              opacity: 1,
              fillColor: '#3b82f6',
              fillOpacity: 0.06,
              interactive: false,
            };

            // Determine shape: flat ring array (single Polygon rings), or nested array (MultiPolygon parts or state districts)
            const isFlat = Array.isArray(closedBorderPolygon[0]) && typeof closedBorderPolygon[0][0] === 'number';
            const isRingsArray = !isFlat && Array.isArray(closedBorderPolygon[0]) && Array.isArray(closedBorderPolygon[0][0]) && typeof closedBorderPolygon[0][0][0] === 'number';
            // isRingsArray: [[lat,lng], ...] array (single polygon with rings) or array of districts for state

            if (isFlat) {
              // Shouldn't normally happen but guard: treat as single ring
              return (
                <Polygon
                  key={`border-${selectedArea}`}
                  positions={closedBorderPolygon}
                  pathOptions={borderStyle}
                />
              );
            }

            // Array of polygons (each is [[lat,lng], ...]) — handles Polygon rings, MultiPolygon parts, or state districts
            return closedBorderPolygon.map((part, idx) => (
              <Polygon
                key={`border-${selectedArea}-${idx}`}
                positions={Array.isArray(part[0]?.[0]) ? part : [part]}
                pathOptions={borderStyle}
              />
            ));
          })()}

          {/* Camera Clustering Layer: Shows only cameras matching criteria & in highlighted area */}
          <CameraClusterLayer
            cameras={displayedCameras}
            onOpenStream={(cam) => setStreamCamera(cam)}
            onRequestFootage={(cam) => navigate(`/footage-requests?requestCam=${cam.cameraId}`)}
            onSelectCamera={handleSelectCamera}
            selectedCameraId={selectedCamera?.cameraId}
            showCoverageLayer={showCoverageLayer}
          />
        </MapContainer>

        {/* Map Legend */}
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
                isLight
                  ? 'bg-slate-100 text-slate-600 border border-slate-200'
                  : 'bg-white/5 text-slate-400 border border-white/8'
              }`}
            >
              {legendCounts.total} Units
            </span>
          </div>

          <div className="space-y-2 text-[11px]">
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

            {/* Coverage Buffer Toggle Indicator in Legend */}
            <div className="pt-2 border-t border-inherit">
              <button
                type="button"
                onClick={() => setShowCoverageLayer(!showCoverageLayer)}
                className={`w-full py-1 px-2 rounded-lg text-[10px] font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                  showCoverageLayer
                    ? isLight
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3 h-3" />
                  <span>Optical Buffers</span>
                </div>
                <span className="font-mono text-[9px]">{showCoverageLayer ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sliding Statistics & Intelligence Panel (2 Changeable Views) */}
        <GISStatsDrawer
          isOpen={isStatsOpen}
          onClose={() => setIsStatsOpen(false)}
          selectedArea={selectedArea}
          selectedCamera={selectedCamera}
          areaCameras={areaCameras.length > 0 ? areaCameras : displayedCameras}
          onSelectCamera={handleSelectCamera}
          onOpenStream={(cam) => setStreamCamera(cam)}
          onRequestFootage={(cam) => navigate(`/footage-requests?requestCam=${cam.cameraId}`)}
          onRequestReport={({ camera, district: dist, type }) => {
            if (type === 'area') {
              handleGenerateAreaAudit(dist || selectedArea || 'all');
            } else {
              setReportModalContext({ camera, district: dist || selectedArea || 'all' });
              setIsSendReportModalOpen(true);
            }
          }}
          onReportToDept={(cam) => {
            setDeptReportCamera(cam);
            setIsDeptReportOpen(true);
          }}
          isGeneratingAudit={isGeneratingAudit}
          isLight={isLight}
        />
      </div>

      {/* Coverage Gap Analysis & Report Generator Modal */}
      <CoverageGapModal
        isOpen={isCoverageModalOpen}
        onClose={() => setIsCoverageModalOpen(false)}
        district={selectedArea || 'all'}
        onToggleCoverageLayer={() => setShowCoverageLayer(!showCoverageLayer)}
        isCoverageLayerActive={showCoverageLayer}
        isLight={isLight}
      />

      {/* Departmental Report Request / Dispatch Modal */}
      <SendReportModal
        isOpen={isSendReportModalOpen}
        onClose={() => setIsSendReportModalOpen(false)}
        targetCamera={reportModalContext.camera}
        targetDistrict={reportModalContext.district || selectedArea || 'all'}
        departments={departments || []}
        isLight={isLight}
      />

      {/* Report to Department Modal — Admin only */}
      <ReportToDeptModal
        isOpen={isDeptReportOpen}
        onClose={() => { setIsDeptReportOpen(false); setDeptReportCamera(null); }}
        camera={deptReportCamera}
      />

      {/* Stream Modal */}
      {streamCamera && (
        <CameraStreamModal
          camera={streamCamera}
          isOpen={!!streamCamera}
          onClose={() => setStreamCamera(null)}
        />
      )}
    </div>
  );
}

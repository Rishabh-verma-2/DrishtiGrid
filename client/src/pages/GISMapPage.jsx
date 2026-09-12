import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { cameraAPI, departmentAPI, reportAPI, gisAPI } from '../api';
import toast from 'react-hot-toast';
import { useThemeStore } from '../store/themeStore';
import useAuthStore from '../store/authStore';
import useSocketStore from '../store/socketStore';

import CameraClusterLayer from '../components/map/CameraClusterLayer';
import CameraStreamModal from '../components/cameras/CameraStreamModal';
import ReportToDeptModal from '../components/cameras/ReportToDeptModal';
import BulkImportModal from '../components/cameras/BulkImportModal';
import UnifiedSearchBar from '../components/gis/UnifiedSearchBar';
import GISStatsDrawer from '../components/gis/GISStatsDrawer';
import CoverageGapModal from '../components/gis/CoverageGapModal';
import SendReportModal from '../components/gis/SendReportModal';
import FilterDropdown from '../components/gis/FilterDropdown';
import GISLayerControl from '../components/gis/GISLayerControl';
import AreaIntelligenceDrawer from '../components/gis/AreaIntelligenceDrawer';
import NearbyIntelligencePanel from '../components/gis/NearbyIntelligencePanel';
import RouteCameraFinderModal from '../components/gis/RouteCameraFinderModal';
import OperationalZonesLayer from '../components/gis/OperationalZonesLayer';
import ZoneModal from '../components/gis/ZoneModal';
import ZoneManagerModal from '../components/gis/ZoneManagerModal';
import InfrastructureLayer from '../components/gis/InfrastructureLayer';
import IncidentRadiusLayer from '../components/gis/IncidentRadiusLayer';
import CoverageGridLayer from '../components/gis/CoverageGridLayer';
import AdminHierarchyFilter from '../components/gis/AdminHierarchyFilter';
import GISGapAnalysisModal from '../components/gis/GISGapAnalysisModal';
import SendGapReportModal from '../components/gis/SendGapReportModal';
import GapAnalysisMapLayer from '../components/gis/GapAnalysisMapLayer';
import { hasPermission, isCameraInUserDepartment } from '../utils/permissions';

import {
  OFFICIAL_DISTRICTS,
  GUJARAT_CENTER,
  GUJARAT_DEFAULT_ZOOM,
  GUJARAT_BOUNDS,
  getOfficialAreaFeature,
  getOfficialBorderPositions,
  getOfficialInvertedMask,
  getOfficialAreaBounds,
  isCameraInOfficialArea,
} from '../utils/geoUtils';

import {
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
  Navigation,
  Globe,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  UploadCloud,
} from 'lucide-react';

/**
 * Programmatic controller for bounds fitting and flyTo transitions
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
      map.flyTo(flyTarget, 16, { duration: 1.2 });
    }
  }, [map, flyTarget]);

  return null;
}

/**
 * Background map clicks listener
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
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

export default function GISMapPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const isLight = theme === 'light';
  const userRole = String(user?.role || 'POLICE').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

  // Language support (English / Gujarati)
  const [language, setLanguage] = useState('en');

  // Layer Visibility Controls
  const [layers, setLayers] = useState({
    allCameras: true,
    policeCameras: true,
    trafficCameras: true,
    municipalCameras: true,
    incidents: true,
    crowdHotspots: false,
    anprActivity: false,
    infrastructure: false,
    hospitals: false,
    policeStations: false,
    fireStations: false,
    operationalZones: true,
    coverageBuffers: false,
    coverageGaps: false,
  });

  // Administrative Hierarchy State
  const [hierarchy, setHierarchy] = useState({
    district: 'all',
    city: 'all',
    zone: 'all',
    policeStation: 'all',
  });

  // Camera & Query Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  // Selection & Navigation State
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [mapFlyTarget, setMapFlyTarget] = useState(null);
  const [mapTargetBounds, setMapTargetBounds] = useState(null);

  // Drawers & Modals State
  const [isAreaIntelOpen, setIsAreaIntelOpen] = useState(false);
  const [isNearbyIntelOpen, setIsNearbyIntelOpen] = useState(false);
  const [nearbyCoords, setNearbyCoords] = useState(GUJARAT_CENTER);
  const [nearbyLabel, setNearbyLabel] = useState('Gujarat State Center');

  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);

  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [isZoneManagerOpen, setIsZoneManagerOpen] = useState(false);
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [isCoverageModalOpen, setIsCoverageModalOpen] = useState(false);
  const [isSendReportModalOpen, setIsSendReportModalOpen] = useState(false);
  const [reportModalContext, setReportModalContext] = useState({});

  // Authoritative GIS Gap Analysis State (Admin Only)
  const [isGapAnalysisModalOpen, setIsGapAnalysisModalOpen] = useState(false);
  const [isSendGapReportModalOpen, setIsSendGapReportModalOpen] = useState(false);
  const [activeGapReport, setActiveGapReport] = useState(null);
  const [selectedReportForSend, setSelectedReportForSend] = useState(null);

  const [streamCamera, setStreamCamera] = useState(null);
  const [isDeptReportOpen, setIsDeptReportOpen] = useState(false);
  const [deptReportCamera, setDeptReportCamera] = useState(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isGeneratingAudit, setIsGeneratingAudit] = useState(false);

  // Safe live stream opener with department access enforcement
  const handleOpenStreamWithAccessCheck = (cam) => {
    if (!cam) return;
    if (!isCameraInUserDepartment(user, cam)) {
      toast.error(
        `Access Restricted: Camera belongs to ${cam.departmentName || 'another department'}. Under Gujarat State rules, submit a Footage Request to Admin to access this feed.`,
        { duration: 6000 }
      );
      navigate(`/footage-requests?requestCam=${cam.cameraId}`);
      return;
    }
    setStreamCamera(cam);
  };

  // Real-time listener for bulk camera ingestion
  useEffect(() => {
    if (!socket) return;
    const handleBulkImported = (data) => {
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      toast.success(`GIS Synchronized: ${data.importedCount} new cameras imported.`);
    };
    socket.on('camera:bulk_imported', handleBulkImported);
    return () => socket.off('camera:bulk_imported', handleBulkImported);
  }, [socket, queryClient]);

  // ─── Queries ──────────────────────────────────────────────────
  // 1. Cameras
  const { data: cameras = [], isLoading: isCamerasLoading } = useQuery({
    queryKey: ['cameras', 'gis-all'],
    queryFn: () => cameraAPI.getAll({ limit: 0 }).then((r) => r.data.data || []),
    staleTime: 60000,
  });

  // 2. Critical Infrastructure Assets
  const { data: infraResponse = { data: [], summary: {} } } = useQuery({
    queryKey: ['gis-infrastructure', hierarchy.district],
    queryFn: () =>
      gisAPI
        .getInfrastructure({
          district: hierarchy.district !== 'all' ? hierarchy.district : undefined,
          limit: 250,
        })
        .then((r) => r.data || { data: [], summary: {} }),
    staleTime: 120000,
  });

  const infrastructure = infraResponse.data || [];
  const infraSummary = infraResponse.summary || {};

  // 3. Operational Geofence Zones
  const { data: zones = [] } = useQuery({
    queryKey: ['gis-zones', hierarchy.district],
    queryFn: () =>
      gisAPI
        .getZones({
          district: hierarchy.district !== 'all' ? hierarchy.district : undefined,
        })
        .then((r) => r.data.data || []),
    staleTime: 60000,
  });

  // 4. Active Incidents
  const { data: incidents = [] } = useQuery({
    queryKey: ['gis-incidents', hierarchy.district],
    queryFn: () =>
      gisAPI
        .getIncidents({
          district: hierarchy.district !== 'all' ? hierarchy.district : undefined,
          status: 'active',
        })
        .then((r) => r.data.data || []),
    staleTime: 30000,
  });

  // 5. Coverage Analysis
  const { data: coverageData } = useQuery({
    queryKey: ['gis-coverage', hierarchy.district],
    queryFn: () =>
      gisAPI
        .getCoverage({
          district: hierarchy.district !== 'all' ? hierarchy.district : undefined,
        })
        .then((r) => r.data.data || null),
    enabled: layers.coverageGaps,
    staleTime: 60000,
  });

  // 6. Departments list
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentAPI.getAll().then((r) => r.data.data || []),
    staleTime: 120000,
  });

  // ─── Real-time Socket.IO Listeners ───────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleCameraStatus = ({ cameraId, status }) => {
      queryClient.setQueryData(['cameras', 'gis-all'], (old) => {
        if (!old) return old;
        return old.map((c) => (c.cameraId === cameraId ? { ...c, status } : c));
      });
    };

    const handleNewAlert = (alert) => {
      toast(
        (t) => (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="font-bold text-xs">New Alert: {alert.title}</span>
          </div>
        ),
        { id: `alert-${alert._id}`, duration: 4000 }
      );
      queryClient.invalidateQueries(['gis-incidents']);
      queryClient.invalidateQueries(['gis-nearby']);
    };

    const handleNewIncident = (incident) => {
      queryClient.setQueryData(['gis-incidents', hierarchy.district], (old = []) => [
        incident,
        ...old,
      ]);
      toast.success(`New incident reported: #${incident.incidentId}`);
    };

    const handleZoneChange = () => {
      queryClient.invalidateQueries(['gis-zones']);
    };

    socket.on('camera:status', handleCameraStatus);
    socket.on('alert:new', handleNewAlert);
    socket.on('incident:new', handleNewIncident);
    socket.on('gis:zone:created', handleZoneChange);
    socket.on('gis:zone:updated', handleZoneChange);
    socket.on('gis:zone:deleted', handleZoneChange);

    return () => {
      socket.off('camera:status', handleCameraStatus);
      socket.off('alert:new', handleNewAlert);
      socket.off('incident:new', handleNewIncident);
      socket.off('gis:zone:created', handleZoneChange);
      socket.off('gis:zone:updated', handleZoneChange);
      socket.off('gis:zone:deleted', handleZoneChange);
    };
  }, [socket, queryClient, hierarchy.district]);

  // ─── Department Resolver Helper ───────────────────────────────
  const getCameraDeptCode = (c) => {
    if (
      c.departmentCode &&
      ['POLICE', 'TRAFFIC', 'HOME_DEPT', 'SMART_CITY', 'MUNICIPAL'].includes(c.departmentCode)
    ) {
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

  // ─── Multi-Dimensional Camera Filtering ───────────────────────
  const filteredCameras = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return cameras.filter((c) => {
      // 1. Layer toggles
      if (!layers.allCameras) return false;
      const deptCode = getCameraDeptCode(c);
      if (deptCode === 'POLICE' && !layers.policeCameras) return false;
      if (deptCode === 'TRAFFIC' && !layers.trafficCameras) return false;
      if (deptCode === 'MUNICIPAL' && !layers.municipalCameras) return false;

      // 2. Administrative Hierarchy Filters
      if (
        hierarchy.district !== 'all' &&
        hierarchy.district !== 'Gujarat' &&
        (c.district || '').toLowerCase() !== hierarchy.district.toLowerCase()
      ) {
        return false;
      }
      if (hierarchy.city !== 'all') {
        const cCity = c.city || c.address?.city || '';
        if (cCity.toLowerCase() !== hierarchy.city.toLowerCase()) return false;
      }
      if (hierarchy.zone !== 'all') {
        const cZone = c.zone || c.taluka || '';
        if (cZone.toLowerCase() !== hierarchy.zone.toLowerCase()) return false;
      }
      if (hierarchy.policeStation !== 'all') {
        if ((c.policeStation || '').toLowerCase() !== hierarchy.policeStation.toLowerCase()) {
          return false;
        }
      }

      // 3. UI Status & Type Filters
      if (statusFilter !== 'all' && (c.status || '').toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      const camType = c.type || c.cameraType;
      if (typeFilter !== 'all' && camType !== typeFilter) return false;
      if (deptFilter !== 'all' && deptCode !== deptFilter) return false;

      // 4. Live Search Box Query
      if (q) {
        const match =
          (c.name || '').toLowerCase().includes(q) ||
          (c.cameraName || '').toLowerCase().includes(q) ||
          (c.cameraId || '').toLowerCase().includes(q) ||
          (c.roadName || '').toLowerCase().includes(q) ||
          (c.landmark || '').toLowerCase().includes(q) ||
          (c.locationName || '').toLowerCase().includes(q) ||
          (c.taluka || '').toLowerCase().includes(q) ||
          (c.district || '').toLowerCase().includes(q) ||
          (c.policeStation || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      const hasCoords =
        (c.latitude && c.longitude) ||
        (Array.isArray(c.location?.coordinates) && c.location.coordinates.length === 2);

      return hasCoords;
    });
  }, [
    cameras,
    layers,
    hierarchy,
    statusFilter,
    typeFilter,
    deptFilter,
    searchQuery,
  ]);

  // ─── Official Administrative Boundary & Inverted Mask ─────────
  const activeArea = selectedArea || (hierarchy.district !== 'all' ? hierarchy.district : null);
  const { officialFeature, closedBorderPolygon, invertedMask } = useMemo(() => {
    if (!activeArea) {
      return { officialFeature: null, closedBorderPolygon: null, invertedMask: null };
    }

    const feature = getOfficialAreaFeature(activeArea);
    if (!feature) {
      return { officialFeature: null, closedBorderPolygon: null, invertedMask: null };
    }

    const borderPositions = getOfficialBorderPositions(feature);
    const mask = getOfficialInvertedMask(feature);

    return {
      officialFeature: feature,
      closedBorderPolygon: borderPositions,
      invertedMask: mask,
    };
  }, [activeArea]);

  // Final displayed cameras inside administrative boundary
  const displayedCameras = useMemo(() => {
    if (activeArea && officialFeature) {
      return filteredCameras.filter((c) => isCameraInOfficialArea(c, officialFeature));
    }
    return filteredCameras;
  }, [filteredCameras, activeArea, officialFeature]);

  // Filtered Infrastructure Assets based on layer toggles
  const displayedInfrastructure = useMemo(() => {
    if (!layers.infrastructure) return [];
    return infrastructure.filter((asset) => {
      if (asset.type === 'HOSPITAL' && !layers.hospitals) return false;
      if (asset.type === 'POLICE_STATION' && !layers.policeStations) return false;
      if (asset.type === 'FIRE_STATION' && !layers.fireStations) return false;
      return true;
    });
  }, [infrastructure, layers]);

  // ─── Handlers ─────────────────────────────────────────────────
  const handleSelectArea = (areaName) => {
    setSelectedArea(areaName);
    setHierarchy((prev) => ({
      ...prev,
      district: areaName === 'Gujarat' ? 'all' : areaName,
      city: 'all',
      zone: 'all',
      policeStation: 'all',
    }));
    setSelectedCamera(null);
    setIsAreaIntelOpen(true);

    const feature = getOfficialAreaFeature(areaName);
    if (feature) {
      const bounds = getOfficialAreaBounds(feature);
      if (bounds) setMapTargetBounds(bounds);
    }
  };

  const handleSelectCamera = (cam) => {
    setSelectedCamera(cam);
    const lat = cam.latitude || cam.location?.coordinates?.[1];
    const lng = cam.longitude || cam.location?.coordinates?.[0];
    if (lat && lng) {
      setMapFlyTarget([lat, lng]);
      setNearbyCoords([lat, lng]);
      setNearbyLabel(cam.name || cam.cameraId);
    }
  };

  const handleSelectZone = (zone) => {
    if (zone.geometry?.coordinates) {
      const coords =
        zone.geometry.type === 'Polygon'
          ? zone.geometry.coordinates[0][0]
          : zone.geometry.coordinates;
      setMapFlyTarget([coords[1], coords[0]]);
      toast.success(`Navigated to Operational Zone: ${zone.name}`);
    }
  };

  const handleSelectInfra = (asset) => {
    setSelectedAsset(asset);
    const lat = asset.latitude || asset.location?.coordinates?.[1];
    const lng = asset.longitude || asset.location?.coordinates?.[0];
    if (lat && lng) {
      setMapFlyTarget([lat, lng]);
      setNearbyCoords([lat, lng]);
      setNearbyLabel(asset.name);
      setIsNearbyIntelOpen(true);
    }
  };

  const handleOpenNearbyIntelForCoords = (coords, label = 'Selected Point') => {
    setNearbyCoords(coords);
    setNearbyLabel(label);
    setIsNearbyIntelOpen(true);
  };

  const handleMapBackgroundClick = (coords) => {
    // Open nearby intelligence around clicked point
    setNearbyCoords(coords);
    setNearbyLabel(`${coords[0].toFixed(4)}°N, ${coords[1].toFixed(4)}°E`);
  };

  const handleApplyRoute = ({ geometry, cameras: rCams }) => {
    setActiveRoute({ geometry, cameras: rCams });
    if (geometry?.coordinates?.length > 0) {
      const bounds = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      setMapTargetBounds(bounds);
    }
  };

  const handleClearRoute = () => {
    setActiveRoute(null);
  };

  const handleClearArea = () => {
    setSelectedArea(null);
    setHierarchy((prev) => ({ ...prev, district: 'all' }));
    setMapTargetBounds(GUJARAT_BOUNDS);
    setIsAreaIntelOpen(false);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setDeptFilter('all');
    setHierarchy({ district: 'all', city: 'all', zone: 'all', policeStation: 'all' });
    setSelectedArea(null);
    setSelectedCamera(null);
    setSelectedIncident(null);
    setSelectedAsset(null);
    setActiveRoute(null);
    setMapFlyTarget(null);
    setMapTargetBounds(GUJARAT_BOUNDS);
    setIsAreaIntelOpen(false);
    setIsNearbyIntelOpen(false);
  };

  const isFiltered =
    selectedArea ||
    hierarchy.district !== 'all' ||
    hierarchy.city !== 'all' ||
    hierarchy.zone !== 'all' ||
    hierarchy.policeStation !== 'all' ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    deptFilter !== 'all' ||
    activeRoute;

  // Header Counters
  const counts = useMemo(() => {
    return {
      total: cameras.length,
      online: cameras.filter((c) => (c.status || '').toLowerCase() === 'online').length,
      offline: cameras.filter((c) => (c.status || '').toLowerCase() === 'offline').length,
    };
  }, [cameras]);

  // Translations dictionary
  const t = {
    en: {
      title: 'Gujarat State GIS Surveillance Grid',
      subtitle: 'Geospatial Area Highlighting • Optical Buffers & Compliance Dispatch',
      cams: 'TOTAL CAMS',
      online: 'Online',
      offline: 'Offline',
      routeFinder: 'Route Discovery',
      newZone: 'New Zone',
      gapAnalysis: 'Gap Analysis',
      areaIntel: 'Area Intel',
      legend: 'Map Legend',
    },
    gu: {
      title: 'ગુજરાત રાજ્ય જીઆઈએસ સર્વેલન્સ ગ્રીડ',
      subtitle: 'ભૌગોલિક વિસ્તાર હાઇલાઇટિંગ • ઓપ્ટિકલ બફર્સ અને કાયદો અમલ',
      cams: 'કુલ કેમેરા',
      online: 'ઓનલાઇન',
      offline: 'ઑફલાઇન',
      routeFinder: 'રૂટ શોધ',
      newZone: 'નવો ઝોન',
      gapAnalysis: 'ગેપ વિશ્લેષણ',
      areaIntel: 'વિસ્તાર ઇન્ટેલ',
      legend: 'નકશો લિજેન્ડ',
    },
  }[language];

  return (
    <div
      className={`flex flex-col h-full relative overflow-hidden ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#0a0d14] text-slate-100'
      }`}
    >
      {/* ─── STREAMLINED COMPACT TOP TOOLBAR ─────────────────────── */}
      <div
        className={`px-3 py-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-2.5 transition-colors relative z-[1500] ${
          isLight
            ? 'bg-white/95 border-slate-200 shadow-xs backdrop-blur-md'
            : 'bg-[#0e1322]/90 border-white/5 backdrop-blur-md'
        }`}
      >
        {/* Left Branding & Live Stats Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
              isLight
                ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-xs'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-xs'
            }`}
          >
            <MapPin className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold tracking-wide ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Garud GIS
            </span>
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-white/5 border-white/10 text-slate-300'
              }`}
              title="Camera Live Stream Telemetry"
            >
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="font-bold text-emerald-400">{counts.online}</span>
              <span className="text-slate-500">/</span>
              <span>{counts.total}</span>
            </div>
          </div>
        </div>

        {/* Center: Search & Quick Administrative District Select (Single Line) */}
        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          <UnifiedSearchBar
            cameras={cameras}
            districts={OFFICIAL_DISTRICTS}
            onSelectArea={handleSelectArea}
            onSelectCamera={handleSelectCamera}
            onSelectZone={handleSelectZone}
            onSelectInfrastructure={handleSelectInfra}
            onSearchChange={(q) => setSearchQuery(q)}
            onClear={resetAllFilters}
            selectedArea={activeArea}
            selectedCamera={selectedCamera}
            isLight={isLight}
          />

          {/* Inline Quick District Select */}
          <select
            value={hierarchy.district}
            onChange={(e) => {
              const d = e.target.value;
              setHierarchy({ district: d, city: 'all', zone: 'all', policeStation: 'all' });
              if (d !== 'all') {
                setSelectedArea(d);
                const feat = getOfficialAreaFeature(d);
                if (feat) {
                  const bounds = getOfficialAreaBounds(feat);
                  if (bounds) setMapTargetBounds(bounds);
                }
              } else {
                setSelectedArea(null);
                setMapTargetBounds(GUJARAT_BOUNDS);
              }
            }}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer shrink-0 whitespace-nowrap transition-colors ${
              isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-white/5 border-white/10 text-slate-200'
            }`}
            title="Filter by Gujarat District"
          >
            <option value="all">District (All Gujarat)</option>
            {OFFICIAL_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Toggle Secondary Hierarchy Bar (City, Police Station) */}
          <button
            type="button"
            onClick={() => setShowHierarchy((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              showHierarchy
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : hierarchy.city !== 'all' || hierarchy.policeStation !== 'all'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                : isLight
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
            }`}
            title="Toggle fine-grained cascading jurisdiction filters (City, Police Station)"
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>
              {hierarchy.policeStation !== 'all'
                ? hierarchy.policeStation
                : hierarchy.city !== 'all'
                ? hierarchy.city
                : 'More Filters'}
            </span>
            {showHierarchy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Right Tools & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Grouped GIS Layer Control */}
          <GISLayerControl
            layers={layers}
            onChangeLayer={(key, val) => setLayers((p) => ({ ...p, [key]: val }))}
            onOpenZoneManager={() => setIsZoneManagerOpen(true)}
            isLight={isLight}
          />

          {/* Manage Geofence Zones (Admin & Police) */}
          {['ADMIN', 'SUPER_ADMIN', 'POLICE'].includes(userRole) && (
            <button
              type="button"
              onClick={() => setIsZoneManagerOpen(true)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                isLight
                  ? 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-800'
                  : 'bg-indigo-500/15 hover:bg-indigo-500/25 border-indigo-500/30 text-indigo-400'
              }`}
              title="Open Geofence Zones Management Hub (Edit, Delete, Fly to, Create)"
            >
              <Compass className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Manage Zones</span>
            </button>
          )}

          {/* Bulk Camera Onboarding (Permission-controlled) */}
          {hasPermission(user, 'bulk_import') && (
            <button
              type="button"
              id="gis-bulk-import-btn"
              onClick={() => setIsBulkImportOpen(true)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                isLight
                  ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800'
                  : 'bg-blue-500/15 hover:bg-blue-500/25 border-blue-500/30 text-blue-400'
              }`}
              title="Bulk Camera Onboarding & GIS Registry Import"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Bulk Import</span>
            </button>
          )}

          {/* Route-based Camera Discovery */}
          <button
            onClick={() => setIsRouteModalOpen(true)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
              activeRoute
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/25'
                : isLight
                ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800'
                : 'bg-blue-500/15 hover:bg-blue-500/25 border-blue-500/30 text-blue-400'
            }`}
            title="Discover cameras along route corridors"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{t.routeFinder}</span>
          </button>

          {/* Admin-Only CCTV Coverage Gap Analysis */}
          {isAdmin && (
            <button
              onClick={() => {
                setIsGapAnalysisModalOpen(true);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                activeGapReport
                  ? 'bg-cyan-500 text-slate-950 font-black border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                  : isLight
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-400'
              }`}
              title="Surveillance Gap Analysis (Admin Only)"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{t.gapAnalysis}</span>
              {activeGapReport && (
                <span className="w-2 h-2 rounded-full bg-cyan-300 animate-ping" />
              )}
            </button>
          )}

          {/* Area Intelligence Drawer Toggle */}
          <button
            onClick={() => setIsAreaIntelOpen(!isAreaIntelOpen)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
              isAreaIntelOpen
                ? 'bg-blue-600 text-white font-bold border-blue-500 shadow-xs'
                : isLight
                ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
            }`}
            title="Toggle Area Intelligence Drawer"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{t.areaIntel}</span>
          </button>

          {/* Language Switcher */}
          <button
            onClick={() => setLanguage((prev) => (prev === 'en' ? 'gu' : 'en'))}
            className={`px-2 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white/5 border-white/10 text-slate-300'
            }`}
            title="Switch Language / ભાષા બદલો"
          >
            <Globe className="w-3 h-3" />
            <span className="font-mono text-[10px]">{language === 'en' ? 'ગુજ' : 'ENG'}</span>
          </button>

          {/* Reset to Full Gujarat State View */}
          <button
            onClick={() => {
              setSelectedArea(null);
              setHierarchy((prev) => ({ ...prev, district: 'all' }));
              setMapTargetBounds(GUJARAT_BOUNDS);
            }}
            title="Reset map to full Gujarat State view"
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isLight
                ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'
                : 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-400'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Gujarat State</span>
          </button>

          {/* Reset Filters */}
          {isFiltered && (
            <button
              onClick={resetAllFilters}
              title="Reset all filters and selection"
              className={`p-1.5 border rounded-xl transition-all cursor-pointer ${
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

      {/* ─── CASCADING ADMINISTRATIVE HIERARCHY (ONLY WHEN EXPANDED) ─ */}
      {showHierarchy && (
        <AdminHierarchyFilter
          cameras={cameras}
          selectedDistrict={hierarchy.district}
          selectedCity={hierarchy.city}
          selectedZone={hierarchy.zone}
          selectedPoliceStation={hierarchy.policeStation}
          onChange={(updated) => {
            setHierarchy(updated);
            if (updated.district !== 'all') {
              setSelectedArea(updated.district);
              const feat = getOfficialAreaFeature(updated.district);
              if (feat) {
                const bounds = getOfficialAreaBounds(feat);
                if (bounds) setMapTargetBounds(bounds);
              }
            } else {
              setSelectedArea(null);
              setMapTargetBounds(GUJARAT_BOUNDS);
            }
          }}
          onReset={() => {
            setHierarchy({ district: 'all', city: 'all', zone: 'all', policeStation: 'all' });
            setSelectedArea(null);
            setMapTargetBounds(GUJARAT_BOUNDS);
          }}
          isLight={isLight}
        />
      )}

      {/* ─── MAIN MAP CANVAS ──────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Active Boundary Banner */}
        {activeArea && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] animate-in fade-in slide-in-from-top-4 duration-300">
            <div
              className={`px-4 py-2 rounded-2xl border shadow-xl flex items-center gap-3 text-xs ${
                isLight
                  ? 'bg-white border-blue-200 text-slate-800 shadow-sm'
                  : 'bg-[#090e1a] border-slate-700 text-slate-100 shadow-lg'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                <span className={isLight ? 'text-slate-700 font-semibold' : 'text-slate-300'}>
                  Administrative Jurisdiction:
                </span>
                <strong className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                  {activeArea === 'Gujarat' ? 'Gujarat State' : `${activeArea} District`}
                </strong>
                <span className="text-slate-400">({displayedCameras.length} CCTV nodes)</span>
              </div>
              <button
                onClick={handleClearArea}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Active Route Corridor Banner */}
        {activeRoute && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1100] animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="px-4 py-2 rounded-2xl bg-blue-600 text-white border border-blue-500 shadow-lg flex items-center gap-3 text-xs font-bold">
              <Navigation className="w-4 h-4 text-white" />
              <span>
                Active Route Corridor: {activeRoute.cameras?.length || 0} cameras discovered
              </span>
              <button
                onClick={handleClearRoute}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
                title="Clear route corridor"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {isCamerasLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-[2000] backdrop-blur-sm">
            <div
              className={`flex flex-col items-center gap-3 p-6 rounded-2xl border shadow-2xl ${
                isLight
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-[#141929] border-white/10 text-slate-200'
              }`}
            >
              <div className="w-10 h-10 border-3 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm font-bold">Loading Gujarat Surveillance Network</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Synchronizing GIS coordinates, infrastructure & geofences...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Floating Gujarat State View Quick-Reset on Map Canvas */}
        <div className="absolute top-[80px] right-[10px] z-[1000]">
          <button
            onClick={() => {
              setSelectedArea(null);
              setHierarchy((prev) => ({ ...prev, district: 'all' }));
              setMapTargetBounds(GUJARAT_BOUNDS);
            }}
            title="Fit Full Gujarat State View"
            className={`w-[30px] h-[30px] rounded-sm shadow-md border flex items-center justify-center transition-all cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-[#1e263d] hover:bg-[#28324e] border-white/10 text-cyan-400'
            }`}
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>

        {/* Active GIS Gap Analysis Overlay Banner */}
        {activeGapReport && (
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#0d1222]/90 backdrop-blur-md border border-cyan-500/40 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] animate-in fade-in slide-in-from-top-2">
            <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="text-xs">
              <span className="font-mono font-bold text-cyan-300">{activeGapReport.reportId}</span> ·{' '}
              <span className="font-semibold">{activeGapReport.location?.name}</span> ·{' '}
              <span>Score: <strong className="text-cyan-400 font-mono">{activeGapReport.summary?.coverageScore}/100</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setIsGapAnalysisModalOpen(true)}
              className="ml-1 px-2.5 py-1 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              Report Details
            </button>
            <button
              type="button"
              onClick={() => setActiveGapReport(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close Gap Analysis Layer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <MapContainer
          center={GUJARAT_CENTER}
          zoom={GUJARAT_DEFAULT_ZOOM}
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

          {/* Map Navigation Controller */}
          <MapController targetBounds={mapTargetBounds} flyTarget={mapFlyTarget} />

          {/* Background Map Click Handler */}
          <MapClickHandler onMapClick={handleMapBackgroundClick} />

          {/* 1. Official Administrative Inverted Mask */}
          {invertedMask && (
            <Polygon
              key={`mask-${activeArea}`}
              positions={invertedMask}
              pathOptions={{
                color: 'transparent',
                fillColor: isLight ? '#0f172a' : '#030712',
                fillOpacity: isLight ? 0.6 : 0.75,
                interactive: false,
              }}
            />
          )}

          {/* 2. Official Boundary Line */}
          {closedBorderPolygon && (
            <Polygon
              key={`border-${activeArea}`}
              positions={closedBorderPolygon}
              pathOptions={{
                color: '#2563eb',
                weight: 2.5,
                opacity: 1,
                fillColor: '#3b82f6',
                fillOpacity: 0.05,
                interactive: false,
              }}
            />
          )}

          {/* 3. Discovered Route Polyline */}
          {activeRoute?.geometry?.coordinates && (
            <Polyline
              positions={activeRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng])}
              pathOptions={{
                color: '#06b6d4',
                weight: 6,
                opacity: 0.85,
                dashArray: '1, 10',
              }}
            />
          )}

          {/* 4. Operational Zones Layer */}
          {layers.operationalZones && (
            <OperationalZonesLayer
              zones={zones}
              isLight={isLight}
              onSelectZone={handleSelectZone}
              onManageZone={() => setIsZoneManagerOpen(true)}
            />
          )}

          {/* 5. Critical Infrastructure Layer */}
          {layers.infrastructure && (
            <InfrastructureLayer
              assets={displayedInfrastructure}
              onSelectAsset={handleSelectInfra}
              onFindNearbyCameras={handleOpenNearbyIntelForCoords}
              isLight={isLight}
            />
          )}

          {/* 6. Active Incidents & Radius Layer */}
          {layers.incidents && (
            <IncidentRadiusLayer
              incidents={incidents}
              selectedIncident={selectedIncident}
              onSelectIncident={(inc) => {
                setSelectedIncident(inc);
                const lat = inc.location?.coordinates?.[1];
                const lng = inc.location?.coordinates?.[0];
                if (lat && lng) {
                  setMapFlyTarget([lat, lng]);
                  setNearbyCoords([lat, lng]);
                  setNearbyLabel(`Incident #${inc.incidentId}`);
                }
              }}
              onRequestEvidenceFootage={({ incident, cameraIds }) => {
                navigate(
                  `/footage-requests?incidentId=${incident.incidentId}&incidentTitle=${encodeURIComponent(
                    incident.title
                  )}&cameras=${cameraIds.join(',')}`
                );
              }}
              isLight={isLight}
              userRole={userRole}
            />
          )}

          {/* 7. CCTV Coverage Gap Analysis Layer */}
          {layers.coverageGaps && coverageData && (
            <CoverageGridLayer
              coverageData={coverageData}
              onViewNearbyCameras={(center, title) => {
                handleOpenNearbyIntelForCoords(center, title);
              }}
              onAddPlanningMarker={(center, cluster) => {
                toast.success(`Planning marker registered for ${cluster.title}`);
              }}
              isLight={isLight}
            />
          )}

          {/* Authoritative GIS Gap Analysis Layer (Admin Generated) */}
          {activeGapReport && (
            <GapAnalysisMapLayer
              report={activeGapReport}
              onOpenReport={() => setIsGapAnalysisModalOpen(true)}
              onClear={() => setActiveGapReport(null)}
              isLight={isLight}
            />
          )}

          {/* 8. CCTV Cameras Cluster Layer */}
          <CameraClusterLayer
            cameras={displayedCameras}
            user={user}
            onOpenStream={handleOpenStreamWithAccessCheck}
            onRequestFootage={(cam) =>
              navigate(`/footage-requests?requestCam=${cam.cameraId}`)
            }
            onOpenAnalyze={(cam) => {
              if (!isCameraInUserDepartment(user, cam)) {
                toast.error(
                  `Access Restricted: Camera belongs to ${cam.departmentName || 'another department'}. Under state rules, submit a Footage Request to Admin.`,
                  { duration: 5000 }
                );
                return;
              }
              toast.success(`Opening ANPR analysis for ${cam.name || cam.cameraId}...`);
              navigate(`/anpr?cameraId=${encodeURIComponent(cam.cameraId)}`);
            }}
            onOpenAreaIntel={(cam) => {
              setSelectedArea(cam.district);
              setSelectedCamera(cam);
              setIsAreaIntelOpen(true);
            }}
            onOpenNearbyCams={(cam) => {
              const lat = cam.latitude || cam.location?.coordinates?.[1];
              const lng = cam.longitude || cam.location?.coordinates?.[0];
              if (lat && lng) {
                handleOpenNearbyIntelForCoords([lat, lng], cam.name || cam.cameraId);
              }
            }}
            onReportToDept={(cam) => {
              if (userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
                toast.error('Access Restricted: Only State Administrators can dispatch department outage reports.');
                return;
              }
              setDeptReportCamera(cam);
              setIsDeptReportOpen(true);
            }}
            userRole={userRole}
            isLight={isLight}
          />
        </MapContainer>

        {/* Selected Camera Quick Action Floating Card */}
        {selectedCamera && (
          <div
            className={`absolute top-20 right-6 z-[1000] backdrop-blur-md border rounded-2xl p-4 shadow-2xl transition-all max-w-sm w-full ${
              isLight
                ? 'bg-white/95 border-slate-200 text-slate-900'
                : 'bg-[#0d121f]/95 border-white/10 text-white'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div>
                <span className="text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/15 text-blue-500 border border-blue-500/30">
                  {selectedCamera.cameraId}
                </span>
                <h4 className="text-sm font-bold mt-1 leading-snug line-clamp-1">
                  {selectedCamera.name || selectedCamera.cameraName || 'CCTV Unit'}
                </h4>
              </div>
              <button
                onClick={() => setSelectedCamera(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs mb-3.5">
              <div className="flex justify-between">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Department:</span>
                <span className="font-semibold">{selectedCamera.departmentName || selectedCamera.departmentCode || 'Police Dept'}</span>
              </div>
              <div className="flex justify-between">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Status:</span>
                <span className={`font-semibold capitalize ${(selectedCamera.status || '').toLowerCase() === 'online' ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {selectedCamera.status || 'Offline'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenStreamWithAccessCheck(selectedCamera)}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/25"
              >
                <Video className="w-3.5 h-3.5" />
                View Details
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isCameraInUserDepartment(user, selectedCamera)) {
                    toast.error(
                      `Access Restricted: Camera belongs to ${selectedCamera.departmentName || 'another department'}. Under state rules, submit a Footage Request to Admin.`,
                      { duration: 5000 }
                    );
                    return;
                  }
                  toast.success(`Opening ANPR analysis for ${selectedCamera.name || selectedCamera.cameraId}...`);
                  navigate(`/anpr?cameraId=${encodeURIComponent(selectedCamera.cameraId)}`);
                }}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-600/25"
              >
                <Activity className="w-3.5 h-3.5" />
                ANPR Analyze
              </button>
            </div>
          </div>
        )}

        {/* Bottom Left Legend */}
        <div
          className={`absolute bottom-6 left-5 z-[1000] backdrop-blur-md border rounded-2xl p-3.5 space-y-2.5 min-w-[215px] transition-colors ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-800 shadow-xl'
              : 'bg-[#0d121f]/95 border-white/10 text-slate-100 shadow-2xl'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-inherit text-[11px] font-bold uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              {t.legend}
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/5 text-slate-400'
              }`}
            >
              {displayedCameras.length} Active
            </span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Online Units
              </span>
              <span className={`font-mono font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                {displayedCameras.filter((c) => (c.status || '').toLowerCase() === 'online').length}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Maintenance Units
              </span>
              <span className={`font-mono font-bold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                {displayedCameras.filter((c) => ['maintenance', 'fault'].includes((c.status || '').toLowerCase())).length}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Offline Units
              </span>
              <span className={`font-mono font-bold ${isLight ? 'text-red-700' : 'text-red-400'}`}>
                {displayedCameras.filter((c) => (c.status || '').toLowerCase() === 'offline').length}
              </span>
            </div>
          </div>
        </div>

        {/* Area Intelligence Drawer (Right Side) */}
        <AreaIntelligenceDrawer
          isOpen={isAreaIntelOpen}
          onClose={() => setIsAreaIntelOpen(false)}
          selectedArea={activeArea}
          district={hierarchy.district}
          onViewCameras={() => {
            setIsAreaIntelOpen(false);
          }}
          onViewIncidents={() => {
            setLayers((p) => ({ ...p, incidents: true }));
            setIsAreaIntelOpen(false);
          }}
          onOpenNearbyIntelligence={() => {
            setIsNearbyIntelOpen(true);
          }}
          onCreateIncident={() => {
            setIsAreaIntelOpen(false);
            navigate('/alerts');
          }}
          isLight={isLight}
        />

        {/* Nearby Intelligence Panel (Bottom Right Floating) */}
        <NearbyIntelligencePanel
          isOpen={isNearbyIntelOpen}
          onClose={() => setIsNearbyIntelOpen(false)}
          coordinates={nearbyCoords}
          locationName={nearbyLabel}
          onOpenStream={handleOpenStreamWithAccessCheck}
          onRequestFootage={(cam) =>
            navigate(`/footage-requests?requestCam=${cam.cameraId}`)
          }
          onFitNearbyBounds={(bounds) => setMapTargetBounds(bounds)}
          isLight={isLight}
          user={user}
          userRole={userRole}
        />

        {/* Route Camera Finder Modal */}
        <RouteCameraFinderModal
          isOpen={isRouteModalOpen}
          onClose={() => setIsRouteModalOpen(false)}
          onApplyRoute={handleApplyRoute}
          onOpenStream={handleOpenStreamWithAccessCheck}
          onRequestFootage={(cam) =>
            navigate(`/footage-requests?requestCam=${cam.cameraId}`)
          }
          isLight={isLight}
          user={user}
          userRole={userRole}
        />

        {/* Operational Zone Creation Modal */}
        <ZoneModal
          isOpen={isZoneModalOpen}
          onClose={() => setIsZoneModalOpen(false)}
          onZoneCreated={(newZ) => {
            queryClient.invalidateQueries(['gis-zones']);
          }}
          district={hierarchy.district !== 'all' ? hierarchy.district : 'Ahmedabad'}
          isLight={isLight}
        />

        {/* Operational Geofence Zones Management Hub */}
        <ZoneManagerModal
          isOpen={isZoneManagerOpen}
          onClose={() => setIsZoneManagerOpen(false)}
          zones={zones}
          onRefreshZones={() => {
            queryClient.invalidateQueries(['gis-zones']);
          }}
          onFlyToZone={(zone) => {
            handleSelectZone(zone);
          }}
          userRole={userRole}
          district={hierarchy.district}
          isLight={isLight}
        />

        {/* Coverage Gap Analysis Modal */}
        <CoverageGapModal
          isOpen={isCoverageModalOpen}
          onClose={() => setIsCoverageModalOpen(false)}
          district={hierarchy.district || 'all'}
          onToggleCoverageLayer={() => setLayers((p) => ({ ...p, coverageGaps: !p.coverageGaps }))}
          isCoverageLayerActive={layers.coverageGaps}
          isLight={isLight}
        />

        {/* Stream Modal */}
        {streamCamera && (
          <CameraStreamModal
            camera={streamCamera}
            isOpen={!!streamCamera}
            onClose={() => setStreamCamera(null)}
          />
        )}

        {/* Department Escalation Report Modal */}
        {deptReportCamera && (
          <ReportToDeptModal
            isOpen={isDeptReportOpen}
            onClose={() => {
              setIsDeptReportOpen(false);
              setDeptReportCamera(null);
            }}
            camera={deptReportCamera}
          />
        )}

        {/* Bulk Camera Onboarding Modal */}
        <BulkImportModal
          isOpen={isBulkImportOpen}
          onClose={() => setIsBulkImportOpen(false)}
          onImportSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['cameras'] });
          }}
        />

        {/* Authoritative GIS Gap Analysis Modal (Admin Only) */}
        {isAdmin && (
          <GISGapAnalysisModal
            isOpen={isGapAnalysisModalOpen}
            onClose={() => setIsGapAnalysisModalOpen(false)}
            allCameras={cameras}
            defaultDistrict={hierarchy.district !== 'all' ? hierarchy.district : 'Ahmedabad'}
            onApplyAnalysisToMap={(report) => {
              setActiveGapReport(report);
              const [lng, lat] = report.location.coordinates;
              setMapFlyTarget([lat, lng]);
            }}
            onOpenSendReport={(report) => {
              setSelectedReportForSend(report);
              setIsSendGapReportModalOpen(true);
            }}
            isLight={isLight}
          />
        )}

        {/* Send Gap Analysis Report to Department Modal (Admin Only) */}
        {isAdmin && (
          <SendGapReportModal
            isOpen={isSendGapReportModalOpen}
            onClose={() => setIsSendGapReportModalOpen(false)}
            report={selectedReportForSend}
            onSuccess={() => {
              queryClient.invalidateQueries(['gap-reports']);
              if (activeGapReport && selectedReportForSend?.reportId === activeGapReport.reportId) {
                setActiveGapReport((prev) => (prev ? { ...prev, status: 'SENT' } : null));
              }
            }}
            isLight={isLight}
          />
        )}
      </div>
    </div>
  );
}

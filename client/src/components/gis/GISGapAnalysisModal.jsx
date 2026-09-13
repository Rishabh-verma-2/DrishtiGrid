import React, { useState, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Tooltip,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  X,
  Search,
  MapPin,
  ShieldAlert,
  Send,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  ArrowRight,
  Cctv,
  Building,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  FileText,
  Printer,
  ChevronRight,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeDropdown from '../common/ThemeDropdown';
import { gapAnalysisAPI, gisAPI, departmentAPI } from '../../api';

// Custom Map Pins for Leaflet
const centerIcon = L.divIcon({
  className: 'custom-center-pin',
  html: `
    <div style="
      width: 28px;
      height: 28px;
      background: #06b6d4;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 16px rgba(6, 182, 212, 0.8), 0 2px 8px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #000;
      font-weight: bold;
      animation: pulse-ring 2s infinite;
    ">
      <div style="width: 8px; height: 8px; background: #fff; border-radius: 50%;"></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const cameraIcon = (isOnline) =>
  L.divIcon({
    className: 'custom-cam-preview-pin',
    html: `
    <div style="
      width: 18px;
      height: 18px;
      background: ${isOnline ? '#10b981' : '#ef4444'};
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>
  `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

function MapPreviewController({ center, radius }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [center, map]);
  return null;
}

function MapPreviewClickHandler({ onSelectCoords }) {
  useMapEvents({
    click: (e) => {
      onSelectCoords([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function GISGapAnalysisModal({
  isOpen,
  onClose,
  onApplyAnalysisToMap,
  onOpenSendReport,
  isLight = false,
  allCameras = [],
  defaultDistrict = 'Ahmedabad',
}) {
  // Input parameters
  const [locationQuery, setLocationQuery] = useState('Maninagar, Ahmedabad');
  const [selectedCoords, setSelectedCoords] = useState([22.9978, 72.6026]); // [lat, lng]
  const [resolvedAddress, setResolvedAddress] = useState('Maninagar, Ahmedabad, Gujarat');
  const [district, setDistrict] = useState(defaultDistrict || 'Ahmedabad');

  // Radius options: presets & custom
  const [radiusPreset, setRadiusPreset] = useState('1km'); // 250m, 500m, 1km, 2km, 5km, custom
  const [customRadiusValue, setCustomRadiusValue] = useState(1);
  const [customRadiusUnit, setCustomRadiusUnit] = useState('km'); // 'm' or 'km'

  // Optional filters backed by real metadata
  const [cameraType, setCameraType] = useState('all');
  const [cameraStatus, setCameraStatus] = useState('all');
  const [departmentCode, setDepartmentCode] = useState('all');

  // Departments for filter & selection
  const [departments, setDepartments] = useState([]);
  const [selectedDeptOverride, setSelectedDeptOverride] = useState('');

  // Search autocomplete & geocoding state
  const [suggestions, setSuggestions] = useState([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Execution state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState(null);

  // Compute active radius in meters
  const radiusMeters = React.useMemo(() => {
    if (radiusPreset === '250m') return 250;
    if (radiusPreset === '500m') return 500;
    if (radiusPreset === '1km') return 1000;
    if (radiusPreset === '2km') return 2000;
    if (radiusPreset === '5km') return 5000;
    const val = parseFloat(customRadiusValue) || 1000;
    return customRadiusUnit === 'km' ? Math.round(val * 1000) : Math.round(val);
  }, [radiusPreset, customRadiusValue, customRadiusUnit]);

  // Load departments
  useEffect(() => {
    departmentAPI
      .getAll()
      .then((res) => {
        setDepartments(res.data?.data || []);
      })
      .catch((err) => console.warn('Failed to load departments:', err));
  }, []);

  // Filter cameras visible in preview inside the selected radius
  const previewCameras = React.useMemo(() => {
    if (!selectedCoords || !allCameras.length) return [];
    const [cLat, cLng] = selectedCoords;
    const r = radiusMeters;
    return allCameras.filter((cam) => {
      const lat = cam.latitude || cam.location?.coordinates?.[1];
      const lng = cam.longitude || cam.location?.coordinates?.[0];
      if (typeof lat !== 'number' || typeof lng !== 'number') return false;
      // Approx filter
      const dLat = (lat - cLat) * 111139;
      const dLng = (lng - cLng) * 111139 * Math.cos((cLat * Math.PI) / 180);
      return Math.sqrt(dLat * dLat + dLng * dLng) <= r;
    });
  }, [selectedCoords, radiusMeters, allCameras]);

  // Autocomplete location search with debounce
  useEffect(() => {
    const q = locationQuery.trim();
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setIsSearchingLocation(true);
        // 1. Unified search across DB cameras, zones, and districts
        const res = await gisAPI.search({ q, limit: 6 });
        const data = res.data?.data || {};

        const list = [];
        // Districts
        (data.districts || []).forEach((d) => {
          if (d.avgLat && d.avgLng) {
            list.push({
              title: `${d._id} District`,
              subtitle: 'Administrative District',
              coords: [d.avgLat, d.avgLng],
              district: d._id,
            });
          }
        });

        // Cameras / Landmarks / Roads
        (data.cameras || []).forEach((c) => {
          const lat = c.latitude || c.location?.coordinates?.[1];
          const lng = c.longitude || c.location?.coordinates?.[0];
          if (lat && lng) {
            list.push({
              title: c.name || c.cameraName || c.roadName || c.landmark,
              subtitle: [c.roadName, c.landmark, c.district].filter(Boolean).join(' · '),
              coords: [lat, lng],
              district: c.district || 'Ahmedabad',
            });
          }
        });

        // OpenStreetMap Nominatim Fallback if few internal results
        if (list.length < 3) {
          try {
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                q + ', Gujarat, India'
              )}&format=json&limit=4&countrycodes=in`
            );
            const geoData = await geoRes.json();
            (geoData || []).forEach((item) => {
              const lat = parseFloat(item.lat);
              const lon = parseFloat(item.lon);
              if (!isNaN(lat) && !isNaN(lon)) {
                list.push({
                  title: item.display_name.split(',')[0],
                  subtitle: item.display_name,
                  coords: [lat, lon],
                  district: q.includes('Surat')
                    ? 'Surat'
                    : q.includes('Vadodara')
                    ? 'Vadodara'
                    : q.includes('Rajkot')
                    ? 'Rajkot'
                    : 'Ahmedabad',
                });
              }
            });
          } catch (e) {
            // ignore network/geocoding failure
          }
        }

        setSuggestions(list);
      } catch (err) {
        console.warn('Search suggestions error:', err);
      } finally {
        setIsSearchingLocation(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [locationQuery]);

  // Handle clicking outside suggestions
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleSelectSuggestion = (sug) => {
    setLocationQuery(sug.title);
    setSelectedCoords(sug.coords);
    setResolvedAddress(sug.subtitle || sug.title);
    if (sug.district) setDistrict(sug.district);
    setShowSuggestions(false);
  };

  const handleRunAnalysis = async () => {
    if (!selectedCoords || !selectedCoords[0] || !selectedCoords[1]) {
      toast.error('Please select or search a valid geographic location');
      return;
    }

    if (radiusMeters < 50 || radiusMeters > 25000) {
      toast.error('Radius must be between 50 meters and 25 km');
      return;
    }

    try {
      setIsAnalyzing(true);
      toast.loading('Analyzing surveillance coverage and spatial density...', { id: 'gap-run' });

      const payload = {
        locationName: locationQuery,
        latitude: selectedCoords[0],
        longitude: selectedCoords[1],
        radiusMeters,
        district,
        filters: {
          cameraType,
          cameraStatus,
          departmentCode,
        },
      };

      const res = await gapAnalysisAPI.analyze(payload);
      const report = res.data?.data;

      setAnalysisReport(report);
      setSelectedDeptOverride(report.responsibleDepartment?.code || 'POLICE');

      toast.success(
        `Gap Analysis Complete! Coverage Score: ${report.summary.coverageScore}/100 (${report.summary.criticalGaps} Critical Gaps)`,
        { id: 'gap-run' }
      );
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || 'Gap analysis could not be completed. Please try again.',
        { id: 'gap-run' }
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleViewOnGisMap = () => {
    if (!analysisReport) return;
    onApplyAnalysisToMap(analysisReport);
    onClose();
    toast.success(`Overlaying ${analysisReport.reportId} on GIS Map`);
  };

  const handleOpenSendModal = () => {
    if (!analysisReport) return;
    onOpenSendReport({
      ...analysisReport,
      responsibleDepartment:
        departments.find((d) => d.code === selectedDeptOverride) ||
        analysisReport.responsibleDepartment,
    });
  };

  const score = analysisReport?.summary?.coverageScore ?? 0;
  const scoreBadgeColor =
    score >= 75
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : score >= 50
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-red-400 border-red-500/30 bg-red-500/10';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden backdrop-blur-2xl transition-all ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/40'
            : 'bg-[#0e1322] border-white/10 text-slate-100 shadow-black/80'
        }`}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-inherit flex items-center justify-between shrink-0 bg-inherit">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${
                isLight
                  ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight">GIS Gap Analysis</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  Admin Only
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Analyze surveillance coverage and identify potential camera deployment gaps.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Top Configuration Form: Location & Radius & Filters */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Form Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Location Input with Autocomplete */}
              <div ref={searchContainerRef} className="relative space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Analysis Location</span>
                  <span className="text-[10px] font-mono text-cyan-500 font-semibold lowercase">
                    {selectedCoords[0].toFixed(4)}, {selectedCoords[1].toFixed(4)}
                  </span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Enter area, locality, landmark or address (e.g. Maninagar, Ahmedabad)"
                    className={`w-full pl-10 pr-10 py-2.5 rounded-2xl text-xs font-medium border outline-none transition-all ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500 focus:bg-white'
                        : 'bg-white/5 border-white/10 text-white focus:border-cyan-500 focus:bg-white/10'
                    }`}
                  />
                  {isSearchingLocation && (
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                      <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border shadow-xl overflow-hidden backdrop-blur-xl ${
                      isLight ? 'bg-white border-slate-200' : 'bg-[#121729] border-white/15'
                    }`}
                  >
                    {suggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(sug)}
                        className={`w-full px-4 py-2.5 text-left text-xs flex items-center gap-2.5 border-b last:border-0 transition-colors ${
                          isLight
                            ? 'border-slate-100 hover:bg-slate-50 text-slate-800'
                            : 'border-white/5 hover:bg-white/5 text-slate-200'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <div className="truncate">
                          <div className="font-bold truncate">{sug.title}</div>
                          <div className="text-[10px] text-slate-400 truncate">{sug.subtitle}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Radius Options */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Analysis Radius
                  </label>
                  <span className="text-xs font-black font-mono text-cyan-400">
                    {radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(1)} km` : `${radiusMeters} m`}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {['250m', '500m', '1km', '2km', '5km', 'custom'].map((preset) => {
                    const isSelected = radiusPreset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRadiusPreset(preset)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center capitalize cursor-pointer ${
                          isSelected
                            ? isLight
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.35)]'
                            : isLight
                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                      >
                        {preset === 'custom' ? 'Custom' : preset}
                      </button>
                    );
                  })}
                </div>

                {/* Custom radius input if selected */}
                {radiusPreset === 'custom' && (
                  <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                    <span className="text-xs text-slate-400">Radius:</span>
                    <input
                      type="number"
                      min="50"
                      max="25000"
                      value={customRadiusValue}
                      onChange={(e) => setCustomRadiusValue(e.target.value)}
                      className={`w-24 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border outline-none ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-white/5 border-white/10 text-white'
                      }`}
                    />
                    <ThemeDropdown
                      size="sm"
                      value={customRadiusUnit}
                      onChange={(e) => setCustomRadiusUnit(e.target.value)}
                      options={[
                        { value: 'km', label: 'km' },
                        { value: 'm', label: 'meters' },
                      ]}
                      className="w-24"
                    />
                    <span className="text-[11px] text-slate-400">(Max 25 km)</span>
                  </div>
                )}
              </div>

              {/* Optional Real Metadata Filters */}
              <div
                className={`p-3.5 rounded-2xl border space-y-3 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Optional Surveillance Filters</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Real Camera Filters</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Camera Type */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">Camera Type</label>
                    <ThemeDropdown
                      size="sm"
                      value={cameraType}
                      onChange={(e) => setCameraType(e.target.value)}
                      options={[
                        { value: 'all', label: 'All Types' },
                        { value: 'Fixed', label: 'Fixed' },
                        { value: 'PTZ', label: 'PTZ (Pan-Tilt-Zoom)' },
                        { value: 'Dome', label: 'Dome' },
                        { value: 'Bullet', label: 'Bullet' },
                        { value: 'Thermal', label: 'Thermal' },
                      ]}
                    />
                  </div>

                  {/* Camera Status */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">Camera Status</label>
                    <ThemeDropdown
                      size="sm"
                      value={cameraStatus}
                      onChange={(e) => setCameraStatus(e.target.value)}
                      options={[
                        { value: 'all', label: 'All Statuses' },
                        { value: 'active', label: 'Active (Online)' },
                        { value: 'inactive', label: 'Inactive (Offline)' },
                        { value: 'maintenance', label: 'Maintenance' },
                      ]}
                    />
                  </div>

                  {/* Department */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">Department</label>
                    <ThemeDropdown
                      size="sm"
                      value={departmentCode}
                      onChange={(e) => setDepartmentCode(e.target.value)}
                      options={[
                        { value: 'all', label: 'All Departments' },
                        ...departments.map((d) => ({ value: d.code, label: d.name })),
                      ]}
                    />
                  </div>
                </div>
              </div>

              {/* Primary CTA */}
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={handleRunAnalysis}
                className={`w-full py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                  isAnalyzing
                    ? 'bg-cyan-600 text-white cursor-wait opacity-80'
                    : isLight
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing surveillance coverage...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Analyze Gap</span>
                  </>
                )}
              </button>
            </div>

            {/* Right Column: Interactive Map Preview (5 cols) */}
            <div className="lg:col-span-5 flex flex-col space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                <span>Map Preview</span>
                <span className="text-[10px] text-cyan-400 font-normal">Click map to adjust location</span>
              </div>

              <div
                className={`flex-1 min-h-[260px] rounded-2xl border overflow-hidden relative shadow-inner ${
                  isLight ? 'border-slate-300 bg-slate-100' : 'border-white/10 bg-slate-950'
                }`}
              >
                <MapContainer
                  center={selectedCoords}
                  zoom={radiusMeters <= 1000 ? 15 : radiusMeters <= 3000 ? 14 : 12}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer
                    url={
                      isLight
                        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    }
                  />
                  <MapPreviewController center={selectedCoords} radius={radiusMeters} />
                  <MapPreviewClickHandler
                    onSelectCoords={(coords) => {
                      setSelectedCoords(coords);
                      setResolvedAddress(`Custom: ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`);
                    }}
                  />

                  {/* Center point marker */}
                  <Marker position={selectedCoords} icon={centerIcon} />

                  {/* Radius Circle */}
                  <Circle
                    center={selectedCoords}
                    radius={radiusMeters}
                    pathOptions={{
                      color: '#06b6d4',
                      fillColor: '#06b6d4',
                      fillOpacity: 0.15,
                      weight: 2,
                      dashArray: '4, 4',
                    }}
                  />

                  {/* Existing cameras in preview */}
                  {previewCameras.slice(0, 50).map((cam, i) => {
                    const lat = cam.latitude || cam.location?.coordinates?.[1];
                    const lng = cam.longitude || cam.location?.coordinates?.[0];
                    const isOnline = (cam.status || '').toLowerCase() === 'online';
                    return (
                      <Marker
                        key={cam.cameraId || i}
                        position={[lat, lng]}
                        icon={cameraIcon(isOnline)}
                      >
                        <Tooltip sticky direction="top">
                          <span className="font-bold text-xs">{cam.name || cam.cameraId}</span>
                          <span className="block text-[10px] text-slate-400">
                            {isOnline ? 'Online' : 'Offline'} · {cam.type || 'Fixed'}
                          </span>
                        </Tooltip>
                      </Marker>
                    );
                  })}
                </MapContainer>

                <div className="absolute bottom-2 left-2 right-2 z-[400] px-2.5 py-1.5 rounded-xl bg-black/75 backdrop-blur-md text-white text-[10px] flex items-center justify-between">
                  <span>{previewCameras.length} cameras inside radius</span>
                  <span className="text-cyan-400 font-mono">Radius: {radiusMeters}m</span>
                </div>
              </div>
            </div>
          </div>

          {/* Generated Structured Report Section */}
          {analysisReport && (
            <div className="space-y-6 pt-4 border-t border-inherit animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                      {analysisReport.reportId}
                    </span>
                    <h4 className="text-base font-black">Surveillance Gap Analysis Report</h4>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Location: <strong className="text-white">{analysisReport.location.name}</strong> ·{' '}
                    Radius: <strong className="text-cyan-400">{analysisReport.radiusMeters}m</strong> ·{' '}
                    Generated by: <strong className="text-slate-300">{analysisReport.createdBy.name}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleViewOnGisMap}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>View on GIS Map</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenSendModal}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Report to Department</span>
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <div
                  className={`p-3 rounded-2xl border ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/4 border-white/8'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-slate-400">Total Cameras</div>
                  <div className="text-xl font-black font-mono mt-1 text-white">
                    {analysisReport.summary.totalCameras}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {analysisReport.summary.densityCamerasPerSqKm} / km²
                  </div>
                </div>

                <div
                  className={`p-3 rounded-2xl border ${
                    isLight ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-emerald-400">Active Cameras</div>
                  <div className="text-xl font-black font-mono mt-1 text-emerald-400">
                    {analysisReport.summary.activeCameras}
                  </div>
                  <div className="text-[10px] text-emerald-500/80 mt-0.5">Online Feeds</div>
                </div>

                <div
                  className={`p-3 rounded-2xl border ${
                    isLight ? 'bg-rose-50/50 border-rose-200' : 'bg-rose-500/10 border-rose-500/20'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-rose-400">Inactive</div>
                  <div className="text-xl font-black font-mono mt-1 text-rose-400">
                    {analysisReport.summary.inactiveCameras}
                  </div>
                  <div className="text-[10px] text-rose-500/80 mt-0.5">Fault / Offline</div>
                </div>

                <div
                  className={`p-3 rounded-2xl border ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/4 border-white/8'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-slate-400">Covered Zones</div>
                  <div className="text-xl font-black font-mono mt-1 text-cyan-400">
                    {analysisReport.summary.coveredZones}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Good/Optimal</div>
                </div>

                <div
                  className={`p-3 rounded-2xl border ${
                    isLight ? 'bg-amber-50/50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-amber-400">Low Coverage</div>
                  <div className="text-xl font-black font-mono mt-1 text-amber-400">
                    {analysisReport.summary.lowCoverageZones}
                  </div>
                  <div className="text-[10px] text-amber-500/80 mt-0.5">Sub-optimal</div>
                </div>

                <div
                  className={`p-3 rounded-2xl border ${
                    isLight ? 'bg-red-50/50 border-red-200' : 'bg-red-500/15 border-red-500/30'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-red-400">Critical Gaps</div>
                  <div className="text-xl font-black font-mono mt-1 text-red-400">
                    {analysisReport.summary.criticalGaps}
                  </div>
                  <div className="text-[10px] text-red-500/80 mt-0.5">&gt;600m blind spots</div>
                </div>

                <div
                  className={`p-3 rounded-2xl border flex flex-col justify-between ${
                    isLight ? 'bg-blue-50/60 border-blue-200' : 'bg-cyan-500/15 border-cyan-500/30'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-cyan-400">Coverage Score</div>
                  <div className="text-2xl font-black font-mono text-cyan-300">
                    {analysisReport.summary.coverageScore}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-1.5 overflow-hidden mt-1">
                    <div
                      className="bg-cyan-400 h-full rounded-full transition-all"
                      style={{ width: `${analysisReport.summary.coverageScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Contributing Factors Explanation */}
              <div
                className={`p-4 rounded-2xl border space-y-2 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Coverage Score Analysis Factors</span>
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                  {analysisReport.scoreFactors.map((factor, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                  {analysisReport.clusteringAnalysis?.description && (
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold">•</span>
                      <span>{analysisReport.clusteringAnalysis.description}</span>
                    </li>
                  )}
                </ul>
              </div>

              {/* Detected Gaps Details Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Identified Surveillance Coverage Gaps ({analysisReport.gaps.length})
                  </h5>
                  <span className="text-[11px] text-slate-500">Traceable to spatial grid calculations</span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-inherit">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className={isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/5 text-slate-300'}>
                        <th className="py-2.5 px-3 font-bold">Gap ID</th>
                        <th className="py-2.5 px-3 font-bold">Sector / Zone</th>
                        <th className="py-2.5 px-3 font-bold">Severity</th>
                        <th className="py-2.5 px-3 font-bold text-right">Nearby Cameras</th>
                        <th className="py-2.5 px-3 font-bold text-right">Nearest Camera</th>
                        <th className="py-2.5 px-4 font-bold">Deployment Recommendation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-inherit">
                      {analysisReport.gaps.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-6 text-center text-slate-400 text-xs">
                            No critical coverage gaps detected in this radius. Surveillance distribution is adequate.
                          </td>
                        </tr>
                      ) : (
                        analysisReport.gaps.map((gap) => (
                          <tr
                            key={gap.gapId}
                            className={`transition-colors ${
                              isLight ? 'hover:bg-slate-50' : 'hover:bg-white/3'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">{gap.gapId}</td>
                            <td className="py-2.5 px-3 font-medium">{gap.zoneName}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                  gap.severity === 'Critical'
                                    ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                    : gap.severity === 'High'
                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                }`}
                              >
                                {gap.severity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">{gap.nearbyCamerasCount}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-400">
                              {gap.nearestCameraDistanceMeters} m
                            </td>
                            <td className="py-2.5 px-4 text-slate-300 font-medium leading-snug">
                              {gap.recommendation}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Responsible Department Identification Card */}
              <div
                className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
                  isLight ? 'bg-blue-50/70 border-blue-200' : 'bg-blue-500/10 border-blue-500/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                      Identified Responsible Department
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {analysisReport.responsibleDepartment.name} ({analysisReport.responsibleDepartment.code})
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Nodal Officer: {analysisReport.responsibleDepartment.nodalOfficer?.name || 'Directorate'} ·{' '}
                      Email: {analysisReport.responsibleDepartment.contactEmail}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Switch Department:</span>
                  <ThemeDropdown
                    size="sm"
                    value={selectedDeptOverride}
                    onChange={(e) => setSelectedDeptOverride(e.target.value)}
                    options={analysisReport.candidateDepartments.map((cd) => ({
                      value: cd.code,
                      label: `${cd.name} (${cd.code})`,
                    }))}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`p-4 sm:p-5 border-t border-inherit flex flex-wrap items-center justify-between gap-3 shrink-0 ${
            isLight ? 'bg-slate-50' : 'bg-[#090d18]'
          }`}
        >
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Spatial Coverage Gap Analysis · Backed by authoritative database records</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
              }`}
            >
              Close
            </button>

            {analysisReport && (
              <button
                type="button"
                onClick={handleOpenSendModal}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send to Department</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

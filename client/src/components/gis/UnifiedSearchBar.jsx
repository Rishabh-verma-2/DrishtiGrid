import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  MapPin,
  Camera,
  X,
  Building,
  ChevronRight,
  Compass,
  Hospital,
  Shield,
  Flame,
  Plane,
  Train,
  Radio,
} from 'lucide-react';
import { OFFICIAL_DISTRICTS, normalizeAreaName, DISTRICT_ALIASES } from '../../utils/geoUtils';
import { gisAPI } from '../../api';

export default function UnifiedSearchBar({
  cameras = [],
  districts = [],
  onSelectCamera,
  onSelectArea,
  onSelectZone,
  onSelectInfrastructure,
  onSearchChange,
  onClear,
  selectedArea,
  selectedCamera,
  isLight = false,
}) {
  const [query, setQuery] = useState(selectedArea || '');
  const [isOpen, setIsOpen] = useState(false);
  const [serverResults, setServerResults] = useState(null);
  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync query when external selectedArea or selectedCamera changes
  useEffect(() => {
    if (selectedArea) {
      setQuery(selectedArea);
    } else if (selectedCamera) {
      setQuery(selectedCamera.name || selectedCamera.cameraName || selectedCamera.cameraId);
    }
  }, [selectedArea, selectedCamera]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced server search for zones, infrastructure, and geocoded entities
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setServerResults(null);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await gisAPI.search({ q, limit: 6 });
        setServerResults(res.data.data);
      } catch (err) {
        // Fallback gracefully to local search
        setServerResults(null);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  // Compute camera counts per district
  const districtCounts = useMemo(() => {
    const counts = {};
    cameras.forEach((c) => {
      const d = normalizeAreaName(c.district);
      if (d) counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }, [cameras]);

  // Index all official districts
  const allAreas = useMemo(() => {
    const list = [
      { name: 'Gujarat', label: 'Gujarat State (All Districts)', count: cameras.length, isState: true },
      ...OFFICIAL_DISTRICTS.map((d) => {
        const norm = normalizeAreaName(d);
        const count = districtCounts[norm] || 0;
        return { name: d, label: `${d} District`, count, isState: false };
      }),
    ];
    return list;
  }, [cameras.length, districtCounts]);

  // Compute local suggestions
  const localSuggestions = useMemo(() => {
    const q = normalizeAreaName(query);
    const rawQ = query.trim().toLowerCase();

    if (!q) {
      const defaults = [
        allAreas[0],
        ...allAreas.filter((a) =>
          ['Ahmedabad', 'Gandhinagar', 'Surat', 'Vadodara', 'Rajkot'].includes(a.name)
        ),
      ];
      return { areas: defaults, cameras: [] };
    }

    const matchedAreas = allAreas
      .filter((a) => {
        const norm = normalizeAreaName(a.name);
        return (
          norm.includes(q) ||
          q.includes(norm) ||
          (DISTRICT_ALIASES[q] && normalizeAreaName(DISTRICT_ALIASES[q]) === norm)
        );
      })
      .slice(0, 5);

    const matchedCameras = cameras
      .filter((c) => {
        return (
          c.name?.toLowerCase().includes(rawQ) ||
          c.cameraName?.toLowerCase().includes(rawQ) ||
          c.cameraId?.toLowerCase().includes(rawQ) ||
          c.roadName?.toLowerCase().includes(rawQ) ||
          c.landmark?.toLowerCase().includes(rawQ) ||
          c.locationName?.toLowerCase().includes(rawQ) ||
          c.policeStation?.toLowerCase().includes(rawQ)
        );
      })
      .slice(0, 5);

    return { areas: matchedAreas, cameras: matchedCameras };
  }, [query, allAreas, cameras]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    if (onSearchChange) onSearchChange(val);
  };

  const handleSelectArea = (areaName) => {
    setQuery(areaName);
    setIsOpen(false);
    onSelectArea(areaName);
  };

  const handleSelectCamera = (cam) => {
    setQuery(cam.name || cam.cameraName || cam.cameraId);
    setIsOpen(false);
    onSelectCamera(cam);
  };

  const handleSelectZone = (zone) => {
    setQuery(zone.name);
    setIsOpen(false);
    if (onSelectZone) onSelectZone(zone);
  };

  const handleSelectInfra = (asset) => {
    setQuery(asset.name);
    setIsOpen(false);
    if (onSelectInfrastructure) onSelectInfrastructure(asset);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    setServerResults(null);
    if (onSearchChange) onSearchChange('');
    onClear();
  };

  const zones = serverResults?.zones || [];
  const infrastructure = serverResults?.infrastructure || [];
  const camerasList = serverResults?.cameras?.length > 0 ? serverResults.cameras : localSuggestions.cameras;
  const areasList = localSuggestions.areas;

  return (
    <div ref={containerRef} className="relative w-56 sm:w-64 md:w-72 lg:w-80 shrink-0">
      {/* Search Input Box */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all shadow-xs ${
          isLight
            ? 'bg-white border-slate-300 text-slate-900 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20'
            : 'bg-white/5 border-white/10 text-slate-100 focus-within:border-cyan-500/60 focus-within:bg-cyan-950/20 focus-within:ring-2 focus-within:ring-cyan-500/20'
        }`}
      >
        <Search
          className={`w-4 h-4 shrink-0 ${
            selectedArea || selectedCamera
              ? 'text-cyan-400'
              : isLight
              ? 'text-slate-400'
              : 'text-slate-500'
          }`}
        />

        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder="Search location, road, station, camera, zone..."
          className="w-full bg-transparent border-none text-xs outline-none placeholder:text-slate-500"
        />

        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div
          className={`absolute top-full left-0 mt-2 z-[3000] min-w-[300px] w-80 sm:w-96 rounded-2xl border p-2 shadow-2xl backdrop-blur-xl max-h-[70vh] overflow-y-auto space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 text-xs ${
            isLight
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-400/30'
              : 'bg-[#0d121f]/95 border-white/10 text-slate-100 shadow-black/80'
          }`}
        >
          {/* 1. Districts & Areas */}
          {areasList.length > 0 && (
            <div>
              <div className={`text-[10px] font-mono uppercase px-2 py-1 flex items-center gap-1.5 ${isLight ? 'text-slate-500 font-bold' : 'text-slate-400'}`}>
                <MapPin className="w-3 h-3 text-blue-500" />
                Administrative Districts & Cities
              </div>
              <div className="space-y-0.5">
                {areasList.map((a) => (
                  <div
                    key={a.name}
                    onClick={() => handleSelectArea(a.name)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isLight ? 'hover:bg-slate-100 text-slate-900' : 'hover:bg-white/5 text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{a.name}</span>
                      <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {a.isState ? 'Statewide Grid' : 'District Boundary'}
                      </span>
                    </div>
                    <span className={`font-mono text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {a.count} cams
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Operational Zones */}
          {zones.length > 0 && (
            <div>
              <div className={`text-[10px] font-mono uppercase px-2 py-1 flex items-center gap-1.5 ${isLight ? 'text-slate-500 font-bold' : 'text-slate-400'}`}>
                <Compass className="w-3 h-3 text-indigo-500" />
                Operational Geofence Zones
              </div>
              <div className="space-y-0.5">
                {zones.map((z) => (
                  <div
                    key={z.zoneId}
                    onClick={() => handleSelectZone(z)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isLight ? 'hover:bg-slate-100 text-slate-900' : 'hover:bg-white/5 text-slate-100'
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>{z.name}</span>
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-500 font-bold">
                          {z.type}
                        </span>
                      </div>
                      <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{z.district}</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Critical Infrastructure */}
          {infrastructure.length > 0 && (
            <div>
              <div className={`text-[10px] font-mono uppercase px-2 py-1 flex items-center gap-1.5 ${isLight ? 'text-slate-500 font-bold' : 'text-slate-400'}`}>
                <Building className="w-3 h-3 text-rose-500" />
                Critical Infrastructure
              </div>
              <div className="space-y-0.5">
                {infrastructure.map((asset) => (
                  <div
                    key={asset.assetId}
                    onClick={() => handleSelectInfra(asset)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isLight ? 'hover:bg-slate-100 text-slate-900' : 'hover:bg-white/5 text-slate-100'
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>{asset.name}</span>
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-600 font-bold">
                          {asset.type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {asset.address?.area ? `${asset.address.area}, ` : ''}{asset.district}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. CCTV Cameras */}
          {camerasList.length > 0 && (
            <div>
              <div className={`text-[10px] font-mono uppercase px-2 py-1 flex items-center gap-1.5 ${isLight ? 'text-slate-500 font-bold' : 'text-slate-400'}`}>
                <Camera className="w-3 h-3 text-emerald-500" />
                CCTV Camera Nodes
              </div>
              <div className="space-y-0.5">
                {camerasList.map((c) => {
                  const isOnline = (c.status || '').toLowerCase() === 'online';
                  return (
                    <div
                      key={c.cameraId}
                      onClick={() => handleSelectCamera(c)}
                      className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                        isLight ? 'hover:bg-slate-100 text-slate-900' : 'hover:bg-white/5 text-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isOnline ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        />
                        <div>
                          <div className="font-mono font-bold flex items-center gap-2">
                            <span>{c.cameraId}</span>
                            <span className={`text-[10px] font-sans font-normal truncate max-w-[140px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                              {c.name || c.cameraName}
                            </span>
                          </div>
                          <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {c.roadName || c.locationName || c.district}
                          </div>
                        </div>
                      </div>
                      <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/5 text-slate-400'}`}>
                        {c.type || 'Fixed'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

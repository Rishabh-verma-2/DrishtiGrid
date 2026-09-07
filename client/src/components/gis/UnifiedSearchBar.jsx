import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, MapPin, Camera, X, Building, ChevronRight, CornerDownLeft, Globe } from 'lucide-react';
import { OFFICIAL_DISTRICTS, normalizeAreaName, DISTRICT_ALIASES } from '../../utils/geoUtils';

export default function UnifiedSearchBar({
  cameras = [],
  districts = [],
  onSelectCamera,
  onSelectArea,
  onSearchChange,
  onClear,
  selectedArea,
  selectedCamera,
  isLight = false,
}) {
  const [query, setQuery] = useState(selectedArea || '');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

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

  // Compute camera counts per district
  const districtCounts = useMemo(() => {
    const counts = {};
    cameras.forEach((c) => {
      const d = normalizeAreaName(c.district);
      if (d) {
        counts[d] = (counts[d] || 0) + 1;
      }
    });
    return counts;
  }, [cameras]);

  // Index all distinct official districts and areas with live camera counts
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

  // Compute matched areas and cameras
  const suggestions = useMemo(() => {
    const q = normalizeAreaName(query);
    if (!q) {
      // Default top suggestions
      const defaults = [
        allAreas[0], // Gujarat State
        ...allAreas.filter((a) =>
          ['Vadodara', 'Ahmedabad', 'Surat', 'Rajkot', 'Gandhinagar'].includes(a.name)
        ),
      ];
      return { areas: defaults, cameras: [] };
    }

    // 1. Matching official districts
    const matchedAreas = allAreas
      .filter((a) => {
        const norm = normalizeAreaName(a.name);
        return (
          norm.includes(q) ||
          q.includes(norm) ||
          (DISTRICT_ALIASES[q] && normalizeAreaName(DISTRICT_ALIASES[q]) === norm)
        );
      })
      .sort((a, b) => {
        const aNorm = normalizeAreaName(a.name);
        const bNorm = normalizeAreaName(b.name);
        const aExact = aNorm === q;
        const bExact = bNorm === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return b.count - a.count;
      })
      .slice(0, 6);

    // 2. Matching cameras
    const rawQ = query.trim().toLowerCase();
    const matchedCameras = cameras
      .filter((c) => {
        return (
          c.name?.toLowerCase().includes(rawQ) ||
          c.cameraName?.toLowerCase().includes(rawQ) ||
          c.cameraId?.toLowerCase().includes(rawQ) ||
          c.roadName?.toLowerCase().includes(rawQ) ||
          c.landmark?.toLowerCase().includes(rawQ) ||
          c.locationName?.toLowerCase().includes(rawQ)
        );
      })
      .slice(0, 6)
      .map((c) => ({
        ...c,
        type: 'camera',
      }));

    return { areas: matchedAreas, cameras: matchedCameras };
  }, [query, allAreas, cameras]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    if (onSearchChange) {
      onSearchChange(val);
    }
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

  const handleCommitSearch = () => {
    const rawQ = query.trim().toLowerCase();
    const q = normalizeAreaName(query);
    if (!rawQ) return;

    // Check if query targets Gujarat State
    if (q === 'gujarat' || q === 'gujarat state' || q === 'all') {
      handleSelectArea('Gujarat');
      return;
    }

    // Check exact or aliased match in official districts
    const exactArea = allAreas.find((a) => {
      const aNorm = normalizeAreaName(a.name);
      return (
        aNorm === q ||
        (DISTRICT_ALIASES[q] && normalizeAreaName(DISTRICT_ALIASES[q]) === aNorm)
      );
    });
    if (exactArea) {
      handleSelectArea(exactArea.name);
      return;
    }

    // Check partial district match
    const partialArea = allAreas.find((a) => {
      const aNorm = normalizeAreaName(a.name);
      return aNorm.includes(q) || q.includes(aNorm);
    });
    if (partialArea) {
      handleSelectArea(partialArea.name);
      return;
    }

    // Check camera match
    const matchedCam = cameras.find(
      (c) =>
        c.cameraId?.toLowerCase() === rawQ ||
        c.name?.toLowerCase().includes(rawQ) ||
        c.cameraName?.toLowerCase().includes(rawQ)
    );
    if (matchedCam) {
      handleSelectCamera(matchedCam);
      return;
    }

    // Fallback: pick first suggestion if present
    if (suggestions.areas.length > 0) {
      handleSelectArea(suggestions.areas[0].name);
    } else if (suggestions.cameras.length > 0) {
      handleSelectCamera(suggestions.cameras[0]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitSearch();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    if (onSearchChange) onSearchChange('');
    onClear();
  };

  return (
    <div ref={containerRef} className="relative w-72 sm:w-80 lg:w-96">
      {/* Search Input Box */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all shadow-xs ${
          isLight
            ? 'bg-white border-slate-300 text-slate-900 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20'
            : 'bg-white/5 border-white/10 text-slate-100 focus-within:border-cyan-500/60 focus-within:bg-cyan-950/20 focus-within:ring-2 focus-within:ring-cyan-500/20'
        }`}
      >
        <button
          type="button"
          onClick={handleCommitSearch}
          title="Click to search area or camera (or press Enter)"
          className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Search
            className={`w-4 h-4 ${
              selectedArea || selectedCamera
                ? 'text-cyan-400'
                : isLight
                ? 'text-slate-400 hover:text-blue-500'
                : 'text-slate-500 hover:text-cyan-400'
            }`}
          />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder="Search Area (e.g. Vadodara, Surat) or Camera..."
          className="w-full text-xs bg-transparent outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
        />

        {query ? (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-[10px] font-mono text-slate-500 px-1 py-0.5 rounded bg-white/5 border border-white/8 shrink-0">
            ↵ Enter
          </span>
        )}
      </div>

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-2 z-[2000] rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-xl transition-all ${
            isLight
              ? 'bg-white/98 border-slate-200 divide-y divide-slate-100 text-slate-800'
              : 'bg-[#0d1322]/98 border-white/10 divide-y divide-white/5 text-slate-200'
          }`}
        >
          {/* Areas Section */}
          {suggestions.areas.length > 0 && (
            <div className="p-2">
              <div
                className={`flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  isLight ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Building className="w-3 h-3 text-cyan-400" />
                  <span>Districts & Administrative Sectors</span>
                </div>
                <span className="text-[9px] text-cyan-400 font-mono">Highlight & Fit Bounds</span>
              </div>

              <div className="space-y-0.5 mt-1">
                {suggestions.areas.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => handleSelectArea(a.name)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors text-left cursor-pointer ${
                      isLight
                        ? 'hover:bg-blue-50 text-slate-800 hover:text-blue-700'
                        : 'hover:bg-cyan-500/15 text-slate-200 hover:text-cyan-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {a.isState ? (
                        <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      )}
                      <span className="font-bold text-xs">{a.label || `${a.name} District`}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        isLight
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25'
                      }`}
                    >
                      {a.count} Cams • {a.isState ? 'Full State Border' : 'Official Map Border'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cameras Section */}
          {suggestions.cameras.length > 0 && (
            <div className="p-2">
              <div
                className={`flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  isLight ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Camera className="w-3 h-3 text-emerald-400" />
                  <span>Surveillance Cameras</span>
                </div>
                <span className="text-[9px] text-slate-400 font-mono">Fly to Camera</span>
              </div>

              <div className="space-y-0.5 mt-1">
                {suggestions.cameras.map((c) => {
                  const isOnline = (c.status || '').toLowerCase() === 'online';
                  return (
                    <button
                      key={c.cameraId || c._id}
                      type="button"
                      onClick={() => handleSelectCamera(c)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors text-left cursor-pointer ${
                        isLight
                          ? 'hover:bg-blue-50 text-slate-800'
                          : 'hover:bg-white/5 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isOnline ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-red-500'
                          }`}
                        />
                        <div className="truncate">
                          <p className="font-bold truncate text-[12px]">
                            {c.name || c.cameraName || c.cameraId}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {c.roadName || c.landmark || c.locationName || c.district} • ID: {c.cameraId}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {suggestions.areas.length === 0 && suggestions.cameras.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-400">
              No matching areas or cameras found for "{query}".
            </div>
          )}
        </div>
      )}
    </div>
  );
}

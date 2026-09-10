import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, MapPin, Video, Check, X, ChevronDown, Building, Shield } from 'lucide-react';

export default function SearchableCameraSelect({
  cameras = [],
  value = '',
  onChange,
  required = false,
  isLight = false,
  placeholder = 'Select CCTV camera by ID, location, or area...',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Selected camera document
  const selectedCamera = useMemo(() => {
    if (!value) return null;
    return cameras.find((c) => c.cameraId === value || c._id === value) || null;
  }, [cameras, value]);

  // Distinct districts from cameras
  const availableDistricts = useMemo(() => {
    const set = new Set();
    cameras.forEach((c) => {
      const dist = c.district || c.address?.district;
      if (dist && dist.trim()) set.add(dist.trim());
    });
    return Array.from(set).slice(0, 6);
  }, [cameras]);

  // Filter cameras
  const filteredCameras = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return cameras.filter((c) => {
      const dist = c.district || c.address?.district || '';
      if (districtFilter !== 'ALL' && dist !== districtFilter) {
        return false;
      }
      if (!q) return true;
      const idMatch = (c.cameraId || '').toLowerCase().includes(q);
      const nameMatch = (c.name || c.cameraName || '').toLowerCase().includes(q);
      const areaAndLoc = [
        c.locationName,
        c.address?.area,
        c.address?.street,
        c.address?.full,
        c.landmark,
        c.roadName,
        c.city,
        c.address?.city,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const locMatch = areaAndLoc.includes(q);
      const distMatch = dist.toLowerCase().includes(q);
      const deptMatch = (c.departmentName || c.departmentCode || '').toLowerCase().includes(q);
      const zoneMatch = (c.zone || c.taluka || '').toLowerCase().includes(q);
      return idMatch || nameMatch || locMatch || distMatch || deptMatch || zoneMatch;
    });
  }, [cameras, searchQuery, districtFilter]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
      setDistrictFilter('ALL');
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (cam) => {
    if (onChange) {
      onChange(cam.cameraId, cam);
    }
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange('', null);
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Hidden input for HTML form validation */}
      {required && (
        <input
          type="text"
          value={value || ''}
          onChange={() => {}}
          required={required}
          className="sr-only"
          tabIndex={-1}
        />
      )}

      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 select-none ${
          isLight
            ? 'bg-white border-slate-300 hover:border-blue-500 shadow-xs'
            : 'bg-black/30 border-white/10 hover:border-blue-500/50 hover:bg-white/5'
        } ${isOpen ? 'ring-2 ring-blue-500/40 border-blue-500' : ''}`}
      >
        {selectedCamera || value ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-500">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-blue-600 dark:text-blue-400">
                  {selectedCamera?.cameraId || value}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border truncate ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-white/5 border-white/10 text-slate-300'
                }`}>
                  {selectedCamera?.departmentName || 'CCTV Surveillance'}
                </span>
                <span className="text-[10px] font-medium text-slate-500 truncate">
                  {selectedCamera?.district || selectedCamera?.address?.district || 'Gujarat'}
                </span>
              </div>
              <p className={`text-[11px] truncate font-medium mt-0.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                {selectedCamera?.name || selectedCamera?.locationName || `Selected Camera (${value})`}
                {(selectedCamera?.address?.area || selectedCamera?.locationName) &&
                  ` — ${selectedCamera?.address?.area || selectedCamera?.locationName}`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              title="Clear selected camera"
              className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400">
            <Search className="w-3.5 h-3.5" />
            <span className="truncate">{placeholder}</span>
          </div>
        )}

        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 ${
            isLight
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/50'
              : 'bg-slate-900/95 backdrop-blur-xl border-white/15 text-slate-100 shadow-black/80'
          }`}
          style={{ maxHeight: '360px' }}
        >
          {/* Search Header & Filter Bar */}
          <div className={`p-2.5 border-b space-y-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type area (e.g. SG Highway), circle, camera ID, or district..."
                className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border outline-none font-medium ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                    : 'bg-black/40 border-white/10 text-white placeholder-slate-400 focus:border-blue-500'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick District Filter Chips */}
            {availableDistricts.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar text-[10px]">
                <button
                  type="button"
                  onClick={() => setDistrictFilter('ALL')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all shrink-0 cursor-pointer ${
                    districtFilter === 'ALL'
                      ? 'bg-blue-600 text-white'
                      : isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  }`}
                >
                  All Districts
                </button>
                {availableDistricts.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDistrictFilter(d)}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all shrink-0 cursor-pointer ${
                      districtFilter === d
                        ? 'bg-blue-600 text-white'
                        : isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
            {filteredCameras.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                <p className="font-semibold">No cameras matching search</p>
                <p className="text-[11px] text-slate-500">Try searching by camera ID (e.g. GJ-DEMO), circle, or district.</p>
              </div>
            ) : (
              filteredCameras.slice(0, 50).map((cam) => {
                const isSelected = cam.cameraId === value || cam._id === value;
                const isOnline = cam.status === 'online';
                const areaOrLoc = cam.address?.area || cam.locationName || cam.landmark || cam.roadName || cam.district || 'Gujarat';

                return (
                  <div
                    key={cam._id || cam.cameraId}
                    onClick={() => handleSelect(cam)}
                    className={`p-3 text-xs transition-colors cursor-pointer flex items-center justify-between gap-3 text-left ${
                      isSelected
                        ? isLight ? 'bg-blue-50 border-l-4 border-blue-600' : 'bg-blue-500/15 border-l-4 border-blue-500'
                        : isLight ? 'hover:bg-slate-50' : 'hover:bg-white/4'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Status dot */}
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isOnline ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-rose-500'
                          }`}
                          title={isOnline ? 'Camera Online' : 'Camera Offline'}
                        />
                        {/* Camera ID */}
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {cam.cameraId}
                        </span>
                        {/* Camera Name */}
                        <span className={`font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                          {cam.name || cam.cameraId}
                        </span>
                      </div>

                      {/* Location & District */}
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                          <span className="truncate">{areaOrLoc}</span>
                          {(cam.district || cam.address?.district) && (
                            <span className="text-[10px] text-slate-400">({cam.district || cam.address?.district})</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 truncate">
                          <Building className="w-3 h-3 text-blue-500 shrink-0" />
                          <span className="truncate">{cam.departmentName || 'State Police'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Selected Checkmark */}
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {filteredCameras.length > 50 && (
              <div className="p-2 text-center text-[10px] text-slate-500 italic bg-slate-50 dark:bg-black/20">
                Showing top 50 matches. Refine search query for more specific cameras.
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className={`px-3 py-1.5 border-t flex items-center justify-between text-[10px] font-medium text-slate-500 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'
          }`}>
            <span>{filteredCameras.length} camera(s) available</span>
            <span>Click any item to select</span>
          </div>
        </div>
      )}
    </div>
  );
}

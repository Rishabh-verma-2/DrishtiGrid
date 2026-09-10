import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  Camera,
  Shield,
  Car,
  Building2,
  AlertTriangle,
  Users,
  Flame,
  Hospital,
  Compass,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  MapPin,
  Cctv,
} from 'lucide-react';

/**
 * Professional GIS Layer Control with grouped toggles
 */
export default function GISLayerControl({
  layers,
  onChangeLayer,
  onOpenZoneManager,
  isLight = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [placement, setPlacement] = useState('left');

  const toggle = (key) => {
    onChangeLayer(key, !layers[key]);
  };

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Dynamically calculate alignment so panel never overflows screen boundaries
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updatePlacement = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      // If there's less than 320px to the right edge of viewport, align to the right (right-0)
      // Otherwise align to the left (left-0) so it comfortably opens toward the center/right
      if (windowWidth - rect.left < 320) {
        setPlacement('right');
      } else {
        setPlacement('left');
      }
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
          isOpen
            ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_12px_rgba(37,99,235,0.35)]'
            : isLight
            ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
        }`}
        title="Map Layers Configuration"
      >
        <Layers className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Layers</span>
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {isOpen && (
        <div
          className={`absolute top-full ${
            placement === 'right' ? 'right-0' : 'left-0'
          } mt-2 z-[1200] w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/50'
              : 'bg-[#0d121f]/95 border-white/10 text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.6)]'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-inherit">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-extrabold uppercase tracking-wider">Map Layers</span>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
              Command GIS
            </span>
          </div>

          <div className="mt-3 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* 1. CAMERAS GROUP */}
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Cameras
              </p>
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Cctv className="w-3.5 h-3.5 text-emerald-400" />
                    <span>All Cameras</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.allCameras}
                    onChange={() => toggle('allCameras')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer pl-6">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Shield className="w-3 h-3 text-blue-400" />
                    <span>Police Units</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.policeCameras}
                    onChange={() => toggle('policeCameras')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer pl-6">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Car className="w-3 h-3 text-amber-400" />
                    <span>Traffic Police</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.trafficCameras}
                    onChange={() => toggle('trafficCameras')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer pl-6">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Building2 className="w-3 h-3 text-purple-400" />
                    <span>Municipal Corp</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.municipalCameras}
                    onChange={() => toggle('municipalCameras')}
                    className="rounded accent-blue-600"
                  />
                </label>
              </div>
            </div>

            {/* 2. INTELLIGENCE GROUP */}
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Intelligence Overlays
              </p>
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span>Active Incidents</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.incidents}
                    onChange={() => toggle('incidents')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>Crowd Density Hotspots</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.crowdHotspots}
                    onChange={() => toggle('crowdHotspots')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Car className="w-3.5 h-3.5 text-cyan-400" />
                    <span>ANPR Watchlist Matches</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.anprActivity}
                    onChange={() => toggle('anprActivity')}
                    className="rounded accent-blue-600"
                  />
                </label>
              </div>
            </div>

            {/* 3. INFRASTRUCTURE GROUP */}
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Critical Infrastructure
              </p>
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>All Infrastructure Assets</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.infrastructure}
                    onChange={() => toggle('infrastructure')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer pl-6">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Hospital className="w-3 h-3 text-rose-400" />
                    <span>Hospitals (Civil / SVP)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.hospitals}
                    onChange={() => toggle('hospitals')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer pl-6">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Shield className="w-3 h-3 text-blue-400" />
                    <span>Police Stations & HQs</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.policeStations}
                    onChange={() => toggle('policeStations')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer pl-6">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Flame className="w-3 h-3 text-amber-500" />
                    <span>Fire Stations (AFES)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.fireStations}
                    onChange={() => toggle('fireStations')}
                    className="rounded accent-blue-600"
                  />
                </label>
              </div>
            </div>

            {/* 4. PLANNING & ZONES GROUP */}
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Planning & Operations
              </p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <Compass className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Operational Geofence Zones</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {onOpenZoneManager && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenZoneManager();
                        }}
                        className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                        title="Open Zone Management Hub"
                      >
                        Manage
                      </button>
                    )}
                    <input
                      type="checkbox"
                      checked={layers.operationalZones}
                      onChange={() => toggle('operationalZones')}
                      className="rounded accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Optical CCTV Coverage Buffers</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.coverageBuffers}
                    onChange={() => toggle('coverageBuffers')}
                    className="rounded accent-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span>Coverage Gaps Analysis</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={layers.coverageGaps}
                    onChange={() => toggle('coverageGaps')}
                    className="rounded accent-blue-600"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

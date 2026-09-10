import React, { useState } from 'react';
import { gisAPI } from '../../api';
import {
  Navigation,
  X,
  Compass,
  Camera,
  MapPin,
  Play,
  ArrowRight,
  Sliders,
  CheckCircle2,
  XCircle,
  Video,
  FileText,
  Eye,
  Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { isCameraInUserDepartment } from '../../utils/permissions';

const PRESET_ROUTES = [
  {
    name: 'Police Commissionerate -> Sola Civil Hospital',
    start: [72.5928, 23.0569], // Shahibaug CP Office
    destination: [72.5255, 23.0768], // Sola Civil Hospital
  },
  {
    name: 'Kalupur Railway Station -> Airport (Hansol)',
    start: [72.601, 23.0234], // Kalupur Railway
    destination: [72.6347, 23.0772], // Airport
  },
  {
    name: 'Swarnim Sankul Secretariat -> High Court of Gujarat',
    start: [72.65, 23.2167], // Gandhinagar Secretariat
    destination: [72.5273, 23.0805], // Gujarat High Court
  },
  {
    name: 'Ellis Bridge -> Vastrapur Lake',
    start: [72.5732, 23.0227], // Ellis Bridge
    destination: [72.5284, 23.036], // Vastrapur PS / Lake
  },
];

export default function RouteCameraFinderModal({
  isOpen,
  onClose,
  onApplyRoute,
  onOpenStream,
  onRequestFootage,
  isLight = false,
  user = null,
  userRole = 'POLICE',
}) {
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(String(user?.role || userRole || '').toUpperCase());
  const [startCoords, setStartCoords] = useState('72.5928, 23.0569');
  const [destCoords, setDestCoords] = useState('72.5255, 23.0768');
  const [corridorWidth, setCorridorWidth] = useState(150); // meters
  const [isSearching, setIsSearching] = useState(false);
  const [routeResults, setRouteResults] = useState(null);

  if (!isOpen) return null;

  const parseCoords = (str) => {
    const parts = str.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]]; // [lng, lat]
    }
    return null;
  };

  const handleApplyPreset = (preset) => {
    setStartCoords(`${preset.start[0]}, ${preset.start[1]}`);
    setDestCoords(`${preset.destination[0]}, ${preset.destination[1]}`);
  };

  const handleDiscover = async () => {
    const start = parseCoords(startCoords);
    const dest = parseCoords(destCoords);

    if (!start || !dest) {
      toast.error('Please specify valid start and destination [longitude, latitude] coordinates');
      return;
    }

    try {
      setIsSearching(true);
      const res = await gisAPI.discoverRouteCameras({
        start,
        destination: dest,
        corridorWidth,
      });

      const data = res.data.data;
      setRouteResults(data);

      if (onApplyRoute && data.routeGeometry) {
        onApplyRoute({
          geometry: data.routeGeometry,
          cameras: data.cameras,
        });
      }

      toast.success(`Discovered ${data.summary.totalCamerasFound} cameras along route corridor!`);
    } catch (err) {
      console.error('Route discovery error:', err);
      toast.error('Failed to calculate route cameras. Please check coordinates.');
    } finally {
      setIsSearching(false);
    }
  };

  const canRequestFootage = ['ADMIN', 'POLICE'].includes((userRole || '').toUpperCase());

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-[#0d121f] border-white/10 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-inherit flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 flex items-center justify-center">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide">Route-Based Camera Discovery</h3>
              <p className="text-[11px] text-slate-400">
                Identify cameras sequentially along arterial transit corridors
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Presets */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 block">
              Official Government Preset Corridors:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ROUTES.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handleApplyPreset(p)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Coordinate Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 mb-1 block flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400" /> Start Point [Longitude, Latitude]
              </label>
              <input
                type="text"
                value={startCoords}
                onChange={(e) => setStartCoords(e.target.value)}
                placeholder="72.5928, 23.0569"
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none transition-colors ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 focus:border-blue-500'
                    : 'bg-black/30 border-white/10 focus:border-blue-500'
                }`}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 mb-1 block flex items-center gap-1">
                <MapPin className="w-3 h-3 text-red-400" /> Destination [Longitude, Latitude]
              </label>
              <input
                type="text"
                value={destCoords}
                onChange={(e) => setDestCoords(e.target.value)}
                placeholder="72.5255, 23.0768"
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none transition-colors ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 focus:border-blue-500'
                    : 'bg-black/30 border-white/10 focus:border-blue-500'
                }`}
              />
            </div>
          </div>

          {/* Corridor Width Slider */}
          <div className="p-3 rounded-xl border border-inherit space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                Corridor Buffer Width:
              </span>
              <span className="font-mono font-bold text-blue-400">{corridorWidth} meters</span>
            </div>
            <input
              type="range"
              min={50}
              max={500}
              step={25}
              value={corridorWidth}
              onChange={(e) => setCorridorWidth(parseInt(e.target.value, 10))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>50m (Direct Roadway)</span>
              <span>250m (Intersection Arteries)</span>
              <span>500m (Wide Corridor)</span>
            </div>
          </div>

          {/* Action Trigger */}
          <button
            onClick={handleDiscover}
            disabled={isSearching}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-blue-500/20"
          >
            {isSearching ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Calculate Route & Discover Cameras</span>
          </button>

          {/* Route Results Display */}
          {routeResults && (
            <div className="space-y-3 pt-2 border-t border-inherit animate-in fade-in duration-300">
              {/* Summary Bar */}
              <div
                className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                  isLight ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                }`}
              >
                <div>
                  <div className="font-bold text-sm">
                    {routeResults.summary.totalCamerasFound} cameras found along route
                  </div>
                  <div className="text-[11px] opacity-80">
                    Distance: {routeResults.summary.routeDistanceKm} km • Approx. {routeResults.summary.estimatedDurationMinutes} mins
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {routeResults.summary.onlineCameras} Online
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30">
                    {routeResults.summary.offlineCameras} Offline
                  </span>
                </div>
              </div>

              {/* Cameras Sequential Table */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {routeResults.cameras.map((c, idx) => {
                  const isOnline = (c.status || '').toLowerCase() === 'online';
                  return (
                    <div
                      key={c.cameraId}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-slate-500 w-5">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isOnline ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-red-500'
                          }`}
                        />
                        <div>
                          <div className="font-mono font-bold flex items-center gap-2">
                            <span>{c.cameraId}</span>
                            <span className="text-[10px] font-sans font-normal text-slate-400">
                              ({c.department})
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {c.location} • {c.distanceFromRouteMeters}m from route
                            {c.direction ? ` • Facing ${c.direction}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOnline && onOpenStream && isCameraInUserDepartment(user, c.camera || c) ? (
                          <button
                            onClick={() => onOpenStream(c.camera || c)}
                            title="Open Live Feed (Own Department)"
                            className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 cursor-pointer"
                          >
                            <Video className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          !isAdmin && onRequestFootage && (
                            <button
                              onClick={() => onRequestFootage(c.camera || c)}
                              title={`Inter-Department Camera (${c.department || 'Other Dept'}) - Request Footage from Admin`}
                              className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 cursor-pointer flex items-center"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

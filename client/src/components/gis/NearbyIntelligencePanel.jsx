import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gisAPI } from '../../api';
import {
  Radio,
  X,
  Camera,
  AlertTriangle,
  Shield,
  Hospital,
  Flame,
  Users,
  Car,
  Video,
  FileText,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Navigation,
  Lock,
} from 'lucide-react';
import { isCameraInUserDepartment } from '../../utils/permissions';

export default function NearbyIntelligencePanel({
  isOpen,
  onClose,
  coordinates, // [lat, lng]
  locationName = 'Selected Geographic Location',
  onOpenStream,
  onRequestFootage,
  onFitNearbyBounds,
  isLight = false,
  user = null,
  userRole = 'POLICE',
}) {
  const [radius, setRadius] = useState(1000); // meters
  const [showCamerasList, setShowCamerasList] = useState(false);

  const [lat, lng] = coordinates || [23.0225, 72.5714];

  const { data: nearbyData, isLoading } = useQuery({
    queryKey: ['gis-nearby', lat, lng, radius],
    queryFn: async () => {
      const res = await gisAPI.getNearby({
        lat,
        lng,
        radius,
      });
      return res.data.data;
    },
    enabled: isOpen && !!lat && !!lng,
    staleTime: 15000,
  });

  if (!isOpen) return null;

  const counts = nearbyData?.counts || {
    cameras: 0,
    onlineCameras: 0,
    offlineCameras: 0,
    activeIncidents: 0,
    policeStations: 0,
    hospitals: 0,
    fireStations: 0,
    crowdEvents: 0,
    anprMatches: 0,
  };

  const cameras = nearbyData?.cameras || [];

  const handleFitBounds = () => {
    if (onFitNearbyBounds && cameras.length > 0) {
      const bounds = cameras.map((c) => [
        c.latitude || c.location?.coordinates?.[1],
        c.longitude || c.location?.coordinates?.[0],
      ]);
      onFitNearbyBounds(bounds);
    }
  };

  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes((userRole || '').toUpperCase());
  const canRequestFootage = !isAdmin && ['POLICE', 'TRAFFIC_POLICE'].includes((userRole || '').toUpperCase());

  return (
    <div className="absolute bottom-6 right-6 z-[1150] w-96 max-w-[92vw] rounded-2xl border shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-3 duration-300 overflow-hidden">
      <div
        className={`flex flex-col ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-800'
            : 'bg-[#0d121f]/95 border-white/10 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-inherit flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 flex items-center justify-center">
              <Radio className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Nearby Intelligence
              </div>
              <div className="text-xs font-bold truncate max-w-[200px]">
                {locationName}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {cameras.length > 0 && (
              <button
                onClick={handleFitBounds}
                title="Fit map bounds to nearby cameras"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Radius Selector Pills */}
        <div className="px-3.5 pt-3 pb-2 flex items-center justify-between border-b border-inherit bg-black/5">
          <span className="text-[11px] text-slate-400 font-medium">Search Radius:</span>
          <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-inherit">
            {[
              { label: '500m', val: 500 },
              { label: '1 km', val: 1000 },
              { label: '2 km', val: 2000 },
              { label: '5 km', val: 5000 },
            ].map((pill) => (
              <button
                key={pill.val}
                onClick={() => setRadius(pill.val)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  radius === pill.val
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Counts Matrix */}
        <div className="p-3.5 space-y-2 text-xs">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Within {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}</span>
            {isLoading && <span className="text-cyan-400 animate-pulse">Calculating spatial radius...</span>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl border border-inherit flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Camera className="w-3 h-3 text-blue-400" />
                Cameras
              </span>
              <span className="font-mono font-bold">{counts.cameras}</span>
            </div>

            <div className="p-2 rounded-xl border border-inherit flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                Active Incidents
              </span>
              <span className="font-mono font-bold text-red-500">{counts.activeIncidents}</span>
            </div>

            <div className="p-2 rounded-xl border border-inherit flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Shield className="w-3 h-3 text-blue-400" />
                Police Stations
              </span>
              <span className="font-mono font-bold">{counts.policeStations}</span>
            </div>

            <div className="p-2 rounded-xl border border-inherit flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Hospital className="w-3 h-3 text-rose-400" />
                Hospitals
              </span>
              <span className="font-mono font-bold">{counts.hospitals}</span>
            </div>

            <div className="p-2 rounded-xl border border-inherit flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Flame className="w-3 h-3 text-amber-500" />
                Fire Stations
              </span>
              <span className="font-mono font-bold">{counts.fireStations}</span>
            </div>

            <div className="p-2 rounded-xl border border-inherit flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Users className="w-3 h-3 text-amber-400" />
                Crowd Events
              </span>
              <span className="font-mono font-bold">{counts.crowdEvents}</span>
            </div>

            <div className="p-2 rounded-xl border border-inherit flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Car className="w-3 h-3 text-cyan-400" />
                ANPR Matches
              </span>
              <span className="font-mono font-bold">{counts.anprMatches}</span>
            </div>

            <div className="p-2 rounded-xl border border-inherit flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Camera className="w-3 h-3 text-red-400" />
                Offline Cameras
              </span>
              <span className="font-mono font-bold text-red-400">{counts.offlineCameras}</span>
            </div>
          </div>

          {/* Zero results graceful expand buttons */}
          {counts.cameras === 0 && !isLoading && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center space-y-2 mt-2">
              <p className="text-[11px] text-amber-400 font-medium">
                No cameras found within {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}.
              </p>
              <div className="flex items-center justify-center gap-2">
                {radius < 2000 && (
                  <button
                    onClick={() => setRadius(2000)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold border border-amber-500/30 cursor-pointer"
                  >
                    Expand to 2 km
                  </button>
                )}
                {radius < 5000 && (
                  <button
                    onClick={() => setRadius(5000)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold border border-amber-500/30 cursor-pointer"
                  >
                    Expand to 5 km
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Toggle View Cameras List */}
          {cameras.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowCamerasList(!showCamerasList)}
                className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-between transition-all cursor-pointer shadow-md shadow-blue-500/20"
              >
                <span className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  View Nearby Cameras ({cameras.length})
                </span>
                {showCamerasList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* Cameras list accordion */}
          {showCamerasList && cameras.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 mt-2 animate-in fade-in duration-200">
              {cameras.slice(0, 10).map((cam) => {
                const isOnline = (cam.status || '').toLowerCase() === 'online';
                return (
                  <div
                    key={cam.cameraId}
                    className={`p-2 rounded-lg border flex items-center justify-between text-[11px] ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isOnline ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-red-500'
                        }`}
                      />
                      <div>
                        <div className="font-mono font-bold">{cam.cameraId}</div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">
                          {cam.distanceMeters}m • {cam.name || cam.roadName || 'Junction'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isOnline && onOpenStream && isCameraInUserDepartment(user, cam) ? (
                        <button
                          onClick={() => onOpenStream(cam)}
                          title="Open Live CCTV Stream (Own Department)"
                          className="p-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 cursor-pointer"
                        >
                          <Video className="w-3 h-3" />
                        </button>
                      ) : (
                        !isAdmin && onRequestFootage && (
                          <button
                            onClick={() => onRequestFootage(cam)}
                            title={`Inter-Department Camera (${cam.departmentName || 'Other Dept'}) - Click to Request Footage from Admin`}
                            className="p-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 cursor-pointer flex items-center gap-0.5"
                          >
                            <Lock className="w-3 h-3" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

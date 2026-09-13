import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cameraAPI, streamAPI } from '../../api';
import useAuthStore from '../../store/authStore';
import useSocketStore from '../../store/socketStore';
import { useThemeStore } from '../../store/themeStore';
import CameraPlayer from '../cameras/CameraPlayer';
import {
  Camera,
  Activity,
  Shield,
  Clock,
  Car,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  ChevronLeft,
  XCircle,
  Eye,
  Radio,
  SlidersHorizontal,
  Layers,
  Sparkles,
  ArrowRight,
  Info,
  Bus,
  Truck,
  Bike,
  MapPin,
  Target,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeDropdown from '../common/ThemeDropdown';

// 30 Sentinel Cameras Provided by Gujarat Sentinel CCTV Grid
const DEFAULT_SENTINEL_FEEDS = [
  { id: 'cam01', name: '01 Chiman bhai Bridge', district: 'Ahmedabad' },
  { id: 'cam02', name: '02 Janpath', district: 'Ahmedabad' },
  { id: 'cam03', name: '03 O.N.G.C. Office', district: 'Ahmedabad' },
  { id: 'cam04', name: '04 Paldi Circle', district: 'Ahmedabad' },
  { id: 'cam05', name: '05 Visat teen Rasta', district: 'Ahmedabad' },
  { id: 'cam06', name: '06 Timbavadi gate-Junagadh', district: 'Junagadh' },
  { id: 'cam07', name: '07 hero-showroom-gir-somnath', district: 'Gir Somnath' },
  { id: 'cam08', name: '08 majewadi-gate-junagadh', district: 'Junagadh' },
  { id: 'cam09', name: '09 new-bypass-near-by-circle-junagadh-2', district: 'Junagadh' },
  { id: 'cam10', name: '10 char-chowk-road-2-junagadh', district: 'Junagadh' },
  { id: 'cam11', name: '11 dolatpara-junagadh', district: 'Junagadh' },
  { id: 'cam12', name: '12 Tri Mandir Adalaj Tollnaka', district: 'Gandhinagar' },
  { id: 'cam13', name: '13 CN Vidhyalaya', district: 'Ahmedabad' },
  { id: 'cam14', name: '14 Delight RLVD', district: 'Ahmedabad' },
  { id: 'cam15', name: '15 Suvidha park', district: 'Ahmedabad' },
  { id: 'cam16', name: '16 Visat P2', district: 'Ahmedabad' },
  { id: 'cam17', name: '17 Rajkot Bus Port CCTV', district: 'Rajkot' },
  { id: 'cam18', name: '18 Rajkot CCTV', district: 'Rajkot' },
  { id: 'cam19', name: '19 KHAPARIA GRAM PANCHAYAT', district: 'Navsari' },
  { id: 'cam20', name: '20 Mohanpura', district: 'Gandhinagar' },
  { id: 'cam21', name: '23 Patan Dethali Char Rasta', district: 'Patan' },
  { id: 'cam22', name: '28 BK Mervada tran Rasta', district: 'Banaskantha' },
  { id: 'cam23', name: '30 kheram', district: 'Mehsana' },
  { id: 'cam24', name: '33 dehgam', district: 'Gandhinagar' },
  { id: 'cam25', name: '34 dhanori', district: 'Navsari' },
  { id: 'cam26', name: '35 TANKAL', district: 'Surat' },
  { id: 'cam27', name: '36 bilimora', district: 'Navsari' },
  { id: 'cam28', name: '37 bilimora', district: 'Navsari' },
  { id: 'cam29', name: '38 bilimora', district: 'Navsari' },
  { id: 'cam30', name: 'Gandhidham Rambaugh p2', district: 'Kutch' },
];

/**
 * Render appropriate icon for vehicle category
 */
function getVehicleIcon(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('bus')) return <Bus className="w-3.5 h-3.5" />;
  if (t.includes('truck') || t.includes('lorry')) return <Truck className="w-3.5 h-3.5" />;
  if (t.includes('bike') || t.includes('motorcycle') || t.includes('scooter') || t.includes('two')) {
    return <Bike className="w-3.5 h-3.5" />;
  }
  if (t.includes('rickshaw') || t.includes('auto') || t.includes('three')) {
    // Clean SVG Auto-Rickshaw icon
    return (
      <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="18" r="2.2" />
        <circle cx="18" cy="18" r="2.2" />
        <path d="M6 16h12" />
        <path d="M7.5 16l1.5-7h6l2 7" />
        <path d="M4 11h4" />
        <path d="M12 9V5h3" />
      </svg>
    );
  }
  return <Car className="w-3.5 h-3.5" />;
}

/**
 * Render compact color indicator dot
 */
function getVehicleColorBadge(color) {
  const c = String(color || '').toLowerCase();
  let bg = '#94a3b8';
  if (c.includes('white')) bg = '#ffffff';
  else if (c.includes('black')) bg = '#1e293b';
  else if (c.includes('red') || c.includes('maroon')) bg = '#ef4444';
  else if (c.includes('blue')) bg = '#3b82f6';
  else if (c.includes('yellow')) bg = '#eab308';
  else if (c.includes('green')) bg = '#22c55e';
  else if (c.includes('silver') || c.includes('grey') || c.includes('gray')) bg = '#cbd5e1';

  return (
    <span
      className="w-2 h-2 rounded-full border border-white/50 shadow-xs inline-block shrink-0"
      style={{ backgroundColor: bg }}
      title={color}
    />
  );
}

/**
 * Real-time HUD overlay: Live dynamic vehicle marker moving in coordination with CCTV footage
 */
function LiveVehicleTrackingOverlay({
  detections = [],
  showPins = true,
  selectedTrackId,
  onSelectTrack,
}) {
  const activeMarkersRef = useRef(new Map());
  const [, setFrameTick] = useState(0);

  // Synchronize incoming detection and track events into active dynamic markers
  useEffect(() => {
    if (!showPins || !detections || detections.length === 0) return;

    const map = activeMarkersRef.current;
    const now = performance.now();

    for (let idx = 0; idx < detections.length; idx++) {
      const item = detections[idx];
      const trackId = item.tracking?.trackId || item.eventId;
      if (!trackId) continue;

      const rawBox = item.vehicleBbox || item.vehicle?.bbox;
      const frameW = item.frameResolution?.width || 960;
      const frameH = item.frameResolution?.height || 540;

      let targetX = 25 + ((idx * 22) % 55);
      let targetY = 32 + ((idx * 15) % 45);

      if (rawBox) {
        const rx = Number(rawBox.x !== undefined ? rawBox.x : (rawBox.x1 || 0));
        const ry = Number(rawBox.y !== undefined ? rawBox.y : (rawBox.y1 || 0));
        const rw = Number(rawBox.width !== undefined ? rawBox.width : ((rawBox.x2 || 0) - rx));
        const rh = Number(rawBox.height !== undefined ? rawBox.height : ((rawBox.y2 || 0) - ry));

        if (rw > 0 && rh > 0) {
          targetX = ((rx + rw / 2) / frameW) * 100;
          targetY = ((ry + rh * 0.35) / frameH) * 100; // Focal point at vehicle upper center/hood
        }
      }

      // Compute velocity in % of screen per second
      let vx = 0;
      let vy = 0;
      if (item.velocity && (item.velocity.vx || item.velocity.vy)) {
        vx = (item.velocity.vx / frameW) * 100;
        vy = (item.velocity.vy / frameH) * 100;
      } else {
        // Perspective highway momentum: vehicles travel down the screen towards camera
        vy = targetY < 50 ? 3.5 : 5.0;
        vx = (targetX - 50) * 0.05;
      }

      const vehicleType = item.vehicle?.type || 'Car';
      const vehicleColor = item.vehicle?.color || 'Unknown';
      const plateText = item.plate?.text;
      const isReadable = Boolean(plateText && !item.plate?.unreadable);

      if (map.has(trackId)) {
        const existing = map.get(trackId);
        existing.targetX = targetX;
        existing.targetY = targetY;
        existing.vx = vx;
        existing.vy = vy;
        existing.lastSeenTimestamp = now;
        existing.plateText = plateText;
        existing.isReadable = isReadable;
        existing.vehicleType = vehicleType;
        existing.vehicleColor = vehicleColor;
      } else {
        map.set(trackId, {
          id: trackId,
          currentX: targetX,
          currentY: targetY,
          targetX,
          targetY,
          vx,
          vy,
          lastSeenTimestamp: now,
          opacity: 0.1,
          plateText,
          isReadable,
          vehicleType,
          vehicleColor,
        });
      }
    }
  }, [detections, showPins]);

  // 60 FPS RequestAnimationFrame continuous motion interpolation loop
  useEffect(() => {
    if (!showPins) return;

    let animId;
    let lastTime = performance.now();

    const renderLoop = (currentTime) => {
      const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      const map = activeMarkersRef.current;
      let changed = false;

      for (const [id, marker] of map.entries()) {
        const ageSec = (currentTime - marker.lastSeenTimestamp) / 1000;

        // Smooth coordinate interpolation (lerp towards target) + velocity extrapolation
        const lerpSpeed = Math.min(1, dt * 7.5);
        marker.currentX += (marker.targetX - marker.currentX) * lerpSpeed;
        marker.currentY += (marker.targetY - marker.currentY) * lerpSpeed;

        // Coordinate extrapolation in real time with CCTV video motion
        marker.currentX += marker.vx * dt * 0.65;
        marker.currentY += marker.vy * dt * 0.65;

        // Smooth fade-in & graceful exit
        if (ageSec > 3.5 || marker.currentY > 96 || marker.currentY < 4 || marker.currentX > 96 || marker.currentX < 4) {
          marker.opacity -= dt * 1.6;
          if (marker.opacity <= 0) {
            map.delete(id);
            changed = true;
            continue;
          }
        } else {
          marker.opacity = Math.min(1, marker.opacity + dt * 4.0);
        }
        changed = true;
      }

      if (changed) {
        setFrameTick((t) => (t + 1) % 10000);
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [showPins]);

  if (!showPins) return null;

  const markersList = Array.from(activeMarkersRef.current.values());
  if (markersList.length === 0) return null;

  return (
    <div className="absolute inset-0 z-18 pointer-events-none overflow-hidden select-none">
      {markersList.map((marker) => {
        const isSelected = selectedTrackId === marker.id;
        const clampedLeft = Math.max(3, Math.min(94, marker.currentX));
        const clampedTop = Math.max(8, Math.min(92, marker.currentY));

        return (
          <div
            key={marker.id}
            className="absolute pointer-events-auto cursor-pointer transition-opacity duration-150 select-none z-20 group/marker"
            style={{
              left: `${clampedLeft}%`,
              top: `${clampedTop}%`,
              transform: 'translate(-50%, -100%)',
              opacity: marker.opacity,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectTrack?.(isSelected ? null : marker.id);
            }}
          >
            {/* 1. Sleek Floating Marker Capsule */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold tracking-tight backdrop-blur-md shadow-2xl border transition-all ${
                isSelected
                  ? 'bg-cyan-500 text-slate-950 border-white shadow-[0_0_24px_#06b6d4] scale-110 ring-2 ring-cyan-400'
                  : marker.isReadable
                  ? 'bg-slate-950/90 text-cyan-300 border-cyan-400/80 hover:border-white hover:scale-105 shadow-[0_4px_16px_rgba(0,0,0,0.8)]'
                  : 'bg-slate-950/90 text-amber-300 border-amber-400/80 hover:border-white hover:scale-105 shadow-[0_4px_16px_rgba(0,0,0,0.8)]'
              }`}
            >
              {/* Live Tracking Pulse Beacon */}
              <span
                className={`w-1.5 h-1.5 rounded-full animate-ping shrink-0 ${
                  isSelected ? 'bg-slate-950' : marker.isReadable ? 'bg-cyan-400' : 'bg-amber-400'
                }`}
              />

              {/* Vehicle Category Icon */}
              <span className={isSelected ? 'text-slate-950' : marker.isReadable ? 'text-cyan-400' : 'text-amber-400'}>
                {getVehicleIcon(marker.vehicleType)}
              </span>

              {/* Proper Vehicle Name (CAR, BUS, TRUCK, RICKSHAW, BIKE) */}
              <span className="uppercase font-black text-[10px] tracking-wider">
                {marker.vehicleType}
              </span>

              {/* Color swatch dot */}
              {getVehicleColorBadge(marker.vehicleColor)}

              <span className="opacity-40">•</span>

              {/* License Plate Text or Passing Badge */}
              {marker.isReadable ? (
                <span
                  className={`font-black text-[11px] tracking-wider px-1.5 py-0.2 rounded ${
                    isSelected ? 'bg-black text-cyan-300' : 'text-white'
                  }`}
                >
                  {marker.plateText}
                </span>
              ) : (
                <span
                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase ${
                    isSelected
                      ? 'bg-amber-400 text-black border-black'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  PASSING
                </span>
              )}
            </div>

            {/* 2. Precision Pointer Needle pointing directly to vehicle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-2.5 h-2.5 rotate-45 -mt-1 border-r-2 border-b-2 shadow-md ${
                  isSelected
                    ? 'bg-cyan-500 border-white'
                    : marker.isReadable
                    ? 'bg-slate-950 border-cyan-400'
                    : 'bg-slate-950 border-amber-400'
                }`}
              />
            </div>

            {/* 3. Focal Pinpoint & Sonar Ring directly on the moving vehicle */}
            <div className="relative flex items-center justify-center -mt-0.5">
              <div
                className={`w-3 h-3 rounded-full border border-white shadow-md transition-transform group-hover/marker:scale-125 ${
                  isSelected
                    ? 'bg-cyan-400 shadow-[0_0_14px_#06b6d4]'
                    : marker.isReadable
                    ? 'bg-cyan-400 shadow-[0_0_10px_#22d3ee]'
                    : 'bg-amber-400 shadow-[0_0_10px_#f59e0b]'
                }`}
              />
              <div
                className={`absolute w-6 h-6 rounded-full border opacity-75 animate-ping pointer-events-none ${
                  isSelected ? 'border-cyan-300' : marker.isReadable ? 'border-cyan-400' : 'border-amber-400'
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LiveANPRWorkspace({
  cameraId: propCameraId,
  onBackToGIS,
  isLight: propIsLight,
}) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const { theme } = useThemeStore();
  const isLight = propIsLight ?? (theme === 'light');

  const [cameraId, setCameraId] = useState(propCameraId || 'cam01');
  const [camera, setCamera] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(null);
  const [streamStatus, setStreamStatus] = useState('CONNECTING'); // 'CONNECTING' | 'LIVE' | 'DUMMY' | 'OFFLINE' | 'ERROR'
  const [detections, setDetections] = useState([]);
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sentinelFeeds, setSentinelFeeds] = useState(DEFAULT_SENTINEL_FEEDS);
  const [dbCameras, setDbCameras] = useState([]);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [showLivePins, setShowLivePins] = useState(true);
  const [selectedTrackId, setSelectedTrackId] = useState(null);

  // Sync propCameraId changes
  useEffect(() => {
    if (propCameraId && propCameraId !== cameraId) {
      setCameraId(propCameraId);
    }
  }, [propCameraId]);

  // Fetch Sentinel 30 feeds + GIS database cameras for quick switcher dropdown
  useEffect(() => {
    streamAPI
      .getFeeds()
      .then((res) => {
        if (res.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
          setSentinelFeeds(res.data.data);
        }
      })
      .catch(() => {});

    cameraAPI
      .getAll({ limit: 100 })
      .then((res) => {
        setDbCameras(res.data?.data || []);
      })
      .catch(() => {});
  }, []);

  // 1. Authoritative camera metadata fetch & RBAC check
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setAccessDenied(null);
    setDetections([]);

    cameraAPI
      .getById(`${cameraId}?action=analyze`)
      .then(async (res) => {
        if (isCancelled) return;
        const camData = res.data?.data;
        setCamera(camData);

        const src = camData.sourceType || 'DUMMY';
        if (src === 'DUMMY') {
          setStreamStatus('DUMMY');
        } else if (camData.status === 'offline') {
          setStreamStatus('OFFLINE');
        } else {
          setStreamStatus('LIVE');
          // Start stream session on backend
          try {
            await cameraAPI.startStream(camData.cameraId);
          } catch (err) {
            console.warn('Could not start stream session:', err.message);
          }
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Camera load error:', err);
        if (err.response?.status === 403) {
          setAccessDenied(
            err.response?.data?.message ||
              'You do not have permission to analyze this camera.'
          );
        } else if (err.response?.status === 404) {
          setAccessDenied(`Camera '${cameraId}' was not found in the registry.`);
        } else {
          setAccessDenied('Failed to load camera details. Please try again.');
        }
        setStreamStatus('ERROR');
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
      if (cameraId) {
        cameraAPI.stopStream(cameraId).catch(() => {});
      }
    };
  }, [cameraId]);

  // 2. Socket.io Subscription & Live Event Listeners
  useEffect(() => {
    if (!socket || !camera || camera.sourceType === 'DUMMY' || accessDenied) {
      return;
    }

    const cid = camera.cameraId;

    // Join authorized camera room
    socket.emit('camera:subscribe', cid);

    const handleNewDetection = (evt) => {
      if (evt.cameraId !== cid) return;
      setDetections((prev) => {
        const index = prev.findIndex(
          (d) =>
            d.eventId === evt.eventId ||
            (d.tracking?.trackId &&
              d.tracking?.trackId === evt.tracking?.trackId)
        );
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            ...evt,
            vehicleBbox: evt.vehicleBbox || updated[index].vehicleBbox,
            velocity: evt.velocity || updated[index].velocity,
            frameResolution: evt.frameResolution || updated[index].frameResolution,
            lastSeen: evt.lastSeen || new Date().toISOString(),
          };
          return updated;
        }
        return [evt, ...prev].slice(0, 50); // Bound memory history to 50
      });
    };

    const handleTrackUpdate = (evt) => {
      if (evt.cameraId !== cid) return;
      setDetections((prev) =>
        prev.map((item) => {
          if (
            (item.tracking?.trackId &&
              item.tracking?.trackId === evt.tracking?.trackId) ||
            item.eventId === evt.eventId
          ) {
            return {
              ...item,
              plate: evt.plate || item.plate,
              vehicle: evt.vehicle || item.vehicle,
              vehicleBbox: evt.vehicleBbox || item.vehicleBbox,
              velocity: evt.velocity || item.velocity,
              frameResolution: evt.frameResolution || item.frameResolution,
              lastSeen: evt.lastSeen || new Date().toISOString(),
              frameCount: evt.frameCount || item.frameCount + 1,
              plateCrop: evt.plateCrop || item.plateCrop,
              isPassingVehicle: evt.isPassingVehicle !== undefined ? evt.isPassingVehicle : item.isPassingVehicle,
            };
          }
          return item;
        })
      );
    };

    const handleStatusUpdate = (statusEvt) => {
      if (statusEvt.cameraId !== cid) return;
      if (statusEvt.status) {
        setStreamStatus(statusEvt.status);
      }
    };

    const handleSocketError = (errEvt) => {
      if (errEvt.code === 'CAMERA_ACCESS_DENIED') {
        toast.error(`Socket Authorization Error: ${errEvt.message}`);
        setAccessDenied(errEvt.message);
      }
    };

    socket.on('anpr:detection', handleNewDetection);
    socket.on('anpr:track_update', handleTrackUpdate);
    socket.on('anpr:stream_status', handleStatusUpdate);
    socket.on('error', handleSocketError);

    return () => {
      socket.off('anpr:detection', handleNewDetection);
      socket.off('anpr:track_update', handleTrackUpdate);
      socket.off('anpr:stream_status', handleStatusUpdate);
      socket.off('error', handleSocketError);
      socket.emit('camera:unsubscribe', cid);
    };
  }, [socket, camera, accessDenied]);

  // Filtered detections
  const filteredDetections = useMemo(() => {
    return detections.filter((d) => {
      const type = (d.vehicle?.type || '').toLowerCase();
      if (filterType === 'READABLE') {
        if (!d.plate?.text || d.plate?.unreadable) return false;
      } else if (filterType === 'OBSCURED') {
        if (d.plate?.text && !d.plate?.unreadable) return false;
      } else if (filterType === 'RICKSHAW') {
        if (!type.includes('rickshaw') && !type.includes('auto') && !type.includes('three')) return false;
      } else if (filterType === 'BIKE') {
        if (!type.includes('bike') && !type.includes('motorcycle') && !type.includes('two')) return false;
      } else if (filterType !== 'ALL') {
        if (!type.includes(filterType.toLowerCase())) return false;
      }

      if (searchQuery) {
        const q = searchQuery.toUpperCase();
        const p = (d.plate?.text || '').toUpperCase();
        const c = (d.vehicle?.color || '').toUpperCase();
        const vt = (d.vehicle?.type || '').toUpperCase();
        if (!p.includes(q) && !c.includes(q) && !vt.includes(q)) return false;
      }
      return true;
    });
  }, [detections, filterType, searchQuery]);

  // Real-Time Passing Vehicle Telemetry & Statistics
  const vehicleStats = useMemo(() => {
    let totalPassing = detections.length;
    let readablePlates = 0;
    let obscuredPlates = 0;
    let cars = 0;
    let bikes = 0;
    let rickshaws = 0;
    let buses = 0;
    let trucks = 0;

    for (const d of detections) {
      const isUnreadable = d.plate?.unreadable || !d.plate?.text || d.isPassingVehicle;
      if (isUnreadable) {
        obscuredPlates++;
      } else {
        readablePlates++;
      }

      const type = (d.vehicle?.type || '').toLowerCase();
      if (type.includes('rickshaw') || type.includes('auto') || type.includes('three')) {
        rickshaws++;
      } else if (type.includes('motorcycle') || type.includes('bike') || type.includes('two')) {
        bikes++;
      } else if (type.includes('bus')) {
        buses++;
      } else if (type.includes('truck') || type.includes('lorry')) {
        trucks++;
      } else {
        cars++;
      }
    }

    return {
      totalPassing,
      readablePlates,
      obscuredPlates,
      cars,
      bikes,
      rickshaws,
      buses,
      trucks,
    };
  }, [detections]);

  // Status Badge Helper
  const renderStatusBadge = () => {
    if (streamStatus === 'DUMMY' || camera?.sourceType === 'DUMMY') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
            isLight
              ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          DEMONSTRATION DATA
        </span>
      );
    }
    if (streamStatus === 'LIVE') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
            isLight
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-xs'
              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/20'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          LIVE STREAM
        </span>
      );
    }
    if (streamStatus === 'OFFLINE') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
            isLight
              ? 'bg-red-100 text-red-900 border-red-300'
              : 'bg-red-500/15 text-red-400 border-red-500/30'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-red-500" />
          OFFLINE
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
          isLight
            ? 'bg-cyan-100 text-cyan-900 border-cyan-300'
            : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
        }`}
      >
        <RefreshCw className="w-3 h-3 animate-spin" />
        CONNECTING
      </span>
    );
  };

  // Format time (HH:mm:ss)
  const formatTime = (isoString) => {
    if (!isoString) return '--:--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-IN', { hour12: false });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] p-8 space-y-4">
        <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin" />
        <p className="text-sm font-semibold text-slate-400">
          Loading camera metadata and verifying security clearance...
        </p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 rounded-3xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
          <XCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-red-400">
            403 CAMERA_ACCESS_DENIED
          </h3>
          <p className="text-sm text-slate-300 max-w-lg mx-auto">
            {accessDenied}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => onBackToGIS ? onBackToGIS() : navigate('/gis-map')}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white transition-colors flex items-center gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
            Return to GIS Map
          </button>
          <button
            onClick={() =>
              navigate(`/footage-requests?requestCam=${encodeURIComponent(cameraId)}`)
            }
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Submit Footage Request to Admin
          </button>
        </div>
      </div>
    );
  }

  const isDummy = camera?.sourceType === 'DUMMY' || streamStatus === 'DUMMY';

  return (
    <div className="space-y-4">
      {/* ── Top Command Bar ─────────────────────────────────────────── */}
      <div
        className={`p-4 rounded-2xl border backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
            : 'bg-slate-900/80 border-white/10 text-white shadow-xl'
        }`}
      >
        <div className="flex items-center gap-3">
          {onBackToGIS && (
            <button
              onClick={onBackToGIS}
              className={`p-2 rounded-xl border transition-colors ${
                isLight
                  ? 'border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                  : 'border-white/10 hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
              title="Return to GIS Map"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded border ${
                  isLight
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                }`}
              >
                {camera?.cameraId}
              </span>
              <h2 className={`text-base font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                ANPR — {camera?.name || 'CCTV Stream'}
              </h2>
            </div>
            <div
              className={`flex items-center gap-3 text-xs mt-0.5 ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              <span>
                Department:{' '}
                <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200'}>
                  {camera?.departmentName || camera?.departmentCode}
                </strong>
              </span>
              <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>•</span>
              <span>
                District:{' '}
                <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200'}>
                  {camera?.district || 'Ahmedabad'}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {renderStatusBadge()}

          {/* Camera Switcher Dropdown */}
          <ThemeDropdown
            size="sm"
            value={camera?.cameraId || cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            options={[
              ...sentinelFeeds.map((c) => ({
                value: c.id,
                label: `${c.id.toUpperCase()} — ${c.name} (${c.district || 'Gujarat'})`,
              })),
              ...dbCameras.map((c) => ({
                value: c.cameraId,
                label: `${c.cameraId} — ${c.name?.slice(0, 26)}`,
              })),
            ]}
            className="w-[280px]"
            dropdownClassName="w-[320px]"
          />
        </div>
      </div>

      {/* ── Two-Panel Workspace Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT PANEL: CCTV Video (Col span 7 or 8) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          <div
            className={`rounded-2xl border overflow-hidden backdrop-blur-xl relative transition-colors ${
              isLight
                ? 'bg-white border-slate-200 shadow-sm'
                : 'bg-slate-950/90 border-white/10 shadow-2xl'
            }`}
          >
            {/* Header / Sub-status */}
            <div
              className={`px-4 py-2.5 border-b flex items-center justify-between text-xs font-semibold ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'border-inherit text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-500" />
                <span className={isLight ? 'text-slate-800 font-bold' : 'text-slate-300'}>
                  PRIMARY SURVEILLANCE FEED
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLivePins((p) => !p)}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer border ${
                    showLivePins
                      ? isLight
                        ? 'bg-blue-100 text-blue-900 border-blue-300 shadow-xs'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs shadow-cyan-500/10'
                      : isLight
                      ? 'bg-slate-100 text-slate-500 border-slate-200'
                      : 'bg-white/5 text-slate-400 border-white/10'
                  }`}
                  title="Toggle live vehicle tracking pins on surveillance feed"
                >
                  <MapPin className="w-3 h-3 text-cyan-400" />
                  <span>AI PINS: {showLivePins ? 'ON' : 'OFF'}</span>
                </button>

                <span
                  className={`text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded border ${
                    isLight
                      ? 'bg-white text-slate-700 border-slate-200 font-medium'
                      : 'bg-white/5 border-white/10 text-slate-300'
                  }`}
                >
                  {camera?.resolution || '1080P'} • {camera?.type || 'FIXED'}
                </span>
              </div>
            </div>

            {/* Video or Dummy Overlay - Protected by cctv-dark-scope */}
            <div className="cctv-dark-scope relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {isDummy ? (
                // ── Professional Dummy State Overlay (Requirement #6 & #25) ──
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950/40 relative">
                  {/* Subtle Grid Background Pattern */}
                  <div
                    className="absolute inset-0 opacity-10 pointer-events-none"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)',
                      backgroundSize: '24px 24px',
                    }}
                  />

                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-500/10">
                    <Radio className="w-8 h-8 opacity-80" />
                  </div>

                  <h3
                    style={{ color: '#ffffff' }}
                    className="text-xl font-extrabold tracking-wider mb-2"
                  >
                    LIVE FEED UNAVAILABLE
                  </h3>

                  <p
                    style={{ color: '#cbd5e1' }}
                    className="text-xs max-w-md leading-relaxed mb-6 font-medium"
                  >
                    This camera is currently configured with{' '}
                    <span style={{ color: '#fbbf24' }} className="font-bold">
                      demonstration data
                    </span>
                    . Live CCTV and ANPR analysis will become available once the physical camera stream is connected.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono">
                    <span
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.22)',
                        color: '#fbbf24',
                        borderColor: 'rgba(245, 158, 11, 0.45)',
                      }}
                      className="px-3 py-1 rounded-lg border font-bold shadow-xs"
                    >
                      SOURCE: DEMONSTRATION DATA
                    </span>
                    <span
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.22)',
                        color: '#f87171',
                        borderColor: 'rgba(239, 68, 68, 0.45)',
                      }}
                      className="px-3 py-1 rounded-lg border font-bold shadow-xs"
                    >
                      STATUS: NOT LIVE
                    </span>
                    <span
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.12)',
                        color: '#f1f5f9',
                        borderColor: 'rgba(255, 255, 255, 0.28)',
                      }}
                      className="px-3 py-1 rounded-lg border font-bold shadow-xs"
                    >
                      NODE: {camera?.cameraId}
                    </span>
                  </div>
                </div>
              ) : (
                // ── Real Camera Stream with Live Vehicle Pins Overlay ──
                <div className="w-full h-full relative">
                  <CameraPlayer
                    streamId={camera?.streamId || 'cam01'}
                    cameraName={camera?.name || 'Surveillance Feed'}
                    autoPlay={true}
                    aspectRatio="aspect-video"
                    showControls={true}
                  >
                    <LiveVehicleTrackingOverlay
                      detections={detections}
                      showPins={showLivePins}
                      selectedTrackId={selectedTrackId}
                      onSelectTrack={setSelectedTrackId}
                    />
                  </CameraPlayer>
                </div>
              )}
            </div>

            {/* Video Footer Telemetry */}
            <div
              className={`p-3 px-4 border-t flex flex-wrap items-center justify-between text-xs gap-2 ${
                isLight
                  ? 'bg-slate-50/80 border-slate-200 text-slate-600'
                  : 'border-inherit text-slate-400'
              }`}
            >
              <div className="flex items-center gap-4">
                <span>
                  Optical Radius:{' '}
                  <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200'}>
                    50m
                  </strong>
                </span>
                <span>
                  FOV:{' '}
                  <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200'}>
                    90°
                  </strong>
                </span>
                <span>
                  Mounting Height:{' '}
                  <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200'}>
                    6.5m
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span>Inference Sampling:</span>
                <strong
                  className={
                    isLight
                      ? isDummy
                        ? 'text-amber-700 font-extrabold'
                        : 'text-blue-700 font-extrabold'
                      : 'text-cyan-400 font-bold'
                  }
                >
                  {isDummy ? 'STANDBY' : '1 FPS (CONTINUOUS)'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Live Detection Panel (Col span 5 or 4) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">
          <div
            className={`rounded-2xl border backdrop-blur-xl flex flex-col transition-colors min-h-[550px] ${
              isLight
                ? 'bg-white border-slate-200 shadow-sm'
                : 'bg-slate-900/85 border-white/10 shadow-2xl'
            }`}
          >
            {/* Detection Header */}
            <div
              className={`p-4 border-b space-y-3 ${
                isLight ? 'bg-slate-50/70 border-slate-200' : 'border-inherit'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-500" />
                  <h3
                    className={`text-sm font-bold tracking-tight ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    LIVE ANPR DETECTIONS
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE SYNC
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold border ${
                      isLight
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                    }`}
                  >
                    {filteredDetections.length} Tracked
                  </span>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search plate / color..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-blue-500'
                        : 'bg-white/5 border-white/10 text-white placeholder:text-slate-500'
                    }`}
                  />
                </div>
                <ThemeDropdown
                  size="sm"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Types' },
                    { value: 'CAR', label: 'Car' },
                    { value: 'BIKE', label: 'Bike' },
                    { value: 'RICKSHAW', label: 'Rickshaw' },
                    { value: 'BUS', label: 'Bus' },
                    { value: 'TRUCK', label: 'Truck' },
                    { value: 'READABLE', label: 'Plate Readable' },
                    { value: 'OBSCURED', label: 'Obscured Plates' },
                  ]}
                  className="min-w-[130px]"
                />
              </div>
              {/* Real-Time Passing Vehicle Telemetry & Counter */}
              <div
                className={`p-3 rounded-xl border space-y-2 transition-colors ${
                  isLight
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Car className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
                    <span className={`text-xs font-bold tracking-wide ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                      PASSING VEHICLE COUNTER
                    </span>
                  </div>
                  <span
                    className={`text-xs font-mono font-black px-2.5 py-0.5 rounded-full border ${
                      isLight
                        ? 'bg-blue-100 text-blue-900 border-blue-300'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    }`}
                  >
                    {vehicleStats.totalPassing} Passed
                  </span>
                </div>

                {/* Category breakdown pills (Cars, Bikes, Rickshaws, Buses, Trucks) */}
                <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-mono">
                  <div className={`p-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className={isLight ? 'text-slate-500' : 'text-slate-400'}>Cars</div>
                    <div className={`font-black text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{vehicleStats.cars}</div>
                  </div>
                  <div className={`p-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className={isLight ? 'text-slate-500' : 'text-slate-400'}>Bikes</div>
                    <div className={`font-black text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{vehicleStats.bikes}</div>
                  </div>
                  <div className={`p-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className={isLight ? 'text-slate-500' : 'text-slate-400'}>Rickshaw</div>
                    <div className={`font-black text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{vehicleStats.rickshaws || 0}</div>
                  </div>
                  <div className={`p-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className={isLight ? 'text-slate-500' : 'text-slate-400'}>Buses</div>
                    <div className={`font-black text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{vehicleStats.buses}</div>
                  </div>
                  <div className={`p-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className={isLight ? 'text-slate-500' : 'text-slate-400'}>Trucks</div>
                    <div className={`font-black text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{vehicleStats.trucks}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detections Stream List */}
            <div className="flex-1 p-3 space-y-2.5 overflow-y-auto max-h-[580px]">
              {isDummy ? (
                // Dummy Mode Notice
                <div className="p-8 text-center space-y-3 my-auto">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto ${
                      isLight
                        ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-xs'
                        : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                    }`}
                  >
                    <Info className="w-6 h-6" />
                  </div>
                  <h4
                    className={`text-sm font-bold ${
                      isLight ? 'text-slate-900' : 'text-slate-200'
                    }`}
                  >
                    Waiting for Live Stream Connection
                  </h4>
                  <p
                    className={`text-xs max-w-xs mx-auto leading-relaxed ${
                      isLight ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    This camera does not currently emit a live RTSP/HLS stream. Detection cards will appear automatically when connected to real hardware.
                  </p>
                </div>
              ) : filteredDetections.length === 0 ? (
                // Waiting State
                <div className="p-10 text-center space-y-3 my-auto">
                  <div className="w-12 h-12 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mx-auto opacity-75" />
                  <p
                    className={`text-xs font-semibold ${
                      isLight ? 'text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    Live feed active · Monitoring traffic...
                  </p>
                  <p
                    className={`text-[11px] max-w-xs mx-auto ${
                      isLight ? 'text-slate-500' : 'text-slate-500'
                    }`}
                  >
                    Continuous AI pipeline actively counting passing vehicles and tracking live pins.
                  </p>
                </div>
              ) : (
                // Continuous Normalized Cards (Requirements #11, #12, #13, #20)
                filteredDetections.map((item) => {
                  const trackId = item.tracking?.trackId || item.eventId;
                  const isSelected = selectedTrackId === trackId;
                  const plateText = item.plate?.text;
                  const isUnreadable = !plateText || item.plate?.unreadable;
                  const confidence = Math.round((item.plate?.confidence || 0.85) * 100);
                  const vehicleType = item.vehicle?.type || 'Car';
                  const vehicleColor = item.vehicle?.color || 'Unknown';

                  return (
                    <div
                      key={trackId}
                      onClick={() => setSelectedTrackId(isSelected ? null : trackId)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? isLight
                            ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-400/40 shadow-sm'
                            : 'bg-cyan-950/40 border-cyan-400 ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-500/10'
                          : isLight
                          ? 'bg-slate-50/80 border-slate-200 hover:bg-white hover:border-blue-300 hover:shadow-xs'
                          : 'bg-white/[0.03] border-white/10 hover:border-cyan-500/40 hover:bg-white/[0.06]'
                      }`}
                    >
                      {/* Card Header: Plate & Confidence */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          {isUnreadable ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-xs font-black font-mono tracking-wider px-2 py-0.5 rounded border uppercase flex items-center gap-1.5 ${
                                  isLight
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                }`}
                              >
                                {getVehicleIcon(vehicleType)}
                                PASSING {vehicleType.toUpperCase()}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  isLight
                                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                                    : 'bg-white/10 text-slate-300 border-white/20'
                                }`}
                              >
                                Plate Obscured · Inconclusive OCR
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-base font-mono font-extrabold tracking-wider px-2 py-0.5 rounded border ${
                                  isLight
                                    ? 'bg-slate-900 text-cyan-300 border-slate-700'
                                    : 'bg-cyan-950/50 text-cyan-400 border-cyan-500/30'
                                }`}
                              >
                                {plateText}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  isLight
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                }`}
                              >
                                {confidence}% conf
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {(Date.now() - new Date(item.lastSeen || item.timestamp).getTime()) < 3500 && (
                            <span className="flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              LIVE
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-mono ${
                              isLight ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {formatTime(item.lastSeen || item.timestamp)}
                          </span>
                        </div>
                      </div>

                      {/* Card Details: Vehicle Type & Color */}
                      <div
                        className={`flex items-center gap-3 text-xs mb-2 ${
                          isLight ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1 font-bold">
                          {getVehicleIcon(vehicleType)}
                          <span>{vehicleType}</span>
                        </span>
                        <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>•</span>
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-slate-300"
                            style={{
                              backgroundColor:
                                vehicleColor.toLowerCase() === 'white'
                                  ? '#ffffff'
                                  : vehicleColor.toLowerCase() === 'black'
                                  ? '#000000'
                                  : vehicleColor.toLowerCase() === 'red'
                                  ? '#ef4444'
                                  : vehicleColor.toLowerCase() === 'blue'
                                  ? '#3b82f6'
                                  : '#94a3b8',
                            }}
                          />
                          {vehicleColor}
                        </span>
                      </div>

                      {/* Temporal Deduplication Details (Requirement #12) */}
                      <div
                        className={`flex items-center justify-between text-[10px] font-mono pt-2 border-t ${
                          isLight
                            ? 'border-slate-200/80 text-slate-500'
                            : 'border-inherit text-slate-400'
                        }`}
                      >
                        <span>First seen: {formatTime(item.firstSeen)}</span>
                        <span>Last seen: {formatTime(item.lastSeen)}</span>
                        <span
                          className={
                            isLight ? 'text-blue-700 font-bold' : 'text-cyan-400 font-bold'
                          }
                        >
                          {item.frameCount || 1} frames
                        </span>
                      </div>

                      {/* Crop Preview if present */}
                      {item.plateCrop && (
                        <div
                          className={`mt-2 pt-2 border-t ${
                            isLight ? 'border-slate-200/80' : 'border-inherit'
                          }`}
                        >
                          <img
                            src={
                              item.plateCrop.startsWith('data:')
                                ? item.plateCrop
                                : `data:image/jpeg;base64,${item.plateCrop}`
                            }
                            alt="Plate crop"
                            className={`h-7 rounded border object-contain ${
                              isLight
                                ? 'border-slate-300 bg-slate-950'
                                : 'border-white/10 bg-black/40'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Clear or Pause Controls Footer */}
            <div
              className={`p-3 border-t flex items-center justify-between text-xs ${
                isLight ? 'border-slate-200 bg-slate-50/50' : 'border-inherit'
              }`}
            >
              <button
                onClick={() => setDetections([])}
                className={`transition-colors ${
                  isLight
                    ? 'text-slate-600 hover:text-slate-900 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Clear current stream buffer"
              >
                Clear buffer
              </button>
              <span
                className={`text-[11px] font-mono ${
                  isLight ? 'text-slate-500' : 'text-slate-500'
                }`}
              >
                {detections.length} vehicles detected
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

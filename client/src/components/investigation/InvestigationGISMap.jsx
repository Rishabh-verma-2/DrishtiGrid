import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Camera, Navigation, Shield, Eye } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import 'leaflet/dist/leaflet.css';

// Custom icons using L.divIcon
const createCustomMarker = (color, glyphText) => {
  return L.divIcon({
    className: 'custom-investigation-pin',
    html: `
      <div style="
        background: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.4);
        border: 2px solid white;
      ">
        <span style="
          transform: rotate(45deg);
          color: white;
          font-weight: 900;
          font-size: 11px;
          font-family: monospace;
        ">${glyphText}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

function MapBoundsController({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true });
    }
  }, [map, points]);
  return null;
}

export default function InvestigationGISMap({ firCase, results = [] }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  // Origin location
  const originCoords = firCase?.location?.coordinates || [73.1812, 22.3072]; // [lng, lat]
  const originPoint = {
    lat: originCoords[1],
    lng: originCoords[0],
    label: firCase?.policeStation || 'Originating Police Station',
    type: 'ORIGIN',
  };

  // Detection points from results
  const detectionPoints = results.map((r, i) => {
    const coords = r.coordinates || [73.1812, 22.3072];
    return {
      lat: coords[1],
      lng: coords[0],
      label: `Detection #${i + 1}: ${r.cameraName || r.cameraId}`,
      locationName: r.locationName,
      timestamp: r.detectionTimestamp,
      confidence: r.aiConfidence,
      cameraId: r.cameraId,
      type: 'DETECTION',
      index: i + 1,
    };
  });

  const allPoints = [originPoint, ...detectionPoints];

  // Polyline trail connecting origin to chronological detections
  const polylinePositions = allPoints.map((p) => [p.lat, p.lng]);

  const tileUrl = isLight
    ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  return (
    <div className="w-full h-full min-h-[440px] rounded-2xl overflow-hidden border border-white/10 relative shadow-inner">
      {/* Map Legend Overlay */}
      <div className="absolute top-3 left-3 z-[1000] p-3 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 text-white text-xs space-y-1.5 shadow-lg">
        <p className="font-bold text-[11px] uppercase tracking-wider text-slate-300">Investigation Trail</p>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 border border-white shrink-0" />
          <span>Origin Police Station</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white shrink-0" />
          <span>CCTV AI Detection Nodes</span>
        </div>
        {detectionPoints.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-cyan-400 shrink-0" />
            <span>Flight / Travel Direction</span>
          </div>
        )}
      </div>

      <MapContainer
        center={[originPoint.lat, originPoint.lng]}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url={tileUrl}
        />

        <MapBoundsController points={allPoints} />

        {/* Origin Station Marker */}
        <Marker
          position={[originPoint.lat, originPoint.lng]}
          icon={createCustomMarker('#3b82f6', 'PS')}
        >
          <Popup>
            <div className="text-xs p-1">
              <span className="font-mono text-[9px] uppercase text-blue-600 font-bold block">Originating Station</span>
              <h5 className="font-bold text-sm text-slate-900">{firCase?.policeStation}</h5>
              <p className="text-slate-600 mt-0.5">{firCase?.locationAddress}</p>
              <p className="text-slate-500 text-[10px] mt-1">FIR No: {firCase?.firNumber}</p>
            </div>
          </Popup>
        </Marker>

        {/* Detection Markers */}
        {detectionPoints.map((det, i) => (
          <Marker
            key={i}
            position={[det.lat, det.lng]}
            icon={createCustomMarker('#10b981', String(det.index))}
          >
            <Popup>
              <div className="text-xs p-1">
                <span className="font-mono text-[9px] uppercase text-emerald-600 font-bold block">
                  AI Match #{det.index} ({det.confidence}%)
                </span>
                <h5 className="font-bold text-sm text-slate-900">{det.cameraId}</h5>
                <p className="text-slate-700 font-semibold">{det.locationName}</p>
                <p className="text-slate-500 text-[10px] mt-1">
                  Detected: {new Date(det.timestamp).toLocaleString()}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Travel Path Polyline */}
        {polylinePositions.length > 1 && (
          <Polyline
            positions={polylinePositions}
            pathOptions={{
              color: '#06b6d4',
              weight: 3,
              dashArray: '6, 8',
              opacity: 0.85,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

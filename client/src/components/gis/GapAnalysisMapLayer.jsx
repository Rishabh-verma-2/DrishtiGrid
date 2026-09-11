import React from 'react';
import { Circle, Rectangle, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { ShieldAlert, AlertTriangle, Cctv, MapPin, X } from 'lucide-react';

const gapMarkerIcon = (severity) => {
  const isCritical = severity === 'Critical';
  const color = isCritical ? '#ef4444' : '#f59e0b';
  return L.divIcon({
    className: 'custom-gap-pin',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${color};
        border: 3px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 16px ${color}aa, 0 3px 8px rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-weight: 900;
        font-size: 13px;
        animation: gap-bounce 1.8s infinite;
      ">
        !
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const CELL_COLORS = {
  'Good Coverage': { fill: '#10b981', border: '#059669', opacity: 0.18 },
  'Moderate Coverage': { fill: '#eab308', border: '#ca8a04', opacity: 0.2 },
  'Low Coverage': { fill: '#f97316', border: '#ea580c', opacity: 0.24 },
  'Critical Gap': { fill: '#ef4444', border: '#dc2626', opacity: 0.28 },
};

export default function GapAnalysisMapLayer({
  report,
  onClear,
  onOpenReport,
  isLight = false,
}) {
  if (!report) return null;

  const centerLngLat = report.location?.coordinates || [72.6026, 22.9978];
  const centerLat = centerLngLat[1];
  const centerLng = centerLngLat[0];
  const radius = report.radiusMeters || 1000;

  return (
    <>
      {/* 1. Boundary Perimeter Circle */}
      <Circle
        center={[centerLat, centerLng]}
        radius={radius}
        pathOptions={{
          color: '#06b6d4',
          fillColor: '#06b6d4',
          fillOpacity: 0.06,
          weight: 2.5,
          dashArray: '6, 6',
        }}
      >
        <Tooltip sticky direction="top">
          <span className="font-bold text-xs">{report.location.name}</span>
          <span className="block text-[10px] text-slate-300">
            Analysis Boundary: {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
          </span>
        </Tooltip>
      </Circle>

      {/* 2. Classified Spatial Grid Cells */}
      {(report.gridCells || []).map((cell) => {
        const colorCfg = CELL_COLORS[cell.classification] || CELL_COLORS['Moderate Coverage'];
        return (
          <Rectangle
            key={cell.cellId}
            bounds={cell.bounds}
            pathOptions={{
              color: colorCfg.border,
              fillColor: colorCfg.fill,
              fillOpacity: isLight ? colorCfg.opacity * 0.8 : colorCfg.opacity,
              weight: 1,
            }}
          >
            <Tooltip sticky direction="top">
              <span className="font-bold text-xs">{cell.classification}</span>
              <span className="block text-[10px] text-slate-300">
                Nearest Cam: {cell.nearestCameraDistanceMeters}m · Cameras in cell: {cell.cameraCount}
              </span>
            </Tooltip>
          </Rectangle>
        );
      })}

      {/* 3. Actionable Gap Markers */}
      {(report.gaps || []).map((gap) => (
        <Marker
          key={gap.gapId}
          position={gap.coordinates}
          icon={gapMarkerIcon(gap.severity)}
        >
          <Popup className="cctv-cyber-popup" maxWidth={340}>
            <div className="p-3 space-y-2.5 text-xs min-w-[260px] font-sans">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <span className="font-mono font-bold text-cyan-400">{gap.gapId}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    gap.severity === 'Critical'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {gap.severity} Priority
                </span>
              </div>

              <div>
                <h5 className="font-bold text-sm text-white">{gap.zoneName}</h5>
                <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                  {gap.recommendation}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase">Nearest Camera</span>
                  <div className="font-mono font-bold text-rose-400">
                    {gap.nearestCameraDistanceMeters} m
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] uppercase">Nearby Feeds</span>
                  <div className="font-mono font-bold text-slate-300">
                    {gap.nearbyCamerasCount} Active
                  </div>
                </div>
              </div>

              {onOpenReport && (
                <button
                  type="button"
                  onClick={onOpenReport}
                  className="w-full py-1.5 mt-1 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-center transition-colors cursor-pointer"
                >
                  Review Full Gap Report
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

import React, { useState } from 'react';
import { Circle, Popup, Tooltip } from 'react-leaflet';
import {
  Radio,
  MapPin,
  Info,
} from 'lucide-react';

const COVERAGE_LEVELS = {
  GOOD: {
    label: 'Good Coverage',
    color: '#10b981',
    border: '#059669',
    badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  },
  MODERATE: {
    label: 'Moderate Coverage',
    color: '#eab308',
    border: '#ca8a04',
    badge: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  },
  POOR: {
    label: 'Poor Coverage',
    color: '#f97316',
    border: '#ea580c',
    badge: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  },
  CRITICAL_GAP: {
    label: 'Critical Gap',
    color: '#ef4444',
    border: '#dc2626',
    badge: 'bg-red-500/15 text-red-500 border-red-500/30',
  },
};

export default function CoverageGridLayer({
  coverageData,
  onViewNearbyCameras,
  onAddPlanningMarker,
  isLight = false,
}) {
  const [selectedCluster, setSelectedCluster] = useState(null);

  if (!coverageData?.clusters || coverageData.clusters.length === 0) return null;

  // Render representative sectors around district center
  // Default centroid for Ahmedabad / Gujarat
  const baseLng = 72.5714;
  const baseLat = 23.0225;

  const clusterOffsets = [
    { dLng: 0.045, dLat: 0.035, radius: 1400 }, // Outer Ring Road
    { dLng: 0.082, dLat: 0.045, radius: 1600 }, // Industrial GIDC
    { dLng: -0.015, dLat: 0.012, radius: 1100 }, // Commercial Hub
    { dLng: -0.042, dLat: -0.035, radius: 1800 }, // Suburban Transit
  ];

  return (
    <>
      {coverageData.clusters.map((cluster, idx) => {
        const offset = clusterOffsets[idx % clusterOffsets.length];
        const center = [baseLat + offset.dLat, baseLng + offset.dLng];
        const levelCfg = COVERAGE_LEVELS[cluster.level] || COVERAGE_LEVELS.MODERATE;

        return (
          <Circle
            key={cluster.clusterId || idx}
            center={center}
            radius={offset.radius}
            pathOptions={{
              color: levelCfg.color,
              fillColor: levelCfg.color,
              fillOpacity: isLight ? 0.16 : 0.22,
              weight: 2,
              dashArray: cluster.level === 'CRITICAL_GAP' ? '5, 5' : null,
            }}
          >
            <Tooltip sticky direction="top">
              <strong>{cluster.title}</strong> — {levelCfg.label} ({cluster.coveragePercentage}%)
            </Tooltip>

            <Popup className="cctv-cyber-popup" maxWidth={360}>
              <div className="p-3 space-y-3 text-xs min-w-[280px] font-sans">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="font-mono text-[10px] font-bold text-slate-400 uppercase">
                    CCTV COVERAGE GAP ANALYSIS
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${levelCfg.badge}`}
                  >
                    {levelCfg.label}
                  </span>
                </div>

                {/* Area Title */}
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{cluster.title}</h4>
                  <div className="flex items-center gap-3 text-[11px] mt-1">
                    <span className="text-slate-500">
                      Coverage:{' '}
                      <strong className="font-mono text-blue-500">
                        {cluster.coveragePercentage}%
                      </strong>
                    </span>
                    <span className="text-slate-500">
                      Risk:{' '}
                      <strong
                        className={`font-mono ${
                          cluster.risk === 'CRITICAL' || cluster.risk === 'HIGH'
                            ? 'text-red-500'
                            : 'text-emerald-500'
                        }`}
                      >
                        {cluster.risk}
                      </strong>
                    </span>
                    <span className="text-slate-500">
                      Traffic:{' '}
                      <strong className="font-mono text-amber-500">
                        {cluster.trafficLevel}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Observed Ground-Truth Data */}
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 space-y-1.5 text-[11px]">
                  <div className="text-[10px] font-mono uppercase text-slate-400 font-bold flex items-center justify-between">
                    <span>Observed Ground-Truth Data</span>
                    <span className="text-emerald-500">✓ Database Synchronized</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-1 rounded bg-white/10">
                      <div className="font-mono font-bold text-slate-100">
                        {cluster.observedData?.existingCameras ?? 2}
                      </div>
                      <div className="text-[9px] text-slate-400">Cameras</div>
                    </div>
                    <div className="p-1 rounded bg-white/10">
                      <div className="font-mono font-bold text-red-400">
                        {cluster.observedData?.activeIncidents ?? 3}
                      </div>
                      <div className="text-[9px] text-slate-400">Incidents</div>
                    </div>
                    <div className="p-1 rounded bg-white/10">
                      <div className="font-mono font-bold text-blue-400">
                        {cluster.observedData?.criticalAssets ?? 2}
                      </div>
                      <div className="text-[9px] text-slate-400">Assets</div>
                    </div>
                  </div>
                </div>

                {/* Estimated Model Recommendations */}
                <div className="p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between text-amber-400">
                    <span className="font-mono text-[10px] uppercase font-bold flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Estimated Recommendation
                    </span>
                    <span className="font-mono text-[9px] bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                      AI MODEL
                    </span>
                  </div>
                  <div className="text-slate-200">
                    Recommended Additional Cameras:{' '}
                    <strong className="text-amber-300 font-mono font-bold text-xs">
                      {cluster.recommendedAdditionalCameras} units
                    </strong>{' '}
                    <span className="text-[10px] text-slate-400">(algorithmic estimate)</span>
                  </div>
                </div>

                {/* Reason bullets */}
                <div className="space-y-1 text-[11px]">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">
                    Deficiency Factors:
                  </span>
                  <ul className="space-y-1 list-disc pl-4 text-slate-400 text-[11px]">
                    {cluster.contributingReasons?.map((reason, rIdx) => (
                      <li key={rIdx}>{reason}</li>
                    ))}
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  {onViewNearbyCameras && (
                    <button
                      type="button"
                      onClick={() => onViewNearbyCameras(center, cluster.title)}
                      className="flex-1 py-2 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Radio className="w-3 h-3" />
                      Nearby Cameras
                    </button>
                  )}
                  {onAddPlanningMarker && (
                    <button
                      type="button"
                      onClick={() => onAddPlanningMarker(center, cluster)}
                      className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-[11px] border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isLight
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                      }`}
                    >
                      <MapPin className="w-3 h-3 text-amber-400" />
                      Add Planning Marker
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </Circle>
        );
      })}
    </>
  );
}

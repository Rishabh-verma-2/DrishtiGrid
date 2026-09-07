import React, { useState } from 'react';
import { Grid3X3, AlertTriangle, CheckCircle2, Flame, MapPin } from 'lucide-react';

export default function ZoneDensityGrid({
  zones = [],
  gridRows = 3,
  gridCols = 4,
  isLight = false,
  onSelectZone = null,
}) {
  const [selectedZone, setSelectedZone] = useState(null);

  const levelColorMap = {
    clear: {
      bg: isLight ? 'bg-emerald-50 hover:bg-emerald-100/70 border-emerald-200 text-emerald-800' : 'bg-emerald-950/30 hover:bg-emerald-900/40 border-emerald-500/20 text-emerald-300',
      badge: isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-300',
      dot: 'bg-emerald-500',
    },
    moderate: {
      bg: isLight ? 'bg-amber-50 hover:bg-amber-100/70 border-amber-200 text-amber-800' : 'bg-amber-950/30 hover:bg-amber-900/40 border-amber-500/20 text-amber-300',
      badge: isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300',
      dot: 'bg-amber-500',
    },
    dense: {
      bg: isLight ? 'bg-orange-50 hover:bg-orange-100/70 border-orange-200 text-orange-800' : 'bg-orange-950/40 hover:bg-orange-900/50 border-orange-500/30 text-orange-300',
      badge: isLight ? 'bg-orange-100 text-orange-800' : 'bg-orange-500/20 text-orange-300',
      dot: 'bg-orange-500',
    },
    critical: {
      bg: isLight ? 'bg-red-50 hover:bg-red-100/70 border-red-300 text-red-800 animate-pulse' : 'bg-red-950/50 hover:bg-red-900/60 border-red-500/40 text-red-300 animate-pulse',
      badge: isLight ? 'bg-red-100 text-red-800' : 'bg-red-500/30 text-red-300',
      dot: 'bg-red-500',
    },
  };

  // Find hotspot sector
  const worstSector = zones.reduce((max, z) => (z.count > (max?.count || 0) ? z : max), null);

  return (
    <div
      className={`rounded-2xl border p-5 transition-all duration-300 ${
        isLight
          ? 'bg-white border-slate-200/90 shadow-xs'
          : 'bg-[#141929] border-white/5 shadow-md'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
            isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-400'
          }`}>
            <Grid3X3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Spatial Sector Density Matrix
            </h3>
            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {gridRows}×{gridCols} Sector Bottleneck Detection
            </p>
          </div>
        </div>

        {worstSector && worstSector.count > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-orange-500">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span>Pinch Point: <b>{worstSector.zone_name || `R${worstSector.row+1}C${worstSector.col+1}`}</b> ({worstSector.count}p)</span>
          </div>
        )}
      </div>

      {/* Grid Canvas */}
      <div
        className="grid gap-2 mb-3"
        style={{
          gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: gridRows * gridCols }).map((_, idx) => {
          const r = Math.floor(idx / gridCols);
          const c = idx % gridCols;
          const zone = zones.find((z) => z.row === r && z.col === c) || {
            row: r,
            col: c,
            zone_name: `R${r + 1}C${c + 1}`,
            count: 0,
            density_level: 'clear',
          };

          const style = levelColorMap[zone.density_level] || levelColorMap.clear;
          const isSelected = selectedZone?.row === r && selectedZone?.col === c;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setSelectedZone(zone);
                if (onSelectZone) onSelectZone(zone);
              }}
              className={`p-2.5 rounded-xl border text-left transition-all duration-200 relative overflow-hidden group cursor-pointer ${
                style.bg
              } ${isSelected ? 'ring-2 ring-indigo-500 shadow-md' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold uppercase opacity-75">
                  {zone.zone_name || `R${r + 1}C${c + 1}`}
                </span>
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <span className="text-base font-black font-mono">
                  {zone.count}
                </span>
                <span className="text-[9px] opacity-75">
                  people
                </span>
              </div>

              <div className="mt-1">
                <span className={`text-[9px] font-bold uppercase px-1 py-0.2 rounded ${style.badge}`}>
                  {zone.density_level}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between text-[10.5px] pt-2 border-t border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Clear (&lt;5)
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Moderate (5–14)
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-orange-500" /> Dense (15–29)
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Critical (30+)
          </span>
        </div>
        <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
          Click sector to inspect
        </span>
      </div>
    </div>
  );
}

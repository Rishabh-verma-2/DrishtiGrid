import React from 'react';
import { Users, AlertTriangle, Activity, Car, TrendingUp, ShieldAlert, CheckCircle2, Zap } from 'lucide-react';

export default function CrowdMetricsCards({ data, isLight = false }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total People', sub: 'Detected + Occluded' },
          { label: 'Density Severity', sub: 'Tactical Threshold' },
          { label: 'Density Index', sub: 'Spatial Blended' },
          { label: 'Scene Vehicles', sub: 'All Classes' },
          { label: 'Surge Flow', sub: 'Rolling Baseline' },
        ].map((item, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-2xl border transition-all ${
              isLight
                ? 'bg-white border-slate-200/80 shadow-xs'
                : 'bg-[#121726]/80 border-white/5 shadow-inner'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                {item.label}
              </span>
              <div className={`w-7 h-7 rounded-lg ${isLight ? 'bg-slate-100' : 'bg-white/5'} flex items-center justify-center animate-pulse`} />
            </div>
            <p className={`text-2xl font-black font-mono ${isLight ? 'text-slate-300' : 'text-slate-700'}`}>—</p>
            <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{item.sub}</p>
          </div>
        ))}
      </div>
    );
  }

  const {
    total_count = 0,
    detected_count = 0,
    occluded_est = 0,
    crowd_level = 'LOW',
    density_score = 0,
    object_inventory = {},
    surge = {},
  } = data;

  const vehicleTotal = object_inventory?.vehicle_total ?? 0;
  const vehicles = object_inventory?.vehicles || {};
  const vehicleSummary = [
    vehicles.car ? `${vehicles.car} Cars` : null,
    vehicles.motorcycle ? `${vehicles.motorcycle} 2W` : null,
    vehicles.bus ? `${vehicles.bus} Buses` : null,
    vehicles.truck ? `${vehicles.truck} Trucks` : null,
    vehicles.auto_rickshaw ? `${vehicles.auto_rickshaw} Autos` : null,
  ].filter(Boolean).slice(0, 3).join(' · ') || 'No vehicles detected';

  // Severity styling map
  const levelStyles = {
    LOW: {
      color: 'emerald',
      label: 'LOW DENSITY',
      badge: isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      advisory: 'Normal pedestrian flow. Routine Netram observation.',
    },
    MEDIUM: {
      color: 'amber',
      label: 'MEDIUM DENSITY',
      badge: isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      advisory: 'Elevated presence. Monitor bottlenecks and egress.',
    },
    HIGH: {
      color: 'orange',
      label: 'HIGH DENSITY',
      badge: isLight ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      advisory: 'Heavy crowd warning. Standby sector marshals.',
    },
    CRITICAL: {
      color: 'red',
      label: 'CRITICAL CONGESTION',
      badge: isLight ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' : 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse',
      advisory: 'CRITICAL SURGE! Immediate Gujarat Police dispatch advisory.',
    },
  };

  const currentLevel = levelStyles[crowd_level] || levelStyles.LOW;
  const isSurge = Boolean(surge?.surge_detected);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {/* 1. Total People Count */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/30 border-indigo-200/80 shadow-xs'
            : 'bg-gradient-to-br from-[#181d33] to-[#121627] border-indigo-500/30 shadow-lg'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-indigo-800' : 'text-indigo-300'}`}>
            Total People
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-400'}`}>
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <p className={`text-3xl font-black font-mono tracking-tight ${isLight ? 'text-indigo-950' : 'text-white'}`}>
            {total_count}
          </p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
            isLight ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
          }`}>
            people
          </span>
        </div>
        <p className={`text-[11px] mt-1 font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          <span className="font-semibold">{detected_count}</span> visual + <span className="font-semibold text-purple-400">{occluded_est}</span> occluded
        </p>
      </div>

      {/* 2. Crowd Severity Level */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-[#14192a] border-white/5 shadow-md'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Crowd Severity
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${currentLevel.badge}`}>
            {crowd_level === 'CRITICAL' ? (
              <ShieldAlert className="w-4 h-4 text-red-500 animate-bounce" />
            ) : crowd_level === 'HIGH' ? (
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-black tracking-wide px-2.5 py-0.5 rounded-lg border ${currentLevel.badge}`}>
            {crowd_level}
          </span>
        </div>
        <p className={`text-[10.5px] mt-1.5 line-clamp-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`} title={currentLevel.advisory}>
          {currentLevel.advisory}
        </p>
      </div>

      {/* 3. Density Index */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-[#14192a] border-white/5 shadow-md'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Density Index
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isLight ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-500/20 text-cyan-400'}`}>
            <Activity className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <p className={`text-2xl font-black font-mono ${isLight ? 'text-cyan-900' : 'text-cyan-400'}`}>
            {(density_score * 100).toFixed(1)}%
          </p>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              density_score > 0.6 ? 'bg-red-500' : density_score > 0.3 ? 'bg-amber-500' : 'bg-cyan-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(5, density_score * 100))}%` }}
          />
        </div>
        <p className={`text-[10px] mt-1 text-right font-medium ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
          55% count + 45% area
        </p>
      </div>

      {/* 4. Scene Vehicles */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-gradient-to-br from-blue-50/60 via-white to-cyan-50/30 border-blue-200/80 shadow-xs'
            : 'bg-[#14192a] border-white/5 shadow-md'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-blue-800' : 'text-blue-300'}`}>
            Scene Vehicles
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'}`}>
            <Car className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <p className={`text-2xl font-black font-mono ${isLight ? 'text-blue-950' : 'text-blue-400'}`}>
            {vehicleTotal}
          </p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
            isLight ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
          }`}>
            units
          </span>
        </div>
        <p className={`text-[10.5px] mt-1 font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`} title={vehicleSummary}>
          {vehicleSummary}
        </p>
      </div>

      {/* 5. Surge Status */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isSurge
            ? isLight
              ? 'bg-red-50/80 border-red-300 shadow-sm'
              : 'bg-gradient-to-br from-red-950/40 to-[#18111e] border-red-500/40 shadow-lg'
            : isLight
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-[#14192a] border-white/5 shadow-md'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${
            isSurge ? (isLight ? 'text-red-700' : 'text-red-400') : (isLight ? 'text-slate-500' : 'text-slate-400')
          }`}>
            Surge Flow
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
            isSurge
              ? 'bg-red-500 text-white animate-pulse'
              : isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {isSurge ? <Zap className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <p className={`text-base font-black tracking-tight ${
            isSurge ? 'text-red-500 animate-pulse' : isLight ? 'text-emerald-700' : 'text-emerald-400'
          }`}>
            {isSurge ? 'SURGE SPIKE' : 'STABLE'}
          </p>
        </div>
        <p className={`text-[10.5px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          Baseline: <span className="font-mono font-bold">{surge?.baseline_avg ? surge.baseline_avg.toFixed(1) : '—'}</span>
          {typeof surge?.surge_percent === 'number' && (
            <span className={`ml-1 font-bold ${surge.surge_percent > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              ({surge.surge_percent > 0 ? `+${surge.surge_percent.toFixed(0)}%` : `${surge.surge_percent.toFixed(0)}%`})
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

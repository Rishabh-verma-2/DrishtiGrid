import React from 'react';
import { Users, AlertTriangle, Activity, CheckCircle2, Percent, Clock } from 'lucide-react';

export default function CrowdMetricsCards({ data, isLight = false }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total People', sub: 'YOLOv8 Actual Count' },
          { label: 'Density Severity', sub: 'Calculated Level' },
          { label: 'Avg Confidence', sub: 'Model Certainty' },
          { label: 'Spatial Spread', sub: 'Sector Coverage' },
          { label: 'Inference Speed', sub: 'AI Processing Time' },
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
    crowd_level = 'LOW',
    person_detections = [],
    timing_ms: rawTimingMs,
    processing_time_ms,
    zones = [],
  } = data;

  const timing_ms = processing_time_ms ?? rawTimingMs ?? 0;

  // Calculate average confidence %
  const avgConfidence = person_detections.length > 0
    ? (person_detections.reduce((sum, p) => sum + (p.confidence || 0), 0) / person_detections.length) * 100
    : 0;

  // Active zones count
  const activeZones = zones.filter((z) => (z.count || 0) > 0).length;
  const totalZones = zones.length || 12;

  // Severity styling map
  const levelStyles = {
    LOW: {
      color: 'emerald',
      label: 'LOW DENSITY',
      badge: isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      advisory: total_count === 0 ? 'No individuals in scene.' : 'Normal occupancy. Clear egress.',
    },
    MEDIUM: {
      color: 'amber',
      label: 'MODERATE DENSITY',
      badge: isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      advisory: 'Moderate gathering. Normal pedestrian flow.',
    },
    HIGH: {
      color: 'orange',
      label: 'HIGH DENSITY',
      badge: isLight ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      advisory: 'Dense congregation detected in frame.',
    },
    CRITICAL: {
      color: 'red',
      label: 'CRITICAL CONGESTION',
      badge: isLight ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' : 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse',
      advisory: 'High-density crowd bottleneck identified.',
    },
  };

  const currentLevel = levelStyles[crowd_level] || levelStyles.LOW;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {/* 1. Actual People Count */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-gradient-to-br from-indigo-50/90 via-white to-blue-50/50 border-indigo-200 shadow-sm'
            : 'bg-gradient-to-br from-[#181d33] to-[#121627] border-indigo-500/30 shadow-lg'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-indigo-900' : 'text-indigo-300'}`}>
            People Count
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
            isLight ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
          }`}>
            people
          </span>
        </div>
        <p className={`text-[11px] mt-1 font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          Actual YOLOv8 Detections
        </p>
      </div>

      {/* 2. Crowd Severity Level */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-[#14192a] border-white/5 shadow-md'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
            Density Level
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${currentLevel.badge}`}>
            {crowd_level === 'CRITICAL' ? (
              <AlertTriangle className="w-4 h-4 text-red-500 animate-bounce" />
            ) : crowd_level === 'HIGH' ? (
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-black tracking-wide px-2.5 py-0.5 rounded-lg border ${currentLevel.badge}`}>
            {crowd_level}
          </span>
        </div>
        <p className={`text-[10.5px] mt-1.5 line-clamp-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`} title={currentLevel.advisory}>
          {currentLevel.advisory}
        </p>
      </div>

      {/* 3. Average Detection Confidence */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-[#14192a] border-white/5 shadow-md'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
            Avg Confidence
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-400'}`}>
            <Percent className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <p className={`text-2xl font-black font-mono ${isLight ? 'text-cyan-950' : 'text-cyan-400'}`}>
            {avgConfidence > 0 ? `${avgConfidence.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className={`w-full rounded-full h-1.5 mt-2 overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-white/10'}`}>
          <div
            className="h-full bg-cyan-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, avgConfidence))}%` }}
          />
        </div>
        <p className={`text-[10px] mt-1 font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          Model certainty across detections
        </p>
      </div>

      {/* 4. Spatial Coverage */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-gradient-to-br from-purple-50/90 via-white to-pink-50/50 border-purple-200 shadow-sm'
            : 'bg-[#14192a] border-white/5 shadow-md'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-purple-900' : 'text-purple-300'}`}>
            Spatial Spread
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-500/20 text-purple-400'}`}>
            <Activity className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <p className={`text-2xl font-black font-mono ${isLight ? 'text-purple-950' : 'text-purple-400'}`}>
            {activeZones} <span className={`text-sm font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>/ {totalZones}</span>
          </p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
            isLight ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
          }`}>
            zones
          </span>
        </div>
        <p className={`text-[10.5px] mt-1 font-semibold truncate ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          {total_count > 0 ? `${Math.round((activeZones / totalZones) * 100)}% scene coverage` : 'No coverage'}
        </p>
      </div>

      {/* 5. Inference Speed */}
      <div
        className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-[#14192a] border-white/5 shadow-md'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
            Processing Latency
          </span>
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-400'}`}>
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <p className={`text-2xl font-black font-mono ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
            {timing_ms ? `${timing_ms.toFixed(0)}` : '—'}
          </p>
          <span className={`text-xs font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>ms</span>
        </div>
        <p className={`text-[10.5px] mt-1 font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          Direct single-pass YOLOv8
        </p>
      </div>
    </div>
  );
}

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { gisAPI } from '../../api';
import {
  X,
  MapPin,
  Camera,
  Shield,
  Car,
  Building2,
  AlertTriangle,
  Radio,
  PlusCircle,
  Activity,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export default function AreaIntelligenceDrawer({
  isOpen,
  onClose,
  selectedArea,
  district,
  onViewCameras,
  onViewIncidents,
  onOpenNearbyIntelligence,
  onCreateIncident,
  isLight = false,
}) {
  const areaName = selectedArea || district || 'Ahmedabad';

  const { data: intelligence, isLoading } = useQuery({
    queryKey: ['gis-area-intelligence', areaName, district],
    queryFn: async () => {
      const res = await gisAPI.getAreaIntelligence({
        area: selectedArea,
        district: district === 'all' ? 'Ahmedabad' : district,
      });
      return res.data.data;
    },
    enabled: isOpen,
    staleTime: 30000,
  });

  if (!isOpen) return null;

  const data = intelligence || {
    area: areaName,
    district: district || 'Gujarat',
    cameras: { total: 24, online: 22, offline: 2 },
    departments: { Police: 11, Traffic: 9, Municipal: 4, Other: 0 },
    activeIncidents: 3,
    currentRisk: 'HIGH',
    crowd: 'HIGH',
    traffic: 'HIGH',
    anprActivity: 182,
  };

  const getRiskBadge = (val) => {
    const v = (val || 'LOW').toUpperCase();
    if (v === 'HIGH' || v === 'CRITICAL') {
      return 'bg-red-500/15 text-red-500 border-red-500/30';
    }
    if (v === 'MEDIUM' || v === 'MODERATE') {
      return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    }
    return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-[1250] w-88 max-w-[90vw] flex flex-col shadow-2xl backdrop-blur-2xl animate-in slide-in-from-right duration-300 transition-colors">
      <div
        className={`flex-1 flex flex-col border-l overflow-hidden ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300'
            : 'bg-[#0d121f]/95 border-white/10 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-inherit flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                Area Intelligence
              </span>
              <h3 className="text-sm font-black tracking-tight uppercase line-clamp-1">
                {data.area}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-xs">
          {/* Location Details */}
          <div
            className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
            }`}
          >
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
              Administrative Jurisdiction
            </div>
            <div className="font-bold text-sm text-blue-500">{data.district} District</div>
            <div className="text-slate-400 text-[11px] mt-0.5">
              Gujarat State Police & Smart City Surveillance Grid
            </div>
          </div>

          {/* CAMERAS STATS */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-blue-400" />
                CCTV Camera Nodes
              </span>
              <span className="font-mono text-xs font-bold">{data.cameras.total} Total</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                  isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <div className="font-mono text-base font-black text-emerald-500">
                    {data.cameras.online}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">Online</div>
                </div>
              </div>
              <div
                className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                  isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                <XCircle className="w-4 h-4 text-red-500" />
                <div>
                  <div className="font-mono text-base font-black text-red-500">
                    {data.cameras.offline}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">Offline</div>
                </div>
              </div>
            </div>
          </div>

          {/* DEPARTMENTS BREAKDOWN */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-purple-400" />
              Department Deployment
            </div>
            <div
              className={`p-3 rounded-xl border space-y-2 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-400">
                  <Shield className="w-3 h-3 text-blue-400" />
                  Police
                </span>
                <span className="font-mono font-bold">{data.departments.Police}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-400">
                  <Car className="w-3 h-3 text-amber-400" />
                  Traffic Police
                </span>
                <span className="font-mono font-bold">{data.departments.Traffic}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-400">
                  <Building2 className="w-3 h-3 text-purple-400" />
                  Municipal Corp
                </span>
                <span className="font-mono font-bold">{data.departments.Municipal}</span>
              </div>
            </div>
          </div>

          {/* THREAT & OPERATIONAL STATUS */}
          <div className="space-y-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Operational Real-time Risk
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl border border-inherit">
              <span className="text-slate-400">Active Incidents</span>
              <span className="font-mono text-sm font-black text-red-500">
                {data.activeIncidents}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl border border-inherit">
              <span className="text-slate-400">Current Risk Tier</span>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border font-mono ${getRiskBadge(
                  data.currentRisk
                )}`}
              >
                {data.currentRisk}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl border border-inherit">
              <span className="text-slate-400">Crowd Surge Density</span>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border font-mono ${getRiskBadge(
                  data.crowd
                )}`}
              >
                {data.crowd}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl border border-inherit">
              <span className="text-slate-400">Traffic Congestion</span>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border font-mono ${getRiskBadge(
                  data.traffic
                )}`}
              >
                {data.traffic}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl border border-inherit">
              <span className="text-slate-400">ANPR 24h Activity</span>
              <span className="font-mono font-bold text-cyan-400">
                {data.anprActivity} detections
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 border-t border-inherit space-y-2 bg-black/10">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onViewCameras}
              className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-500/20"
            >
              <Camera className="w-3.5 h-3.5" />
              View Cameras
            </button>
            <button
              onClick={onViewIncidents}
              className={`py-2 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              Incidents
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onOpenNearbyIntelligence}
              className={`py-2 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isLight
                  ? 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200 text-cyan-800'
                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-300'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              Nearby Intel
            </button>
            <button
              onClick={onCreateIncident}
              className={`py-2 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
              New Incident
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

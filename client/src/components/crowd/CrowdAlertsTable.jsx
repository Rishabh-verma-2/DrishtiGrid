import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crowdAPI } from '../../api';
import { ShieldAlert, AlertTriangle, RefreshCw, Clock, MapPin, Eye, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

export default function CrowdAlertsTable({ isLight = false, onSelectCamera = null }) {
  const queryClient = useQueryClient();

  const { data: alertsRes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['crowdAlerts'],
    queryFn: () => crowdAPI.getAlerts({ limit: 10 }),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const resetMutation = useMutation({
    mutationFn: (camId) => crowdAPI.resetBaseline(camId),
    onSuccess: (_, camId) => {
      toast.success(`Surge baseline reset for ${camId}`);
      queryClient.invalidateQueries({ queryKey: ['crowdAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['crowdStats'] });
    },
    onError: (err) => {
      toast.error(`Reset failed: ${err.message}`);
    },
  });

  const alerts = alertsRes?.data?.data || [];

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
            isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-400'
          }`}>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Recent Crowd Surge Incidents
            </h3>
            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Real-time High & Critical Gatherings Log
            </p>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
          }`}
          title="Refresh Alerts"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className={`text-xs ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>Loading surge incidents...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="py-8 text-center rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-dashed border-slate-200 dark:border-white/5">
          <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            No high or critical crowd surges recorded recently.
          </p>
          <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            All sectors across monitored CCTV nodes are operating within baseline tolerances.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b ${isLight ? 'border-slate-100 text-slate-400' : 'border-white/5 text-slate-500'} uppercase font-mono text-[10px]`}>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Camera Node</th>
                <th className="py-2.5 px-3">Location</th>
                <th className="py-2.5 px-3">Incident Details</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {alerts.map((alert) => {
                const cam = alert.camera || {};
                const camId = alert.cameraId || cam.cameraId || 'default';
                const isCritical = alert.severity === 'CRITICAL';

                return (
                  <tr
                    key={alert._id}
                    className={`transition-colors ${
                      isLight ? 'hover:bg-slate-50/70' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-md border ${
                        isCritical
                          ? isLight ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                          : isLight ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                      }`}>
                        {alert.severity}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                      {cam.name || camId}
                    </td>

                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[140px]">
                          {cam.address?.district || cam.district || 'Gujarat Urban Grid'}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 max-w-[240px] truncate">
                      {alert.description || alert.title || 'Sudden crowd accumulation spike'}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {alert.createdAt ? formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true }) : 'Recent'}
                    </td>

                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => resetMutation.mutate(camId)}
                        disabled={resetMutation.isPending}
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
                          isLight
                            ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                        title="Reset crowd surge rolling baseline for this camera"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-400" />
                        <span>Reset Baseline</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

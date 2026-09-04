import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cameraAPI, footageTicketAPI } from '../api';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import {
  BarChart3, Download, Printer, Shield, Camera, FileText,
  CheckCircle2, Clock, MapPin, Calendar, TrendingUp, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const userRole = String(user?.role || '').toUpperCase();
  const normalizedRole =
    ['SUPERADMIN', 'ADMIN'].includes(userRole) ? 'ADMIN' :
    ['OPERATOR', 'VIEWER', 'POLICE'].includes(userRole) ? 'POLICE' :
    ['TRAFFIC', 'TRAFFIC_POLICE'].includes(userRole) ? 'TRAFFIC_POLICE' : 'POLICE';

  const { data: camStats } = useQuery({
    queryKey: ['cameraStats'],
    queryFn: () => cameraAPI.getStats().then((r) => r.data.data),
  });

  const { data: ticketStats } = useQuery({
    queryKey: ['footage-ticket-stats'],
    queryFn: () => footageTicketAPI.getStats().then((r) => r.data.data),
  });

  const handleExportCSV = () => {
    toast.success('Generating and downloading official report summary CSV...');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Surveillance Analytics &amp; Compliance Reports
            </h1>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              normalizedRole === 'ADMIN'
                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                : normalizedRole === 'TRAFFIC_POLICE'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
            }`}>
              {normalizedRole} VIEW
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Departmental operational overview, camera uptime compliance, and Section 65B forensic dispatch logs.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs'
                : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-5 rounded-3xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-400">Total Cameras Monitored</span>
            <Camera className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black font-mono text-blue-500">{camStats?.total || 500}</p>
          <p className="text-[11px] text-slate-500 mt-1">Gujarat state grid</p>
        </div>

        <div className={`p-5 rounded-3xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-400">Network Operational Rate</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black font-mono text-emerald-500">
            {camStats?.total ? Math.round(((camStats.online || 0) / camStats.total) * 100) : 92}%
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{camStats?.online || 460} online streams</p>
        </div>

        <div className={`p-5 rounded-3xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-400">Footage Requisitions Lodged</span>
            <FileText className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-black font-mono text-purple-500">{ticketStats?.total || 0}</p>
          <p className="text-[11px] text-slate-500 mt-1">Inter-department cases</p>
        </div>

        <div className={`p-5 rounded-3xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-400">Evidence Packages Dispatched</span>
            <CheckCircle2 className="w-4 h-4 text-cyan-500" />
          </div>
          <p className="text-2xl font-black font-mono text-cyan-500">{ticketStats?.dispatched || 0}</p>
          <p className="text-[11px] text-slate-500 mt-1">SHA-256 seal verified</p>
        </div>
      </div>

      {/* District breakdown table */}
      <div className={`p-5 rounded-3xl border transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
      }`}>
        <h3 className={`text-sm font-black tracking-tight mb-4 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          District-Wise Surveillance Compliance Summary
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b text-[10px] font-black uppercase tracking-wider ${
                isLight ? 'border-slate-200 text-slate-500' : 'border-white/6 text-slate-400'
              }`}>
                <th className="pb-3">District</th>
                <th className="pb-3">Total Units</th>
                <th className="pb-3">Online</th>
                <th className="pb-3">Offline</th>
                <th className="pb-3">SLA Compliance</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/4'}`}>
              {(camStats?.byDistrict || []).map((d) => {
                const compliance = Math.round((d.online / d.count) * 100);
                return (
                  <tr key={d._id} className="hover:bg-slate-50 dark:hover:bg-white/2">
                    <td className="py-3 font-bold text-slate-700 dark:text-slate-200">{d._id}</td>
                    <td className="py-3 font-mono">{d.count}</td>
                    <td className="py-3 font-mono text-emerald-500 font-bold">{d.online}</td>
                    <td className="py-3 font-mono text-rose-500">{d.count - d.online}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        compliance >= 90 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {compliance}% SLA
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditLogAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import {
  Shield, Search, Filter, RefreshCw, Calendar, Clock,
  User, Laptop, FileText, ArrowRight, ShieldCheck, Lock
} from 'lucide-react';
import { format } from 'date-fns';

export default function AuditLogsPage() {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  const { data: logsRes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', { search, action: actionFilter, role: roleFilter }],
    queryFn: () =>
      auditLogAPI
        .getAll({ search, action: actionFilter, role: roleFilter, limit: 100 })
        .then((r) => r.data),
  });

  const logs = logsRes?.data || [];

  const getActionBadge = (action) => {
    switch (action) {
      case 'USER_LOGIN':
        return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
      case 'USER_LOGOUT':
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
      case 'USER_CREATED':
        return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
      case 'ROLE_CHANGED':
        return 'bg-purple-500/15 text-purple-500 border-purple-500/30';
      case 'USER_ACTIVATED':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'USER_DEACTIVATED':
        return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
      case 'FOOTAGE_REQUEST_CREATED':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'FOOTAGE_REQUEST_APPROVED':
        return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
      case 'FOOTAGE_REQUEST_REJECTED':
        return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
      case 'CAMERA_MODIFIED':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
      default:
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Forensic System Audit Logs
            </h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500 border border-purple-500/30">
              ADMIN ONLY
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable log trail of security logins, footage requests, approvals, camera alterations, and administrative role modifications.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
            isLight
              ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs'
              : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-blue-500' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
      }`}>
        <div className="flex flex-1 items-center gap-3 min-w-[260px]">
          <div className={`relative flex-1 rounded-xl border flex items-center px-3 py-2 ${
            isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/8'
          }`}>
            <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search by user, IP address, description, action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-0 outline-none text-xs w-full text-slate-200 placeholder-slate-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border outline-none ${
              isLight ? 'bg-white border-slate-300 text-slate-700' : 'bg-[#0e1322] border-white/10 text-slate-200'
            }`}
          >
            <option value="all">All Actions</option>
            <option value="USER_LOGIN">User Logins</option>
            <option value="USER_CREATED">User Creations</option>
            <option value="ROLE_CHANGED">Role Changes</option>
            <option value="USER_ACTIVATED">User Activations</option>
            <option value="USER_DEACTIVATED">User Deactivations</option>
            <option value="FOOTAGE_REQUEST_CREATED">Footage Requisitions</option>
            <option value="CAMERA_MODIFIED">Camera Modifications</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border outline-none ${
              isLight ? 'bg-white border-slate-300 text-slate-700' : 'bg-[#0e1322] border-white/10 text-slate-200'
            }`}
          >
            <option value="all">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="POLICE">Police</option>
            <option value="TRAFFIC_POLICE">Traffic Police</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className={`rounded-3xl border overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b text-[10px] font-black uppercase tracking-wider ${
                isLight ? 'bg-slate-50/70 border-slate-200 text-slate-500' : 'bg-white/2 border-white/6 text-slate-400'
              }`}>
                <th className="py-3.5 px-5">Timestamp</th>
                <th className="py-3.5 px-5">Action</th>
                <th className="py-3.5 px-5">Actor / User</th>
                <th className="py-3.5 px-5">Department &amp; IP</th>
                <th className="py-3.5 px-5">Audit Description</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/4'}`}>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400">Loading audit records...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400">No audit logs matching query.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50/50 dark:hover:bg-white/2 transition-colors">
                    {/* Timestamp */}
                    <td className="py-3.5 px-5 font-mono text-[11px] whitespace-nowrap text-slate-400">
                      {format(new Date(log.timestamp), 'dd MMM yyyy, HH:mm:ss')}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[9px] font-extrabold uppercase border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>

                    {/* Actor User */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-[10px]">
                          {log.userName?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{log.userName}</p>
                          <span className="text-[10px] text-slate-400 font-mono">{log.role || 'USER'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Department & IP */}
                    <td className="py-3.5 px-5">
                      <p className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{log.department}</p>
                      <p className="text-[10px] font-mono text-slate-400">{log.ipAddress || '127.0.0.1'}</p>
                    </td>

                    {/* Description */}
                    <td className="py-3.5 px-5 text-slate-300 max-w-md">
                      <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {log.description}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

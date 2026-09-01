import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertAPI } from '../api';
import { AlertTriangle, CheckCircle, XCircle, Clock, Filter, Bell } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const SEV = {
  critical: 'text-red-300 bg-red-500/12 border-red-500/25',
  high:     'text-orange-400 bg-orange-500/10 border-orange-500/20',
  medium:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
  info:     'text-slate-400 bg-white/5 border-white/10',
};

export default function AlertsPage() {
  const [status, setStatus] = useState('active');
  const [severity, setSeverity] = useState('all');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', status, severity],
    queryFn: () => alertAPI.getAll({
      status: status === 'all' ? undefined : status,
      severity: severity === 'all' ? undefined : severity,
      limit: 50,
    }).then((r) => r.data),
    refetchInterval: 15000,
  });

  const ackMutation = useMutation({
    mutationFn: (id) => alertAPI.acknowledge(id),
    onSuccess: () => { qc.invalidateQueries(['alerts']); toast.success('Alert acknowledged'); },
    onError: () => toast.error('Failed to acknowledge'),
  });
  const resMutation = useMutation({
    mutationFn: (id) => alertAPI.resolve(id),
    onSuccess: () => { qc.invalidateQueries(['alerts']); toast.success('Alert resolved'); },
    onError: () => toast.error('Failed to resolve'),
  });

  const alerts = data?.data || [];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">Alerts &amp; Events</h1>
          <p className="text-sm text-slate-500 mt-1">{data?.pagination?.total || 0} total alerts</p>
        </div>

        <div className="flex items-center gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="bg-white/4 border border-white/8 rounded-xl text-xs text-slate-300 px-3 py-2.5 outline-none focus:border-blue-500/50 transition-all">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}
            className="bg-white/4 border border-white/8 rounded-xl text-xs text-slate-300 px-3 py-2.5 outline-none focus:border-blue-500/50 transition-all">
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-600">
          <Bell className="w-14 h-14 mb-4 opacity-20" />
          <p className="font-semibold">No alerts found</p>
          <p className="text-sm mt-1">Adjust your filters or check back later</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((al) => (
            <div key={al._id} className={`bg-[#141929] border border-white/7 rounded-2xl px-5 py-4 flex items-start gap-4 hover:bg-[#1a2035] transition-all ${al.severity === 'critical' ? 'border-red-500/20' : ''}`}>
              <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${SEV[al.severity] || SEV.info} border`}>
                <AlertTriangle className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-slate-200">{al.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{al.description || al.type?.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${SEV[al.severity]}`}>{al.severity}</span>
                    <span className="text-[10px] text-slate-600 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />{format(new Date(al.createdAt), 'dd MMM HH:mm')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[11px] text-slate-500">{al.district || al.address?.district || '—'}</span>
                  {al.camera?.name && <span className="text-[11px] text-blue-400">📷 {al.camera.name}</span>}
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border
                    ${al.status === 'active' ? 'text-red-400 bg-red-500/10 border-red-500/20'
                      : al.status === 'acknowledged' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                      : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>
                    {al.status}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {al.status === 'active' && (
                  <button onClick={() => ackMutation.mutate(al._id)}
                    className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 px-2.5 py-1.5 rounded-lg font-semibold transition-all">
                    <CheckCircle className="w-3 h-3" />Ack
                  </button>
                )}
                {(al.status === 'active' || al.status === 'acknowledged') && (
                  <button onClick={() => resMutation.mutate(al._id)}
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg font-semibold transition-all">
                    <XCircle className="w-3 h-3" />Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

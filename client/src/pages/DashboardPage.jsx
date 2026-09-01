import { useQuery } from '@tanstack/react-query';
import { cameraAPI, alertAPI } from '../api';
import {
  Camera, Wifi, WifiOff, Wrench, AlertTriangle, Activity,
  TrendingUp, MapPin, Clock, Eye, Radio
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { useMemo } from 'react';
import { format } from 'date-fns';

// ─── Stat Card ───────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, glow }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',   icon: 'text-blue-400',   val: 'text-blue-400' },
    green:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20',icon: 'text-emerald-400',val: 'text-emerald-400' },
    red:    { bg: 'bg-red-500/10',     border: 'border-red-500/20',    icon: 'text-red-400',    val: 'text-red-400' },
    yellow: { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',  icon: 'text-amber-400',  val: 'text-amber-400' },
    purple: { bg: 'bg-violet-500/10',  border: 'border-violet-500/20', icon: 'text-violet-400', val: 'text-violet-400' },
    cyan:   { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',   icon: 'text-cyan-400',   val: 'text-cyan-400' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`relative bg-[#141929] border ${c.border} rounded-2xl p-5 hover:bg-[#1a2035] transition-all duration-200 group overflow-hidden`}>
      <div className={`absolute inset-0 ${c.bg} opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl`} />
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-10 h-10 ${c.bg} border ${c.border} rounded-xl flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${c.icon}`} />
          </div>
          <TrendingUp className="w-3.5 h-3.5 text-slate-600" />
        </div>
        <p className={`text-3xl font-black ${c.val} mb-1 font-mono`}>{value ?? '—'}</p>
        <p className="text-sm font-semibold text-slate-300">{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Status dot ──────────────────────────────────────────────────
const statusColor = (s) => ({
  online:      '#10b981',
  offline:     '#ef4444',
  maintenance: '#f59e0b',
  fault:       '#f87171',
})[s] || '#6b7280';

// ─── Custom tooltip ──────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1e2740] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 shadow-xl">
      {label && <p className="font-semibold text-slate-200 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { data: camStats, isLoading: loadingCam } = useQuery({
    queryKey: ['cameraStats'],
    queryFn: () => cameraAPI.getStats().then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: alertStats, isLoading: loadingAlert } = useQuery({
    queryKey: ['alertStats'],
    queryFn: () => alertAPI.getStats().then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: camerasData } = useQuery({
    queryKey: ['cameras', 'all'],
    queryFn: () => cameraAPI.getAll({ limit: 200 }).then((r) => r.data.data),
  });

  // Pie data for status
  const pieData = useMemo(() => {
    if (!camStats) return [];
    return [
      { name: 'Online',      value: camStats.online,      color: '#10b981' },
      { name: 'Offline',     value: camStats.offline,     color: '#ef4444' },
      { name: 'Maintenance', value: camStats.maintenance, color: '#f59e0b' },
      { name: 'Fault',       value: camStats.fault || 0,  color: '#f87171' },
    ].filter((d) => d.value > 0);
  }, [camStats]);

  // Bar chart: top districts
  const districtBar = useMemo(() => {
    if (!camStats?.byDistrict) return [];
    return camStats.byDistrict.slice(0, 8).map((d) => ({
      district: d._id,
      total: d.count,
      online: d.online,
      offline: d.count - d.online,
    }));
  }, [camStats]);

  const now = new Date();

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-[fadeIn_0.3s_ease]">

      {/* ─── Page Header ─── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">Command Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Last updated: {format(now, 'dd MMM yyyy · HH:mm:ss')} IST
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#141929] border border-white/7 rounded-xl px-3 py-2">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-400">System Active</span>
        </div>
      </div>

      {/* ─── Stat Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Camera}        label="Total Cameras"    value={camStats?.total}       sub="Across Gujarat"       color="blue"   />
        <StatCard icon={Wifi}          label="Online"           value={camStats?.online}      sub={`${camStats?.uptime ?? 0}% uptime`} color="green" />
        <StatCard icon={WifiOff}       label="Offline"          value={camStats?.offline}     sub="Need attention"       color="red"    />
        <StatCard icon={Wrench}        label="Maintenance"      value={camStats?.maintenance} sub="Scheduled"            color="yellow" />
        <StatCard icon={AlertTriangle} label="Active Alerts"    value={alertStats?.active}    sub={`${alertStats?.critical ?? 0} critical`} color="red" />
        <StatCard icon={Eye}           label="Today's Events"   value={alertStats?.todayCount} sub="Last 24h"            color="cyan"   />
      </div>

      {/* ─── Charts + Map Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Status Pie chart */}
        <div className="bg-[#141929] border border-white/7 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />Camera Status Overview
          </h2>
          {loadingCam ? (
            <div className="h-40 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="transparent" />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-[11px] text-slate-400">{d.name}</span>
                    <span className="text-[11px] font-bold text-slate-200 ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* District bar chart */}
        <div className="lg:col-span-2 bg-[#141929] border border-white/7 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />District-wise Camera Count
          </h2>
          {loadingCam ? (
            <div className="h-40 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={districtBar} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="district" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.06)' }} />
                <Bar dataKey="online"  name="Online"  fill="#10b981" radius={[3,3,0,0]} maxBarSize={20} />
                <Bar dataKey="offline" name="Offline" fill="#ef4444" radius={[3,3,0,0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── GIS Mini Map + Recent Activity ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* GIS Map */}
        <div className="xl:col-span-3 bg-[#141929] border border-white/7 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />Gujarat Camera Network
            </h2>
            <a href="/gis-map" className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors">
              Full Map →
            </a>
          </div>
          <div className="h-[340px] relative">
            <MapContainer
              center={[22.2587, 71.1924]}
              zoom={7}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
              attributionControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {camerasData?.map((cam) => (
                cam.location?.coordinates?.length === 2 && (
                  <CircleMarker
                    key={cam._id}
                    center={[cam.location.coordinates[1], cam.location.coordinates[0]]}
                    radius={5}
                    pathOptions={{
                      fillColor: statusColor(cam.status),
                      fillOpacity: 0.9,
                      color: statusColor(cam.status),
                      weight: 1,
                      opacity: 0.6,
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1" style={{ minWidth: '180px' }}>
                        <p className="font-bold text-slate-100">{cam.name}</p>
                        <p className="text-slate-400">{cam.district}</p>
                        <p className="text-slate-500">{cam.address?.area}</p>
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                          style={{
                            background: `${statusColor(cam.status)}22`,
                            color: statusColor(cam.status),
                            border: `1px solid ${statusColor(cam.status)}44`,
                          }}
                        >
                          {cam.status}
                        </span>
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              ))}
            </MapContainer>

            {/* Map legend */}
            <div className="absolute bottom-3 right-3 z-[1000] bg-[#141929]/90 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2 space-y-1.5">
              {[
                { label: 'Online',      color: '#10b981' },
                { label: 'Offline',     color: '#ef4444' },
                { label: 'Maintenance', color: '#f59e0b' },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] text-slate-400 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="xl:col-span-2 bg-[#141929] border border-white/7 rounded-2xl flex flex-col">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-400" />Recent Events
            </h2>
            <span className="text-[10px] text-slate-600 font-medium">Live</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-white/4">
            {MOCK_EVENTS.map((ev, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 hover:bg-white/3 transition-colors">
                <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${ev.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-slate-300 leading-snug">{ev.title}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">{ev.location}</p>
                </div>
                <span className="text-[10px] text-slate-600 shrink-0">{ev.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Camera Table (district summary) ─── */}
      <div className="bg-[#141929] border border-white/7 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />District Camera Summary
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['District', 'Total', 'Online', 'Offline', 'Maint.', 'Coverage %'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4">
              {(camStats?.byDistrict || []).map((d) => {
                const pct = d.count > 0 ? Math.round((d.online / d.count) * 100) : 0;
                return (
                  <tr key={d._id} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3.5 text-slate-300 font-semibold">{d._id}</td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono">{d.count}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-emerald-400 font-mono font-semibold">{d.online}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-red-400 font-mono font-semibold">{d.count - d.online}</span>
                    </td>
                    <td className="px-5 py-3.5 text-amber-400 font-mono">—</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden max-w-[80px]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: pct > 80 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-400">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(!camStats?.byDistrict || camStats.byDistrict.length === 0) && (
            <div className="py-12 text-center text-slate-600 text-sm">No data available</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mock recent events ───────────────────────────────────────────
const MOCK_EVENTS = [
  { title: 'Motion detected – Maninagar Railway Station', location: 'Ahmedabad · CAM-0001', time: '2m ago',  dot: 'bg-amber-400' },
  { title: 'Camera back online – Sabarmati Riverfront',   location: 'Ahmedabad · CAM-0003', time: '8m ago',  dot: 'bg-emerald-400' },
  { title: 'Crowd surge alert – Lal Darwaja Market',      location: 'Ahmedabad · CAM-0009', time: '15m ago', dot: 'bg-red-400 animate-pulse-dot' },
  { title: 'PTZ calibration complete – Akshardham',       location: 'Gandhinagar · CAM-0004', time: '22m ago', dot: 'bg-blue-400' },
  { title: 'ANPR match – Surat bypass highway',           location: 'Surat · CAM-0010',     time: '31m ago', dot: 'bg-violet-400' },
  { title: 'Camera offline – Junagadh Fort Road',         location: 'Junagadh · CAM-0031',  time: '45m ago', dot: 'bg-red-400' },
  { title: 'Night mode activated – Vadodara Baroda',      location: 'Vadodara · CAM-0020',  time: '1h ago',  dot: 'bg-cyan-400' },
  { title: 'Maintenance completed – Rajkot Market',       location: 'Rajkot · CAM-0025',    time: '2h ago',  dot: 'bg-emerald-400' },
];

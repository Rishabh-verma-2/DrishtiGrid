import { useQuery } from '@tanstack/react-query';
import { cameraAPI } from '../api';
import { Camera, Search, Plus, MapPin, Filter } from 'lucide-react';
import { useState, useMemo } from 'react';

const STATUS_BADGE = {
  online:      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  offline:     'text-red-400 bg-red-500/10 border-red-500/20',
  maintenance: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  fault:       'text-red-300 bg-red-500/8 border-red-500/15',
};

export default function CameraManagementPage() {
  const [search, setSearch] = useState('');
  const [district, setDistrict] = useState('all');

  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ['cameras', 'management'],
    queryFn: () => cameraAPI.getAll({ limit: 500 }).then((r) => r.data.data),
  });

  const districts = useMemo(() => ['all', ...new Set(cameras.map((c) => c.district).filter(Boolean))], [cameras]);

  const filtered = useMemo(() => cameras.filter((c) => {
    const matchD = district === 'all' || c.district === district;
    const matchS = !search || c.name?.toLowerCase().includes(search.toLowerCase())
      || c.cameraId?.toLowerCase().includes(search.toLowerCase())
      || c.district?.toLowerCase().includes(search.toLowerCase());
    return matchD && matchS;
  }), [cameras, district, search]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">Camera Management</h1>
          <p className="text-sm text-slate-500 mt-1">{cameras.length} registered cameras</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:shadow-[0_0_16px_rgba(59,130,246,0.4)]">
          <Plus className="w-4 h-4" />Add Camera
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cameras, districts…"
            className="bg-white/4 border border-white/8 rounded-xl text-xs text-slate-300 pl-8 pr-3 py-2.5 outline-none focus:border-blue-500/50 w-56 placeholder:text-slate-600 transition-all" />
        </div>
        <select value={district} onChange={(e) => setDistrict(e.target.value)}
          className="bg-white/4 border border-white/8 rounded-xl text-xs text-slate-300 px-3 py-2.5 outline-none focus:border-blue-500/50 transition-all">
          {districts.map((d) => <option key={d} value={d}>{d === 'all' ? 'All Districts' : d}</option>)}
        </select>
        <span className="text-xs text-slate-600 self-center font-mono">{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="bg-[#141929] border border-white/7 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Camera ID', 'Name', 'District', 'Type', 'Zone', 'Status', 'Dept', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4">
              {isLoading ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-600">
                  <div className="flex justify-center"><div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" /></div>
                </td></tr>
              ) : filtered.map((cam) => (
                <tr key={cam._id} className="hover:bg-white/3 transition-colors group">
                  <td className="px-4 py-3.5 font-mono text-[11px] text-blue-400">{cam.cameraId}</td>
                  <td className="px-4 py-3.5 max-w-[200px]">
                    <p className="text-slate-300 font-medium truncate text-xs">{cam.name}</p>
                    <p className="text-slate-600 text-[10px] truncate">{cam.locationName || cam.address?.area}</p>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{cam.district}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{cam.type}</td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{cam.zone || '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_BADGE[cam.status] || STATUS_BADGE.offline}`}>
                      {cam.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 text-[11px] max-w-[160px]">
                    <span className="truncate block">{cam.departmentName}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <button className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition-colors opacity-0 group-hover:opacity-100">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && (
            <div className="py-16 text-center text-slate-600 text-sm">No cameras found</div>
          )}
        </div>
      </div>
    </div>
  );
}

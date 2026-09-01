import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl } from 'react-leaflet';
import { cameraAPI } from '../api';
import { Search, Filter, MapPin, Wifi, WifiOff, Wrench, Camera, X } from 'lucide-react';

const STATUS_COLOR = {
  online:      { fill: '#10b981', label: 'Online',      tw: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  offline:     { fill: '#ef4444', label: 'Offline',     tw: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  maintenance: { fill: '#f59e0b', label: 'Maintenance', tw: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  fault:       { fill: '#f87171', label: 'Fault',       tw: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
};

export default function GISMapPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ['cameras', 'gis'],
    queryFn: () => cameraAPI.getAll({ limit: 500 }).then((r) => r.data.data),
    staleTime: 60000,
  });

  const districts = useMemo(() => ['all', ...new Set(cameras.map((c) => c.district).filter(Boolean))], [cameras]);

  const filtered = useMemo(() => cameras.filter((c) => {
    const matchStatus   = statusFilter === 'all' || c.status === statusFilter;
    const matchDistrict = districtFilter === 'all' || c.district === districtFilter;
    const matchSearch   = !search || c.name?.toLowerCase().includes(search.toLowerCase())
      || c.cameraId?.toLowerCase().includes(search.toLowerCase())
      || c.address?.area?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchDistrict && matchSearch && c.location?.coordinates?.length === 2;
  }), [cameras, statusFilter, districtFilter, search]);

  const counts = useMemo(() => ({
    online:      cameras.filter((c) => c.status === 'online').length,
    offline:     cameras.filter((c) => c.status === 'offline').length,
    maintenance: cameras.filter((c) => c.status === 'maintenance').length,
  }), [cameras]);

  return (
    <div className="flex flex-col h-full">

      {/* Header toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 lg:px-6 py-3 border-b border-white/5 bg-[#0a0d14]/80 backdrop-blur-sm shrink-0">
        <h1 className="text-sm font-bold text-slate-200 flex items-center gap-2 mr-auto">
          <MapPin className="w-4 h-4 text-cyan-400" />GIS Camera Map · Gujarat
        </h1>

        {/* Status badges */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-emerald-400"><span className="w-2 h-2 bg-emerald-400 rounded-full" />{counts.online} Online</span>
          <span className="flex items-center gap-1.5 text-red-400"><span className="w-2 h-2 bg-red-400 rounded-full" />{counts.offline} Offline</span>
          <span className="flex items-center gap-1.5 text-amber-400"><span className="w-2 h-2 bg-amber-400 rounded-full" />{counts.maintenance} Maint.</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cameras…"
            className="bg-white/4 border border-white/8 rounded-lg text-xs text-slate-300 pl-8 pr-3 py-2 outline-none focus:border-blue-500/50 focus:bg-blue-500/5 w-48 placeholder:text-slate-600 transition-all"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white/4 border border-white/8 rounded-lg text-xs text-slate-300 px-3 py-2 outline-none focus:border-blue-500/50 transition-all"
        >
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="maintenance">Maintenance</option>
        </select>

        {/* District filter */}
        <select
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          className="bg-white/4 border border-white/8 rounded-lg text-xs text-slate-300 px-3 py-2 outline-none focus:border-blue-500/50 transition-all max-w-[160px]"
        >
          {districts.map((d) => (
            <option key={d} value={d}>{d === 'all' ? 'All Districts' : d}</option>
          ))}
        </select>

        <span className="text-[11px] text-slate-600 font-mono">{filtered.length} cameras</span>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0d14]/80 z-[2000]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Loading camera network…</p>
            </div>
          </div>
        )}

        <MapContainer
          center={[22.2587, 71.1924]}
          zoom={7}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filtered.map((cam) => {
            const sc = STATUS_COLOR[cam.status] || STATUS_COLOR.offline;
            const isSelected = selected?._id === cam._id;
            return (
              <CircleMarker
                key={cam._id}
                center={[cam.location.coordinates[1], cam.location.coordinates[0]]}
                radius={isSelected ? 9 : 6}
                pathOptions={{
                  fillColor: sc.fill,
                  fillOpacity: isSelected ? 1 : 0.85,
                  color: isSelected ? '#ffffff' : sc.fill,
                  weight: isSelected ? 2 : 1,
                  opacity: 0.8,
                }}
                eventHandlers={{ click: () => setSelected(cam) }}
              />
            );
          })}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-6 left-4 z-[1000] bg-[#141929]/95 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Legend</p>
          {Object.entries(STATUS_COLOR).filter(([k]) => k !== 'fault').map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: val.fill }} />
              <span className="text-[11px] text-slate-400">{val.label}</span>
            </div>
          ))}
        </div>

        {/* Selected camera panel */}
        {selected && (
          <div className="absolute top-4 left-4 z-[1000] bg-[#141929]/98 backdrop-blur-sm border border-white/10 rounded-2xl p-4 w-72 shadow-2xl">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-mono text-slate-500">{selected.cameraId}</p>
                <p className="text-sm font-bold text-slate-200 mt-0.5 leading-tight">{selected.name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status badge */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${STATUS_COLOR[selected.status]?.bg} ${STATUS_COLOR[selected.status]?.border} border ${STATUS_COLOR[selected.status]?.tw}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[selected.status]?.fill }} />
              {selected.status}
            </span>

            <div className="mt-3 space-y-2 text-[12px] text-slate-400">
              <div className="flex justify-between"><span>District</span><span className="text-slate-300 font-medium">{selected.district}</span></div>
              <div className="flex justify-between"><span>Type</span><span className="text-slate-300 font-medium">{selected.type}</span></div>
              <div className="flex justify-between"><span>Zone</span><span className="text-slate-300 font-medium">{selected.zone}</span></div>
              <div className="flex justify-between"><span>Location</span><span className="text-slate-300 font-medium text-right max-w-[160px] truncate">{selected.locationName || selected.address?.area}</span></div>
              <div className="flex justify-between"><span>Dept</span><span className="text-slate-300 font-medium text-right max-w-[160px] truncate">{selected.departmentName}</span></div>
            </div>

            <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-slate-600">
              Coords: {selected.location.coordinates[1].toFixed(5)}°N, {selected.location.coordinates[0].toFixed(5)}°E
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

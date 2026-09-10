import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cameraAPI } from '../api';
import {
  Camera, Search, Plus, MapPin, Filter, Edit2, Trash2,
  Video, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Clock, Shield, Eye, ChevronLeft, ChevronRight, X, UploadCloud
} from 'lucide-react';
import toast from 'react-hot-toast';
import CameraFormModal from '../components/cameras/CameraFormModal';
import CameraStreamModal from '../components/cameras/CameraStreamModal';
import BulkImportModal from '../components/cameras/BulkImportModal';
import { useThemeStore } from '../store/themeStore';

const STATUS_BADGE = {
  online:      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  offline:     'text-red-400 bg-red-500/10 border-red-500/20',
  maintenance: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  fault:       'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

export default function CameraManagementPage() {
  const queryClient = useQueryClient();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  // Search and filters
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [streamCamera, setStreamCamera] = useState(null);
  const [deletingCamera, setDeletingCamera] = useState(null);

  // Query all cameras
  const { data: cameras = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['cameras', 'management'],
    queryFn: () => cameraAPI.getAll({ limit: 0 }).then((r) => r.data.data || []),
    staleTime: 30000,
  });

  // Delete camera mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => cameraAPI.delete(id),
    onSuccess: () => {
      toast.success('Camera decommissioned from database');
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      setDeletingCamera(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to delete camera');
    },
  });

  // Filter options derived from data
  const districts = useMemo(() => {
    const set = new Set(cameras.map((c) => c.district).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [cameras]);

  const zones = useMemo(() => {
    const set = new Set(cameras.map((c) => c.zone).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [cameras]);

  const types = useMemo(() => {
    const set = new Set(cameras.map((c) => c.type).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [cameras]);

  // KPI counts
  const stats = useMemo(() => ({
    total: cameras.length,
    online: cameras.filter((c) => (c.status || '').toLowerCase() === 'online').length,
    offline: cameras.filter((c) => (c.status || '').toLowerCase() === 'offline').length,
    maintenance: cameras.filter((c) => ['maintenance', 'fault'].includes((c.status || '').toLowerCase())).length,
  }), [cameras]);

  // Filtered cameras
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cameras.filter((c) => {
      const matchD = districtFilter === 'all' || c.district === districtFilter;
      const matchS = statusFilter === 'all' || (c.status || '').toLowerCase() === statusFilter.toLowerCase();
      const matchZ = zoneFilter === 'all' || c.zone === zoneFilter;
      const matchT = typeFilter === 'all' || c.type === typeFilter;

      const matchQ =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.cameraName?.toLowerCase().includes(q) ||
        c.cameraId?.toLowerCase().includes(q) ||
        c.district?.toLowerCase().includes(q) ||
        c.locationName?.toLowerCase().includes(q) ||
        c.roadName?.toLowerCase().includes(q) ||
        c.streamId?.toLowerCase().includes(q) ||
        c.brand?.toLowerCase().includes(q);

      return matchD && matchS && matchZ && matchT && matchQ;
    });
  }, [cameras, search, districtFilter, statusFilter, zoneFilter, typeFilter]);

  // Paginated cameras
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedCameras = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Reset page on filter change
  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const openCreateModal = () => {
    setEditingCamera(null);
    setFormModalOpen(true);
  };

  const openEditModal = (camera) => {
    setEditingCamera(camera);
    setFormModalOpen(true);
  };

  const confirmDelete = () => {
    if (deletingCamera) {
      deleteMutation.mutate(deletingCamera._id);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-[#141929] border border-white/8 p-5 rounded-2xl">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">Camera Management</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure, register, and update CCTV surveillance nodes across Gujarat State
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            title="Refresh list"
            disabled={isFetching}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/8'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-500' : isLight ? 'text-slate-600' : 'text-slate-400'}`} />
          </button>
          <button
            id="bulk-import-camera-btn"
            onClick={() => setBulkImportOpen(true)}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm ${
              isLight
                ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 hover:border-blue-400 shadow-blue-500/5'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 hover:border-blue-500/40'
            }`}
          >
            <UploadCloud className={`w-4 h-4 shrink-0 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
            <span className={isLight ? 'text-blue-700 font-bold' : 'text-slate-200 font-bold'}>Bulk Import</span>
          </button>
          <button
            id="add-camera-btn"
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-[0_0_16px_rgba(59,130,246,0.3)] hover:shadow-[0_0_24px_rgba(59,130,246,0.5)] cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add New Camera
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#141929] border border-white/8 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Registered</p>
            <h3 className="text-2xl font-black text-slate-100 mt-1 font-mono">{stats.total}</h3>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Camera className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#141929] border border-white/8 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Online & Active</p>
            <h3 className="text-2xl font-black text-emerald-400 mt-1 font-mono">{stats.online}</h3>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#141929] border border-white/8 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Offline / Disconnected</p>
            <h3 className="text-2xl font-black text-rose-400 mt-1 font-mono">{stats.offline}</h3>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#141929] border border-white/8 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Maintenance / Fault</p>
            <h3 className="text-2xl font-black text-amber-400 mt-1 font-mono">{stats.maintenance}</h3>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-[#141929] border border-white/8 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={handleSearchChange}
              placeholder="Search ID, name, district, road..."
              className="w-full bg-[#0f1422] border border-white/10 rounded-xl text-xs text-slate-200 pl-9 pr-3 py-2.5 outline-none focus:border-blue-500 transition-colors placeholder:text-slate-500"
            />
          </div>

          {/* District */}
          <select
            value={districtFilter}
            onChange={handleFilterChange(setDistrictFilter)}
            className="bg-[#0f1422] border border-white/10 rounded-xl text-xs text-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 transition-colors"
          >
            {districts.map((d) => (
              <option key={d} value={d}>{d === 'all' ? 'All Districts' : d}</option>
            ))}
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={handleFilterChange(setStatusFilter)}
            className="bg-[#0f1422] border border-white/10 rounded-xl text-xs text-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 transition-colors"
          >
            <option value="all">All Statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="maintenance">Maintenance</option>
            <option value="fault">Fault</option>
          </select>

          {/* Zone */}
          <select
            value={zoneFilter}
            onChange={handleFilterChange(setZoneFilter)}
            className="bg-[#0f1422] border border-white/10 rounded-xl text-xs text-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 transition-colors"
          >
            {zones.map((z) => (
              <option key={z} value={z}>{z === 'all' ? 'All Zones' : z}</option>
            ))}
          </select>

          {/* Type */}
          <select
            value={typeFilter}
            onChange={handleFilterChange(setTypeFilter)}
            className="bg-[#0f1422] border border-white/10 rounded-xl text-xs text-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 transition-colors"
          >
            {types.map((t) => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>
            ))}
          </select>

          {(search || districtFilter !== 'all' || statusFilter !== 'all' || zoneFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setDistrictFilter('all');
                setStatusFilter('all');
                setZoneFilter('all');
                setTypeFilter('all');
                setCurrentPage(1);
              }}
              className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing <span className="text-blue-400 font-bold">{paginatedCameras.length}</span> of{' '}
          <span className="text-slate-200 font-bold">{filtered.length}</span> results
        </div>
      </div>

      {/* Cameras Table */}
      <div className="bg-[#141929] border border-white/8 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/8 bg-[#0f1422]/60">
                <th className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Camera ID</th>
                <th className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Name & Placement</th>
                <th className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">District / City</th>
                <th className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Zone</th>
                <th className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Feed Stream</th>
                <th className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                      <span className="text-xs">Loading camera registry from MongoDB...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedCameras.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Camera className="w-8 h-8 text-slate-600 mb-1" />
                      <p className="text-sm font-semibold text-slate-300">No cameras found matching filters</p>
                      <p className="text-xs text-slate-500">Try adjusting your search criteria or register a new camera</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCameras.map((cam) => {
                  const status = (cam.status || 'offline').toLowerCase();
                  const badgeClass = STATUS_BADGE[status] || STATUS_BADGE.offline;

                  return (
                    <tr key={cam._id} className="hover:bg-white/[0.02] transition-colors group">
                      {/* Camera ID */}
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-blue-400 whitespace-nowrap">
                        {cam.cameraId}
                      </td>

                      {/* Name & Placement */}
                      <td className="px-4 py-3.5 max-w-[240px]">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-200 truncate">{cam.name || cam.cameraName}</p>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {cam.locationName || cam.roadName || cam.address?.area || cam.address?.full || 'Gujarat Location'}
                        </p>
                      </td>

                      {/* District & City */}
                      <td className="px-4 py-3.5 text-xs text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{cam.district}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 ml-5 block">
                          {cam.city || cam.taluka || 'Gujarat'}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        <span className="px-2 py-0.5 rounded-md bg-white/4 border border-white/8 text-[11px] font-mono">
                          {cam.type || 'Fixed'}
                        </span>
                      </td>

                      {/* Zone */}
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        <span className="text-[11px] text-slate-300">{cam.zone || 'Traffic'}</span>
                      </td>

                      {/* Feed Stream */}
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                        <span className="text-slate-300 font-medium">{cam.streamId || 'cam01'}</span>
                        <span className="text-[10px] text-slate-500 ml-1.5">({cam.streamType || 'HLS'})</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Preview Stream */}
                          <button
                            onClick={() => setStreamCamera(cam)}
                            title="Preview Live Stream"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          >
                            <Video className="w-4 h-4" />
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => openEditModal(cam)}
                            title="Edit Camera Details"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => setDeletingCamera(cam)}
                            title="Delete / Decommission"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-white/8 flex items-center justify-between flex-wrap gap-3 bg-[#0f1422]/60">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-[#141929] border border-white/10 rounded-lg text-xs text-slate-300 px-2 py-1 outline-none focus:border-blue-500"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              Page <span className="text-slate-200 font-bold">{currentPage}</span> of{' '}
              <span className="text-slate-200 font-bold">{totalPages}</span>
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 border border-white/8 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 border border-white/8 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Add / Edit Modal */}
      <CameraFormModal
        isOpen={formModalOpen}
        camera={editingCamera}
        onClose={() => {
          setFormModalOpen(false);
          setEditingCamera(null);
        }}
      />

      {/* Stream Modal */}
      {streamCamera && (
        <CameraStreamModal
          camera={streamCamera}
          onClose={() => setStreamCamera(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingCamera && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
          <div className="bg-[#141929] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Decommission Camera?</h3>
                <p className="text-xs text-slate-400 mt-0.5">This action will remove the camera from active surveillance</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/4 border border-white/6 text-xs space-y-1 font-mono">
              <p className="text-slate-300 font-bold">{deletingCamera.name || deletingCamera.cameraName}</p>
              <p className="text-blue-400">ID: {deletingCamera.cameraId}</p>
              <p className="text-slate-500">District: {deletingCamera.district}</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCamera(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-[0_0_16px_rgba(239,68,68,0.4)]"
              >
                {deleteMutation.isPending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Decommissioning...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm Decommission
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Camera Onboarding & Registry Import Modal */}
      <BulkImportModal
        isOpen={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImportSuccess={() => refetch()}
      />
    </div>
  );
}

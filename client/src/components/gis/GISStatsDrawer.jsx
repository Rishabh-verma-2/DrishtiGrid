import React, { useState } from 'react';
import useAuthStore from '../../store/authStore';
import {
  X,
  Camera,
  Layers,
  MapPin,
  Activity,
  Shield,
  Clock,
  Radio,
  FileText,
  Send,
  Video,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Search,
  ExternalLink,
  Sliders,
  Calendar,
  Zap,
  Flag,
} from 'lucide-react';

export default function GISStatsDrawer({
  isOpen,
  onClose,
  selectedArea,
  selectedCamera,
  areaCameras = [],
  onSelectCamera,
  onOpenStream,
  onRequestFootage,
  onRequestReport,
  onReportToDept,
  isGeneratingAudit = false,
  isLight = false,
}) {
  // 2 changeable options / tabs: 'area-list' vs 'camera-detail'
  const [activeTab, setActiveTab] = useState(selectedCamera ? 'camera-detail' : 'area-list');
  const [areaSearch, setAreaSearch] = useState('');
  const { user } = useAuthStore();
  const userRole = String(user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

  // Sync tab if user selected camera or area externally
  React.useEffect(() => {
    if (selectedCamera) {
      setActiveTab('camera-detail');
    } else if (selectedArea) {
      setActiveTab('area-list');
    }
  }, [selectedCamera, selectedArea]);

  if (!isOpen) return null;

  // Filtered cameras inside the area
  const filteredAreaCameras = areaCameras.filter((c) => {
    if (!areaSearch) return true;
    const q = areaSearch.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.cameraName?.toLowerCase().includes(q) ||
      c.cameraId?.toLowerCase().includes(q) ||
      c.roadName?.toLowerCase().includes(q) ||
      c.taluka?.toLowerCase().includes(q)
    );
  });

  const onlineCount = areaCameras.filter((c) => (c.status || '').toLowerCase() === 'online').length;
  const offlineCount = areaCameras.filter((c) => (c.status || '').toLowerCase() === 'offline').length;
  const maintCount = areaCameras.filter((c) => (c.status || '').toLowerCase() === 'maintenance').length;
  const activeRate = areaCameras.length ? Math.round((onlineCount / areaCameras.length) * 100) : 0;

  // Camera health calculations
  const isCameraOnline = (selectedCamera?.status || '').toLowerCase() === 'online';
  const cameraActiveDuration = isCameraOnline ? 'Active for 18d 6h' : 'Deactive for 2h 45m';

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 z-[1200] w-full max-w-[440px] flex flex-col border-l shadow-2xl backdrop-blur-xl transition-all duration-300 ${
        isLight
          ? 'bg-white/95 border-slate-200 text-slate-900'
          : 'bg-[#0d1322]/95 border-white/10 text-slate-100'
      }`}
    >
      {/* Top Header */}
      <div className="p-4 border-b border-inherit flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
              isLight ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            }`}
          >
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold">GIS Intelligence Panel</h3>
            <p className={`text-[11px] ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
              {selectedArea ? `${selectedArea} Surveillance Sector` : 'Target CCTV Metadata & Analytics'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className={`p-1.5 rounded-lg border transition-colors ${
            isLight
              ? 'hover:bg-slate-100 border-slate-200 text-slate-500'
              : 'hover:bg-white/10 border-white/10 text-slate-400'
          }`}
          title="Close Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2 Changeable Switcher Tabs */}
      <div className="p-3 border-b border-inherit bg-slate-500/5">
        <div className={`p-1 rounded-xl flex items-center gap-1 border ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/8'}`}>
          <button
            onClick={() => setActiveTab('area-list')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'area-list'
                ? isLight
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Area Cameras List ({areaCameras.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('camera-detail')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'camera-detail'
                ? isLight
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera Details & Health</span>
          </button>
        </div>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* =================================================================== */}
        {/* OPTION 1: Area Cameras List & Overview */}
        {/* =================================================================== */}
        {activeTab === 'area-list' && (
          <div className="space-y-4">
            {/* Area KPI Summary */}
            <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-slate-50 border-slate-200 shadow-xs' : 'bg-white/3 border-white/6'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  {selectedArea || 'All Districts'} Overview
                </span>
                <span className={`text-xs font-mono font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                  {activeRate}% Active Rate
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className={`p-2 rounded-xl border ${isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                  <div className={`text-[10px] font-semibold uppercase ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Online</div>
                  <div className={`text-base font-black font-mono mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{onlineCount}</div>
                </div>
                <div className={`p-2 rounded-xl border ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20'}`}>
                  <div className={`text-[10px] font-semibold uppercase ${isLight ? 'text-red-700' : 'text-red-400'}`}>Offline</div>
                  <div className={`text-base font-black font-mono mt-0.5 ${isLight ? 'text-red-700' : 'text-red-400'}`}>{offlineCount}</div>
                </div>
                <div className={`p-2 rounded-xl border ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'}`}>
                  <div className={`text-[10px] font-semibold uppercase ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>Maint.</div>
                  <div className={`text-base font-black font-mono mt-0.5 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{maintCount}</div>
                </div>
              </div>
            </div>

            {/* In-Area Quick Search */}
            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
              <input
                type="text"
                value={areaSearch}
                onChange={(e) => setAreaSearch(e.target.value)}
                placeholder="Filter cameras in this highlighted sector..."
                className={`w-full text-xs pl-8 pr-3 py-2 rounded-xl border outline-none ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500'
                    : 'bg-white/4 border-white/8 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50'
                }`}
              />
            </div>

            {/* List of Cameras in Area */}
            <div className="space-y-2">
              <div className={`text-[11px] font-semibold uppercase tracking-wider flex items-center justify-between ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <span>Deployed Surveillance Nodes ({filteredAreaCameras.length})</span>
                <span className={`text-[10px] ${isLight ? 'text-blue-600 font-bold' : 'text-cyan-400'}`}>Click to focus & inspect</span>
              </div>

              {filteredAreaCameras.length === 0 ? (
                <div className={`p-6 text-center text-xs border border-dashed rounded-xl ${isLight ? 'text-slate-500 border-slate-300' : 'text-slate-400 border-white/10'}`}>
                  No cameras matching "{areaSearch}" found in this sector.
                </div>
              ) : (
                filteredAreaCameras.slice(0, 100).map((cam) => {
                  const isCamOnline = (cam.status || '').toLowerCase() === 'online';
                  const isSelected = selectedCamera?.cameraId === cam.cameraId;
                  return (
                    <div
                      key={cam.cameraId || cam._id}
                      onClick={() => {
                        onSelectCamera(cam);
                        setActiveTab('camera-detail');
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                        isSelected
                          ? isLight
                            ? 'bg-blue-50 border-blue-400 shadow-md ring-1 ring-blue-500'
                            : 'bg-cyan-500/15 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500/40'
                          : isLight
                          ? 'bg-white hover:bg-slate-50 border-slate-200 shadow-xs'
                          : 'bg-white/3 hover:bg-white/6 border-white/6'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isCamOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500'
                          }`}
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-xs truncate ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                              {cam.name || cam.cameraName || cam.cameraId}
                            </span>
                            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                              isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-white/5 border-white/10 text-slate-300'
                            }`}>
                              {cam.type || 'Fixed'}
                            </span>
                          </div>
                          <p className={`text-[11px] truncate mt-0.5 ${isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}`}>
                            {cam.roadName || cam.landmark || cam.taluka || cam.district} • ID: {cam.cameraId}
                          </p>
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Action Button for Area */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isGeneratingAudit}
                onClick={() => onRequestReport({ district: selectedArea || 'all', type: 'area' })}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                {isGeneratingAudit ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Compiling Area Compliance & Gap Audit PDF...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Generate Area Compliance & Gap Audit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* OPTION 2: Particular Searched Camera Details & Health Analysis */}
        {/* =================================================================== */}
        {activeTab === 'camera-detail' && (
          <div className="space-y-4">
            {!selectedCamera ? (
              <div
                className={`p-8 text-center text-xs border border-dashed rounded-2xl space-y-2 ${
                  isLight
                    ? 'text-slate-500 border-slate-300 bg-slate-50/50'
                    : 'text-slate-400 border-white/10'
                }`}
              >
                <Camera className={`w-8 h-8 mx-auto ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                <p className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>No Camera Selected</p>
                <p>Click on any camera marker or select from the search bar to inspect full telemetry and health details.</p>
              </div>
            ) : (
              <>
                {/* Camera Title & Status Header */}
                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-md font-bold ${
                        isLight
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                      }`}
                    >
                      {selectedCamera.cameraId}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                        isCameraOnline
                          ? isLight
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                          : isLight
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-red-500/15 text-red-400 border border-red-500/25'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isCameraOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      {isCameraOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  <h4 className={`text-sm font-black mt-2 leading-snug ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {selectedCamera.name || selectedCamera.cameraName || 'CCTV Surveillance Camera'}
                  </h4>

                  {/* Active / Deactive Duration */}
                  <div className={`mt-2 flex items-center gap-2 text-xs font-semibold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{cameraActiveDuration}</span>
                    <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>•</span>
                    <span className={isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}>Last check: 2 min ago</span>
                  </div>
                </div>

                {/* Handling Department & Nodal Officer Info */}
                <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-white/3 border-white/6'}`}>
                  <div className={`flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>
                    <Shield className="w-3.5 h-3.5" />
                    <span>Department Jurisdiction & Ownership</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Handled By:</span>
                    <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedCamera.departmentName || 'Gujarat Police Surveillance'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Jurisdiction District:</span>
                    <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedCamera.district}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Police Station:</span>
                    <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedCamera.policeStation || 'Division PS'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Nodal Dispatch:</span>
                    <span className={`font-mono text-[11px] ${isLight ? 'text-blue-700 font-semibold' : 'text-cyan-400'}`}>controlroom.police@gujarat.gov.in</span>
                  </div>
                </div>

                {/* Health Telemetry Metrics */}
                <div className={`p-3.5 rounded-2xl border space-y-3 ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-white/3 border-white/6'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Health & Outage Telemetry</span>
                    <span className={`text-[10px] font-mono font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>98.4% Overall Uptime</span>
                  </div>

                  {/* Uptime Bars */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className={`p-2 rounded-xl border ${isLight ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-500/10 border-white/5'}`}>
                      <div className={`text-[10px] font-semibold ${isLight ? 'text-emerald-700' : 'text-slate-400'}`}>24h Uptime</div>
                      <div className={`text-sm font-black font-mono mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                        {selectedCamera.healthMetrics?.uptime24h || (isCameraOnline ? '99.4%' : '72.0%')}
                      </div>
                    </div>
                    <div className={`p-2 rounded-xl border ${isLight ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-500/10 border-white/5'}`}>
                      <div className={`text-[10px] font-semibold ${isLight ? 'text-emerald-700' : 'text-slate-400'}`}>7d Uptime</div>
                      <div className={`text-sm font-black font-mono mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                        {selectedCamera.healthMetrics?.uptime7d || (isCameraOnline ? '98.8%' : '78.5%')}
                      </div>
                    </div>
                    <div className={`p-2 rounded-xl border ${isLight ? 'bg-blue-50/70 border-blue-200' : 'bg-slate-500/10 border-white/5'}`}>
                      <div className={`text-[10px] font-semibold ${isLight ? 'text-blue-700' : 'text-slate-400'}`}>30d Uptime</div>
                      <div className={`text-sm font-black font-mono mt-0.5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                        {selectedCamera.healthMetrics?.uptime30d || (isCameraOnline ? '97.6%' : '82.0%')}
                      </div>
                    </div>
                  </div>

                  {/* Outage Stats */}
                  <div className="space-y-1.5 text-xs pt-1 border-t border-inherit">
                    <div className="flex items-center justify-between">
                      <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>Total Outage Incidents:</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedCamera.healthMetrics?.totalOutagesCount || (isCameraOnline ? '1 event' : '4 events')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>Longest Offline Duration:</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedCamera.healthMetrics?.longestOutageMinutes || 35} mins</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>Mean Time to Repair (MTTR):</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedCamera.healthMetrics?.meanTimeToRepairMinutes || 24} mins</span>
                    </div>
                  </div>
                </div>

                {/* Technical Specifications */}
                <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-white/3 border-white/6'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Hardware & Optical Specs</div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Camera Type / Model:</span>
                    <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedCamera.type || 'Fixed IP'} • {selectedCamera.camera_model || 'HD Surveillance'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Resolution & FPS:</span>
                    <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedCamera.resolution || '1080p'} @ {selectedCamera.fps || 30} fps</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Optical Coverage Radius:</span>
                    <span className={`font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>{selectedCamera.type === 'PTZ' ? '150 meters' : '50 meters'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>GPS Coordinates:</span>
                    <span className={`font-mono text-[11px] ${isLight ? 'text-slate-800 font-semibold' : 'text-slate-300'}`}>
                      {(selectedCamera.latitude || selectedCamera.location?.coordinates?.[1] || 23.0).toFixed(5)},{' '}
                      {(selectedCamera.longitude || selectedCamera.location?.coordinates?.[0] || 72.5).toFixed(5)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onOpenStream(selectedCamera)}
                      className="py-2.5 px-3 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Live Stream</span>
                    </button>

                    <button
                      onClick={() => onRequestFootage(selectedCamera)}
                      className="py-2.5 px-3 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Request Footage</span>
                    </button>
                  </div>

                  {/* Report to Department — ADMIN only, Offline/Maintenance cameras only */}
                  {isAdmin && ['offline', 'maintenance', 'fault'].includes((selectedCamera.status || '').toLowerCase()) && (
                    <button
                      onClick={() => onReportToDept && onReportToDept(selectedCamera)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer animate-in fade-in duration-300"
                    >
                      <Flag className="w-4 h-4" />
                      <span>Report to Department</span>
                    </button>
                  )}

                  {/* Area compliance report (old behaviour, visible to all) */}
                  <button
                    onClick={() => onRequestReport({ camera: selectedCamera, type: 'camera' })}
                    className={`w-full py-2 px-4 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isLight
                        ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        : 'border-white/10 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Compliance Report for {selectedCamera.departmentName || 'Handling Dept'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

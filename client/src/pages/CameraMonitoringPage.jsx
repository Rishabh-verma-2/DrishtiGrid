import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { streamAPI } from '../api';
import {
  Video, Radio, Search, Filter, Grid3X3, Grid2X2,
  Maximize, LayoutGrid, MapPin, Eye, RefreshCw,
  ExternalLink, Layers, Shield, Play, Copy, Check,
  Terminal, ShieldCheck, Zap, Globe, Info, ChevronRight,
  Sparkles, Sliders
} from 'lucide-react';
import CameraPlayer from '../components/cameras/CameraPlayer';
import CameraStreamModal from '../components/cameras/CameraStreamModal';
import toast from 'react-hot-toast';

export default function CameraMonitoringPage() {
  const [search, setSearch] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [activeCamera, setActiveCamera] = useState(null); // For modal popup
  const [viewLayout, setViewLayout] = useState('grid'); // 'grid' | 'cinema' | 'quad' | 'matrix'
  const [cinemaCamId, setCinemaCamId] = useState('cam01');
  const [showIntegratorGuide, setShowIntegratorGuide] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // Fetch dynamic 30 feeds from Sentinel catalogue
  const { data: streamResponse, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['liveFeeds'],
    queryFn: () => streamAPI.getFeeds().then((r) => r.data),
    staleTime: 60000,
  });

  const feeds = streamResponse?.data || [];

  // Extract unique districts
  const districts = useMemo(() => {
    const list = new Set(feeds.map((f) => f.district).filter(Boolean));
    return ['all', ...Array.from(list)];
  }, [feeds]);

  // Filter feeds based on search and district
  const filteredFeeds = useMemo(() => {
    return feeds.filter((cam) => {
      const matchD = selectedDistrict === 'all' || cam.district === selectedDistrict;
      const matchS =
        !search ||
        cam.name?.toLowerCase().includes(search.toLowerCase()) ||
        cam.id?.toLowerCase().includes(search.toLowerCase()) ||
        cam.district?.toLowerCase().includes(search.toLowerCase()) ||
        cam.area?.toLowerCase().includes(search.toLowerCase());
      return matchD && matchS;
    });
  }, [feeds, selectedDistrict, search]);

  const cinemaCamera = useMemo(() => {
    return feeds.find((f) => f.id === cinemaCamId) || feeds[0];
  }, [feeds, cinemaCamId]);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-5">

      {/* ─── Page Title & Live Network Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Live Camera Monitoring
            </h1>
            <span className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              30 Feeds Online
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gujarat Sentinel CCTV Grid · Direct RTSP (Port 8554 TCP) Low-Latency Feed Pipeline
          </p>
        </div>

        {/* Action Controls & Layout Switcher */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Integrator Guide Toggle */}
          <button
            type="button"
            onClick={() => setShowIntegratorGuide((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showIntegratorGuide
                ? 'bg-blue-600 text-white border-blue-600 shadow'
                : 'bg-slate-100 dark:bg-[#141929] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Integrator Reference</span>
          </button>

          {/* Layout Switcher Buttons */}
          <div className="flex items-center bg-slate-100 dark:bg-[#141929] border border-slate-200 dark:border-white/10 rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewLayout('grid')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                viewLayout === 'grid'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="All 30 Feeds Catalog Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Grid (30)
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('cinema')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                viewLayout === 'cinema'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Spotlight Cinema View"
            >
              <Maximize className="w-3.5 h-3.5" /> Spotlight
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('quad')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                viewLayout === 'quad'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Quad View (4 Cameras)"
            >
              <Grid2X2 className="w-3.5 h-3.5" /> 2x2
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('matrix')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                viewLayout === 'matrix'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Matrix View (9 Cameras)"
            >
              <Grid3X3 className="w-3.5 h-3.5" /> 3x3
            </button>
          </div>

          {/* Refresh Feeds Button */}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 bg-slate-100 dark:bg-[#141929] hover:bg-slate-200 dark:hover:bg-[#1e2740] border border-slate-200 dark:border-white/10 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all disabled:opacity-50 cursor-pointer"
            title="Refresh Feeds Catalogue"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── Sentinel Integrator Quick Reference Banner (Expandable) ─── */}
      {showIntegratorGuide && (
        <div className="bg-slate-50 dark:bg-[#141929] border border-blue-500/30 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4 animate-[fadeIn_0.2s_ease]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Sentinel Camera Grid · Direct RTSP Access Model
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/20">
              RTSP Gateway: 103.250.160.189:8554 (TCP)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-white dark:bg-[#0b101b] p-3 rounded-xl border border-emerald-500/30 ring-1 ring-emerald-500/20">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-1">
                <Terminal className="w-3.5 h-3.5 text-emerald-500" /> RTSP Direct (Port 8554 TCP) ★
              </span>
              <code className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 block truncate">
                rtsp://&lt;email&gt;:&lt;password&gt;@103.250.160.189:8554/stream/&lt;id&gt;
              </code>
              <p className="text-[10px] text-slate-500 mt-1">Direct camera stream for AI inference, Section 65B analysis, FFmpeg. Force TCP.</p>
            </div>

            <div className="bg-white dark:bg-[#0b101b] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" /> WebRTC WHEP (Port 8889)
              </span>
              <code className="text-[11px] font-mono text-amber-600 dark:text-amber-400 block truncate">
                http://&lt;email&gt;:&lt;password&gt;@103.250.160.189:8889/stream/&lt;id&gt;/whep
              </code>
              <p className="text-[10px] text-slate-500 mt-1">Sub-second low-latency real-time browser preview.</p>
            </div>

            <div className="bg-white dark:bg-[#0b101b] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-1">
                <Globe className="w-3.5 h-3.5 text-blue-500" /> HLS Playlist (AES-128)
              </span>
              <code className="text-[11px] font-mono text-blue-600 dark:text-blue-400 block truncate">
                https://cctv.corp8.cloud/&lt;id&gt;/index.m3u8
              </code>
              <p className="text-[10px] text-slate-500 mt-1">Dashboards, mobile, restricted networks.</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Search & District Filter Bar ─── */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-[#141929] border border-slate-200 dark:border-white/5 p-3 rounded-2xl">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by location, district, or ID (e.g. Chiman bhai, Paldi, cam01, Rajkot)..."
            className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-slate-200 pl-9 pr-3 py-2.5 outline-none focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* District Filter Pill Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
          {districts.map((dist) => (
            <button
              key={dist}
              type="button"
              onClick={() => setSelectedDistrict(dist)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedDistrict === dist
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-transparent'
              }`}
            >
              {dist === 'all' ? 'All Districts' : dist}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono ml-auto">
          {filteredFeeds.length} / 30 Feeds
        </span>
      </div>

      {/* ─── Layout 1: Cinema Spotlight View ─── */}
      {viewLayout === 'cinema' && cinemaCamera && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Main Stage Player */}
          <div className="lg:col-span-3 space-y-3">
            <CameraPlayer
              streamId={cinemaCamera.id}
              cameraName={cinemaCamera.name}
              district={cinemaCamera.district}
              aspectRatio="aspect-video"
              className="w-full shadow-2xl rounded-2xl"
              showControls={true}
              autoConnect={true}
            />

            {/* Spotlight Metadata & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-[#141929] border border-slate-200 dark:border-white/5 p-4 rounded-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 px-2 py-0.5 rounded">
                    {cinemaCamera.id.toUpperCase()}
                  </span>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{cinemaCamera.name}</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {cinemaCamera.district} · {cinemaCamera.area || 'Gujarat Command Grid'} · Zone: {cinemaCamera.zone || 'Traffic'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(cinemaCamera.streamUrl?.rtsp || '', 'rtsp-cinema')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  title="Copy RTSP URL"
                >
                  {copiedKey === 'rtsp-cinema' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'rtsp-cinema' ? 'Copied' : 'Copy RTSP'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCamera(cinemaCamera)}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow transition-all cursor-pointer"
                >
                  <Maximize className="w-3.5 h-3.5" /> Full Stream Inspector
                </button>
              </div>
            </div>
          </div>

          {/* Side Feed List Drawer */}
          <div className="bg-slate-50 dark:bg-[#141929] border border-slate-200 dark:border-white/5 rounded-2xl p-3 max-h-[600px] overflow-y-auto space-y-2 custom-sidebar-scrollbar">
            <div className="flex items-center justify-between px-2 py-1 border-b border-slate-200 dark:border-white/5 pb-2 mb-1">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Sentinel Feeds ({filteredFeeds.length})
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            {filteredFeeds.map((cam) => {
              const isSelected = cinemaCamId === cam.id;
              return (
                <div
                  key={cam.id}
                  onClick={() => setCinemaCamId(cam.id)}
                  className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-transparent'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {cam.id.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold truncate max-w-[170px]">{cam.name}</span>
                    </div>
                    <p className={`text-[10px] mt-0.5 truncate ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {cam.district} · {cam.area || 'Active'}
                    </p>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Layout 2: Quad View (2x2 Grid) ─── */}
      {viewLayout === 'quad' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredFeeds.slice(0, 4).map((cam) => (
            <div key={cam.id} className="relative group bg-slate-50 dark:bg-[#141929] border border-slate-200 dark:border-white/5 p-2.5 rounded-2xl shadow-lg">
              <CameraPlayer
                streamId={cam.id}
                cameraName={cam.name}
                district={cam.district}
                aspectRatio="aspect-video"
                className="w-full rounded-xl"
                showControls={true}
                autoConnect={true}
              />
              <div className="mt-2.5 flex items-center justify-between px-1">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[220px]">{cam.name}</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{cam.district} · {cam.area}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCamera(cam)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Maximize className="w-3 h-3" /> Inspect
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Layout 3: Matrix View (3x3 Grid) ─── */}
      {viewLayout === 'matrix' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFeeds.slice(0, 9).map((cam) => (
            <div key={cam.id} className="relative group bg-slate-50 dark:bg-[#141929] border border-slate-200 dark:border-white/5 p-2.5 rounded-2xl shadow-lg">
              <CameraPlayer
                streamId={cam.id}
                cameraName={cam.name}
                district={cam.district}
                aspectRatio="aspect-video"
                className="w-full rounded-xl"
                showControls={true}
                autoConnect={true}
              />
              <div className="mt-2 flex items-center justify-between px-1">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[160px]">{cam.name}</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{cam.district}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCamera(cam)}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Maximize className="w-3 h-3" /> Inspect
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Layout 4: All 30 Feeds Interactive Catalog Grid ─── */}
      {viewLayout === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFeeds.map((cam) => (
            <div
              key={cam.id}
              onClick={() => setActiveCamera(cam)}
              className="bg-white dark:bg-[#141929] border border-slate-200 dark:border-white/7 rounded-2xl p-3.5 hover:border-blue-500/50 hover:shadow-xl dark:hover:shadow-blue-500/10 transition-all duration-200 group cursor-pointer flex flex-col justify-between shadow-sm"
            >
              {/* Standby CCTV Card Thumbnail (Zero network/GPU load until clicked - matching first commit) */}
              <div className="relative aspect-video bg-slate-900 dark:bg-[#080c16] rounded-xl overflow-hidden mb-3 border border-slate-800 dark:border-white/5 flex flex-col justify-between p-3 group-hover:border-blue-500/40 transition-colors camera-card-thumbnail cctv-player-container">
                {/* Surveillance HUD scanline overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-25 [background:radial-gradient(ellipse_at_center,#1e3a8a_0%,transparent_70%),repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.4)_2px,rgba(0,0,0,0.4)_4px)]" />

                {/* Top card badges */}
                <div className="relative z-10 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded shadow-xs">
                    {cam.id.toUpperCase()}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-500/40 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
                    LIVE
                  </span>
                </div>

                {/* Center Action Button */}
                <div className="relative z-10 flex flex-col items-center justify-center py-2">
                  <div className="w-11 h-11 rounded-full bg-blue-600/30 group-hover:bg-blue-600 border border-blue-500/40 group-hover:border-blue-400 flex items-center justify-center text-blue-400 group-hover:text-white transition-all transform group-hover:scale-110 shadow-lg">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-200 group-hover:text-emerald-300 mt-2 transition-colors font-mono">
                    Connect RTSP Feed
                  </span>
                </div>

                {/* Bottom resolution tag */}
                <div className="relative z-10 flex items-center justify-between text-[10px] text-slate-200 font-mono">
                  <span className="text-emerald-400 font-bold">1080p · RTSP TCP · 30 FPS</span>
                  <span className="text-slate-300">{cam.district}</span>
                </div>
              </div>

              {/* Feed Metadata */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    {cam.type || 'PTZ Dome'}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">Port 8554 TCP</span>
                </div>

                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {cam.name}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  {cam.district} · {cam.area || 'Command Grid'}
                </p>
              </div>

              {/* Bottom Quick Action Tag */}
              <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(cam.streamUrl?.rtsp || '', `rtsp-${cam.id}`);
                  }}
                  className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 font-mono text-[10px] font-bold cursor-pointer"
                  title="Copy Authenticated RTSP URL"
                >
                  {copiedKey === `rtsp-${cam.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === `rtsp-${cam.id}` ? 'Copied' : 'Copy RTSP'}</span>
                </button>

                <span className="text-blue-600 dark:text-blue-400 group-hover:underline text-xs font-bold flex items-center gap-1">
                  Inspect RTSP <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <div className="w-10 h-10 border-2 border-slate-300 dark:border-white/10 border-t-blue-500 rounded-full animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Connecting to Sentinel 30-Feed Grid…</p>
        </div>
      )}

      {/* Empty Filter Results */}
      {!isLoading && filteredFeeds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600 bg-slate-50 dark:bg-[#141929] rounded-2xl border border-slate-200 dark:border-white/5">
          <Video className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No cameras found matching your search</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setSelectedDistrict('all'); }}
            className="mt-3 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10 rounded-xl cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* ─── Active Stream Inspection Modal ─── */}
      {activeCamera && (
        <CameraStreamModal
          camera={activeCamera}
          onClose={() => setActiveCamera(null)}
        />
      )}

    </div>
  );
}

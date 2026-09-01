import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { streamAPI } from '../api';
import {
  Video, Radio, Search, Filter, Grid3X3, Grid2X2,
  Maximize, LayoutGrid, MapPin, Eye, RefreshCw,
  ExternalLink, Layers, Shield, Play
} from 'lucide-react';
import CameraPlayer from '../components/cameras/CameraPlayer';
import CameraStreamModal from '../components/cameras/CameraStreamModal';

export default function CameraMonitoringPage() {
  const [search, setSearch] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [activeCamera, setActiveCamera] = useState(null); // For modal popup
  const [viewLayout, setViewLayout] = useState('grid'); // 'grid' | 'quad' | 'matrix' | 'cinema'
  const [cinemaCamId, setCinemaCamId] = useState('cam01');

  // Fetch 30 live feeds dynamically (0 DB storage)
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

  return (
    <div className="p-4 lg:p-6 space-y-6">

      {/* ─── Page Title & Live Network Status ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">Camera Monitoring</h1>
            <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              30 Feeds Live
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time low-latency surveillance grid powered by WebRTC WHEP &amp; HLS · Zero-DB memory stream
          </p>
        </div>

        {/* Action Controls & Layout Switcher */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Layout Buttons */}
          <div className="flex items-center bg-[#141929] border border-white/10 rounded-xl p-1 text-xs">
            <button
              onClick={() => setViewLayout('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewLayout === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="All Feeds (Grid)"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Grid (30)
            </button>
            <button
              onClick={() => setViewLayout('quad')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewLayout === 'quad' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Quad View (4 Cameras)"
            >
              <Grid2X2 className="w-3.5 h-3.5" /> 2x2
            </button>
            <button
              onClick={() => setViewLayout('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewLayout === 'matrix' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Matrix View (9 Cameras)"
            >
              <Grid3X3 className="w-3.5 h-3.5" /> 3x3
            </button>
            <button
              onClick={() => setViewLayout('cinema')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewLayout === 'cinema' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Cinema Spotlight"
            >
              <Maximize className="w-3.5 h-3.5" /> Cinema
            </button>
          </div>

          {/* Refresh Feeds */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 bg-[#141929] hover:bg-[#1e2740] border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all disabled:opacity-50"
            title="Refresh Feeds"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── Search & District Filter Bar ─── */}
      <div className="flex flex-wrap items-center gap-3 bg-[#141929] border border-white/5 p-3 rounded-2xl">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by location, district, or ID (e.g. cam01, Ahmedabad)..."
            className="w-full bg-white/5 border border-white/8 rounded-xl text-xs text-slate-200 pl-9 pr-3 py-2.5 outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600"
          />
        </div>

        {/* District Filter Pill Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
          {districts.map((dist) => (
            <button
              key={dist}
              onClick={() => setSelectedDistrict(dist)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                selectedDistrict === dist
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                  : 'bg-white/4 text-slate-400 hover:bg-white/8 border border-transparent'
              }`}
            >
              {dist === 'all' ? 'All Districts' : dist}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-500 font-mono ml-auto">
          Showing {filteredFeeds.length} / 30 feeds
        </span>
      </div>

      {/* ─── Layout 1: Cinema Mode (1 Big Player + List) ─── */}
      {viewLayout === 'cinema' && cinemaCamera && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="lg:col-span-3 space-y-3">
            <CameraPlayer
              streamId={cinemaCamera.id}
              cameraName={cinemaCamera.name}
              district={cinemaCamera.district}
              aspectRatio="aspect-video"
              className="w-full shadow-2xl rounded-2xl"
              showControls={true}
            />
            <div className="flex items-center justify-between bg-[#141929] border border-white/5 p-4 rounded-2xl">
              <div>
                <h3 className="font-bold text-slate-200 text-sm">{cinemaCamera.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{cinemaCamera.district} · {cinemaCamera.area}</p>
              </div>
              <button
                onClick={() => setActiveCamera(cinemaCamera)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all"
              >
                <Maximize className="w-3.5 h-3.5" /> Full Inspector
              </button>
            </div>
          </div>

          {/* Side Feed List */}
          <div className="bg-[#141929] border border-white/5 rounded-2xl p-3 max-h-[580px] overflow-y-auto space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">Camera Feeds</p>
            {filteredFeeds.map((cam) => (
              <div
                key={cam.id}
                onClick={() => setCinemaCamId(cam.id)}
                className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                  cinemaCamId === cam.id
                    ? 'bg-blue-600/20 border border-blue-500/30'
                    : 'bg-white/3 hover:bg-white/6 border border-transparent'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-emerald-400">{cam.id.toUpperCase()}</span>
                    <span className="text-xs font-semibold text-slate-200 truncate">{cam.name}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{cam.district}</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Layout 2: Quad View (2x2 Grid) ─── */}
      {viewLayout === 'quad' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredFeeds.slice(0, 4).map((cam) => (
            <div key={cam.id} className="relative group">
              <CameraPlayer
                streamId={cam.id}
                cameraName={cam.name}
                district={cam.district}
                aspectRatio="aspect-video"
                className="w-full shadow-lg rounded-2xl"
                showControls={true}
                autoConnect={false}
              />
              <button
                onClick={() => setActiveCamera(cam)}
                className="absolute top-3 right-24 z-30 p-1.5 bg-black/60 hover:bg-blue-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all text-xs flex items-center gap-1"
                title="Expand View"
              >
                <Maximize className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── Layout 3: Matrix View (3x3 Grid) ─── */}
      {viewLayout === 'matrix' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFeeds.slice(0, 9).map((cam) => (
            <div key={cam.id} className="relative group">
              <CameraPlayer
                streamId={cam.id}
                cameraName={cam.name}
                district={cam.district}
                aspectRatio="aspect-video"
                className="w-full shadow-lg rounded-2xl"
                showControls={true}
                autoConnect={false}
              />
              <button
                onClick={() => setActiveCamera(cam)}
                className="absolute top-3 right-24 z-30 p-1.5 bg-black/60 hover:bg-blue-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all text-xs flex items-center gap-1"
                title="Expand View"
              >
                <Maximize className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── Layout 4: All 30 Feeds Interactive Cards Grid ─── */}
      {viewLayout === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFeeds.map((cam) => (
            <div
              key={cam.id}
              onClick={() => setActiveCamera(cam)}
              className="bg-[#141929] border border-white/7 rounded-2xl p-3.5 hover:border-blue-500/50 hover:bg-[#1a2035] transition-all duration-200 group cursor-pointer flex flex-col justify-between shadow-md hover:shadow-blue-500/10"
            >
              {/* Standby CCTV Card Thumbnail (Zero network load until clicked) */}
              <div className="relative aspect-video bg-[#080c16] rounded-xl overflow-hidden mb-3 border border-white/5 flex flex-col justify-between p-3 group-hover:border-blue-500/30 transition-colors">
                {/* Surveillance HUD overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-20 [background:radial-gradient(ellipse_at_center,#1e3a8a_0%,transparent_70%),repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.4)_2px,rgba(0,0,0,0.4)_4px)]" />

                {/* Top card badges */}
                <div className="relative z-10 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    {cam.id.toUpperCase()}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    STANDBY
                  </span>
                </div>

                {/* Center Action Button */}
                <div className="relative z-10 flex flex-col items-center justify-center py-2">
                  <div className="w-11 h-11 rounded-full bg-blue-600/20 group-hover:bg-blue-600 border border-blue-500/30 group-hover:border-blue-400 flex items-center justify-center text-blue-400 group-hover:text-white transition-all transform group-hover:scale-110 shadow-lg">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 group-hover:text-blue-300 mt-2 transition-colors">
                    Click to Start Live Stream
                  </span>
                </div>

                {/* Bottom resolution tag */}
                <div className="relative z-10 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>1080p · WHEP</span>
                  <span>{cam.district}</span>
                </div>
              </div>

              {/* Feed Metadata */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">{cam.type || 'Fixed'}</span>
                  <span className="text-[10px] text-slate-500 font-mono">30 FPS</span>
                </div>

                <h4 className="text-xs font-bold text-slate-200 truncate leading-snug group-hover:text-blue-400 transition-colors">
                  {cam.name}
                </h4>
                <p className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  {cam.district} · {cam.area}
                </p>
              </div>

              {/* Bottom Quick Action Tag */}
              <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  READY
                </span>
                <span className="text-blue-400 group-hover:underline text-[11px] font-medium flex items-center gap-1">
                  Open Stream <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <div className="w-10 h-10 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mb-3" />
          <p className="text-sm font-semibold">Connecting to 30 Live Gujarat Feeds…</p>
        </div>
      )}

      {/* Empty Filter Results */}
      {!isLoading && filteredFeeds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600 bg-[#141929] rounded-2xl border border-white/5">
          <Video className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-semibold text-slate-400">No cameras found matching your search</p>
          <button
            onClick={() => { setSearch(''); setSelectedDistrict('all'); }}
            className="mt-3 px-3 py-1.5 text-xs text-blue-400 bg-blue-500/10 rounded-xl"
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

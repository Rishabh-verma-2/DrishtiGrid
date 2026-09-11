import { useQuery } from '@tanstack/react-query';
import { systemHealthAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import {
  Activity, Database, Server, Radio, Camera, Cpu,
  CheckCircle2, AlertTriangle, Clock, RefreshCw, Layers,
  ShieldCheck, HardDrive, Zap, Network, Bot, Sparkles
} from 'lucide-react';

export default function SystemHealthPage() {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const { data: healthRes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => systemHealthAPI.get().then((r) => r.data.data),
    refetchInterval: 10000,
  });

  const formatUptime = (seconds = 0) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${d > 0 ? `${d}d ` : ''}${h}h ${m}m ${s}s`;
  };

  const db = healthRes?.database;
  const grid = healthRes?.cameraGrid;
  const gateway = healthRes?.liveStreamGateway;
  const api = healthRes?.apiServer;
  const ai = healthRes?.aiService;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              System Infrastructure &amp; Diagnostic Health
            </h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500 border border-purple-500/30">
              ADMIN ONLY
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time telemetry, database latency, WebRTC streaming gateway, and CCTV node connectivity.
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
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Grid Status Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

        {/* Database Status */}
        <div className={`p-5 rounded-3xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Database className="w-5 h-5" />
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {db?.status || 'HEALTHY'}
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-emerald-500">{db?.latencyMs ?? 0} ms</p>
          <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            MongoDB Atlas Ping
          </p>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{db?.host || 'Gujarat Cloud Cluster'}</p>
        </div>

        {/* Python FastAPI AI Engine Status */}
        <div className={`p-5 rounded-3xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              ai?.status === 'ONLINE'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              <Cpu className="w-5 h-5" />
            </div>
            <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
              ai?.status === 'ONLINE'
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-amber-500/10 text-amber-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ai?.status === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {ai?.status || 'OFFLINE'}
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-violet-400">
            {ai?.status === 'ONLINE' ? `${ai?.latencyMs ?? 5} ms` : 'OFFLINE'}
          </p>
          <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            Python AI Service
          </p>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">FastAPI :8000 · YOLOv8 + OCR</p>
        </div>

        {/* Live Stream Gateway Status */}
        <div className={`p-5 rounded-3xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {gateway?.status || 'ONLINE'}
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-blue-500">{gateway?.activeChannels ?? 30} Feeds</p>
          <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            MediaMTX Stream Gateway
          </p>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{gateway?.protocol || 'WebRTC / WHEP'}</p>
        </div>

        {/* Camera Grid Health */}
        <div className={`p-5 rounded-3xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500/10 text-purple-500 border border-purple-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500">
              {grid?.healthPercentage ?? 92}%
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-purple-500">{grid?.online ?? 0} / {grid?.total ?? 500}</p>
          <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            Cameras Connected
          </p>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{grid?.offline ?? 0} units offline</p>
        </div>

        {/* API Server Node Uptime */}
        <div className={`p-5 rounded-3xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <Server className="w-5 h-5" />
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-500">
              PORT 5001
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-cyan-500">{formatUptime(api?.uptimeSeconds)}</p>
          <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            API Server Uptime
          </p>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">Node.js {api?.nodeVersion || 'v20'}</p>
        </div>

      </div>

      {/* Deep Dives */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* AI Computer Vision & Deep Learning Diagnostics */}
        <div className={`p-5 rounded-3xl border space-y-4 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" />
              <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                AI Computer Vision Pipeline
              </h3>
            </div>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
              ai?.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              {ai?.status === 'ONLINE' ? 'PORT 8000 ACTIVE' : 'STANDBY'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Object Detection</span>
              <strong className="font-mono text-violet-400">YOLOv8 Nano (Vehicles + People)</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Low-Light Enhancer</span>
              <strong className="font-mono text-cyan-400">Zero-DCE (Retinex Curve)</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Super-Resolution</span>
              <strong className="font-mono text-blue-400">Real-ESRGAN x4+</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Text OCR Engine</span>
              <strong className="font-mono text-emerald-400">PaddleOCR (High-Confidence ANPR)</strong>
            </div>
          </div>
        </div>

        {/* Server Memory & Process Stats */}
        <div className={`p-5 rounded-3xl border space-y-4 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-500" />
              <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Process Memory &amp; Host Telemetry
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">{api?.platform || 'Darwin'}</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Heap Memory Used</span>
              <strong className="font-mono text-blue-400">{api?.memoryHeapUsedMB || 45} MB / {api?.memoryHeapTotalMB || 95} MB</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Resident Set Size (RSS)</span>
              <strong className="font-mono text-purple-400">{api?.memoryRssMB || 82} MB</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">CPU Cores Allocated</span>
              <strong className="font-mono text-emerald-400">{api?.cpuCores || 8} Active VCPUs</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">API Host Architecture</span>
              <strong className="font-mono text-amber-400">{api?.platform || 'macOS'} ({api?.nodeVersion || 'v20'})</strong>
            </div>
          </div>
        </div>

        {/* Live Stream Gateway Configuration */}
        <div className={`p-5 rounded-3xl border space-y-4 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-emerald-500" />
              <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                MediaMTX Video Streaming Gateway
              </h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">WHEP Low Latency</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Gateway Server Host</span>
              <strong className="font-mono text-blue-400">{gateway?.host || '103.250.160.189'}</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Streaming Protocols</span>
              <strong className="font-mono text-purple-400">WebRTC (WHEP 8889) + RTSP (8554)</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Concurrent Streams</span>
              <strong className="font-mono text-emerald-400">{gateway?.activeChannels || 30} Broadcast Channels</strong>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/3 border border-white/6">
              <span className="text-slate-400">Geospatial Sync</span>
              <strong className="font-mono text-emerald-400">Leaflet GeoJSON &amp; Clustered Units</strong>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

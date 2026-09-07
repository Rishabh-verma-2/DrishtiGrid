import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crowdAPI, streamAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import useSocketStore from '../store/socketStore';
import {
  Users, Flame, Activity, Car, ShieldAlert, Sparkles, UploadCloud,
  Camera, Sliders, RefreshCw, Layers, CheckCircle2, AlertTriangle,
  Play, Radio, MapPin, Zap, Info, ArrowUpRight, HelpCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

import CrowdMetricsCards from '../components/crowd/CrowdMetricsCards';
import CrowdFrameViewer from '../components/crowd/CrowdFrameViewer';
import SceneInventoryCard from '../components/crowd/SceneInventoryCard';
import ZoneDensityGrid from '../components/crowd/ZoneDensityGrid';
import CrowdAlertsTable from '../components/crowd/CrowdAlertsTable';

export default function CrowdDetectionPage() {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const { socket } = useSocketStore();
  const queryClient = useQueryClient();

  // State
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [selectedCameraId, setSelectedCameraId] = useState('cam-01');
  const [confThreshold, setConfThreshold] = useState(0.30);
  const [gridConfig, setGridConfig] = useState('3x4'); // '3x4' | '4x4' | '2x2'
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Fetch live Sentinel camera catalogue
  const { data: streamResponse } = useQuery({
    queryKey: ['liveFeeds'],
    queryFn: () => streamAPI.getFeeds().then((r) => r.data),
    staleTime: 60000,
  });
  const feeds = streamResponse?.data || [];

  const selectedCamera = useMemo(() => {
    return feeds.find((f) => f.id === selectedCameraId || f.cameraId === selectedCameraId) || feeds[0];
  }, [feeds, selectedCameraId]);

  // Socket listener for real-time crowd surge events
  useEffect(() => {
    if (!socket) return;

    const handleCrowdAlert = (data) => {
      toast.custom(
        (t) => (
          <div
            className={`max-w-md w-full p-4 rounded-2xl border shadow-xl flex items-start gap-3 pointer-events-auto transition-all ${
              t.visible ? 'animate-enter' : 'animate-leave'
            } ${
              isLight
                ? 'bg-red-50/95 border-red-200 text-red-900 shadow-red-500/10'
                : 'bg-[#1a111a]/95 border-red-500/40 text-white shadow-red-500/20'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0 animate-bounce">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-red-500">
                Gujarat Police Netram • Crowd Surge
              </p>
              <p className="text-sm font-bold mt-0.5">
                {data.cameraName || data.cameraId}: {data.surgePercent ? `+${data.surgePercent}% surge` : 'Congestion detected'}
              </p>
              <p className="text-xs opacity-80 mt-0.5">
                Estimated {data.totalCount || data.count || 'dense'} people in monitored sector.
              </p>
            </div>
          </div>
        ),
        { duration: 6000 }
      );
      queryClient.invalidateQueries({ queryKey: ['crowdAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['crowdStats'] });
    };

    socket.on('crowd:alert', handleCrowdAlert);
    return () => {
      socket.off('crowd:alert', handleCrowdAlert);
    };
  }, [socket, isLight, queryClient]);

  // Mutation to analyze frame
  const analyzeMutation = useMutation({
    mutationFn: async ({ file, cameraId }) => {
      const [rowsStr, colsStr] = gridConfig.split('x');
      const res = await crowdAPI.analyzeFrame(file, cameraId, {
        confThreshold,
        gridRows: parseInt(rowsStr, 10) || 3,
        gridCols: parseInt(colsStr, 10) || 4,
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.data) {
        setAnalysisResult(data.data);
        const count = data.data.total_count;
        const level = data.data.crowd_level;
        toast.success(`Analysis complete: ${count} people (${level} density)`, { icon: '👥' });
        queryClient.invalidateQueries({ queryKey: ['crowdAlerts'] });
      } else {
        toast.error('Unexpected analysis response structure');
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || err.message || 'Crowd analysis failed');
    },
  });

  const handleFileChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file (JPEG/PNG)');
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setFilePreview(e.target.result);
    reader.readAsDataURL(file);

    // Auto-run analysis on file select
    analyzeMutation.mutate({ file, cameraId: selectedCameraId });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Helper to generate a realistic synthetic test frame so user can test without uploading their own file
  const handleLoadSampleScenario = (scenarioType) => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');

    // Background: Urban junction street
    const grad = ctx.createLinearGradient(0, 0, 0, 540);
    grad.addColorStop(0, '#2b3240');
    grad.addColorStop(0.5, '#1e2430');
    grad.addColorStop(1, '#151922');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 960, 540);

    // Road markings & sidewalks
    ctx.fillStyle = '#10141c';
    ctx.fillRect(100, 200, 760, 300);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 15]);
    ctx.beginPath();
    ctx.moveTo(100, 350);
    ctx.lineTo(860, 350);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosswalk zebra stripes
    ctx.fillStyle = '#ffffff30';
    for (let i = 250; i < 700; i += 40) {
      ctx.fillRect(i, 220, 25, 260);
    }

    // Text watermark simulation
    ctx.fillStyle = '#ffffff80';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`GUJARAT POLICE NETRAM CCTV • ${scenarioType.toUpperCase()} SCENARIO`, 30, 40);
    ctx.fillText(new Date().toISOString(), 30, 65);

    // Draw simulated persons & vehicles based on scenario
    let personCount = 12;
    let carCount = 4;

    if (scenarioType === 'religious_mela') {
      personCount = 68;
      carCount = 1;
    } else if (scenarioType === 'traffic_junction') {
      personCount = 28;
      carCount = 11;
    } else if (scenarioType === 'market_bazaar') {
      personCount = 48;
      carCount = 3;
    }

    // Draw simulated cars
    ctx.fillStyle = '#3b82f6';
    for (let c = 0; c < carCount; c++) {
      const cx = 150 + (c * 120) % 650;
      const cy = 250 + (c * 45) % 180;
      ctx.fillStyle = c % 2 === 0 ? '#2563eb' : '#0284c7';
      ctx.beginPath();
      ctx.roundRect(cx, cy, 85, 45, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.fillText('CAR', cx + 25, cy + 25);
    }

    // Draw simulated persons
    for (let p = 0; p < personCount; p++) {
      const px = 120 + Math.random() * 720;
      const py = 210 + Math.random() * 260;
      // Head
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.fillStyle = p % 3 === 0 ? '#ef4444' : p % 3 === 1 ? '#10b981' : '#8b5cf6';
      ctx.fillRect(px - 5, py + 6, 10, 18);
    }

    canvas.toBlob((blob) => {
      const file = new File([blob], `${scenarioType}_cctv_frame.jpg`, { type: 'image/jpeg' });
      handleFileChange(file);
    }, 'image/jpeg', 0.92);
  };

  const [gridRows, gridCols] = gridConfig.split('x').map((n) => parseInt(n, 10));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ─── Top Header & Tactical Bar ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className={`text-xs font-mono font-bold uppercase tracking-wider ${
              isLight ? 'text-blue-700' : 'text-blue-400'
            }`}>
              Gujarat Police Netram ICCC • AI Crowd Vision
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs font-mono text-slate-400">FastAPI Model :8000</span>
          </div>
          <h1 className={`text-2xl md:text-3xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Crowd Intelligence & Object Inventory
          </h1>
          <p className={`text-xs md:text-sm mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            ગુજરાત ક્રાઉડ સર્વેલન્સ — Multi-pass YOLOv8 person density estimation, JET KDE heatmap, spatial bottleneck analysis & COCO 80-class scene inventory.
          </p>
        </div>

        {/* Tactical Badges */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (selectedFile) {
                analyzeMutation.mutate({ file: selectedFile, cameraId: selectedCameraId });
              } else {
                handleLoadSampleScenario('market_bazaar');
              }
            }}
            disabled={analyzeMutation.isPending}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all ${
              isLight
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
            <span>{analyzeMutation.isPending ? 'Analyzing Density...' : 'Run Analysis'}</span>
          </button>
        </div>
      </div>

      {/* ─── Control Bar: Camera Selection & Presets & Parameters ─── */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isLight
            ? 'bg-white border-slate-200/90 shadow-xs'
            : 'bg-[#141929] border-white/5 shadow-md'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: CCTV Camera Selector */}
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-400'
            }`}>
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <label className={`text-[10px] font-bold uppercase tracking-wider block ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Monitored CCTV Node
              </label>
              <select
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                className={`text-xs font-mono font-bold bg-transparent border-b outline-hidden pb-0.5 cursor-pointer ${
                  isLight
                    ? 'border-slate-300 text-slate-900 focus:border-blue-600'
                    : 'border-white/20 text-white focus:border-blue-400'
                }`}
              >
                {feeds.length > 0 ? (
                  feeds.map((cam) => (
                    <option key={cam.id} value={cam.id} className="bg-slate-900 text-white">
                      {cam.name || cam.id} ({cam.district || 'Gujarat'})
                    </option>
                  ))
                ) : (
                  <option value="cam-01" className="bg-slate-900 text-white">
                    Ahmedabad Ashram Road Junction (GJ-01)
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* Center: Quick One-Click Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] font-bold mr-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              One-Click Presets:
            </span>
            {[
              { id: 'market_bazaar', label: 'Bazaar Market', desc: '48p + 3 cars' },
              { id: 'religious_mela', label: 'Religious Mela (Dense)', desc: '68p surge' },
              { id: 'traffic_junction', label: 'Highway Junction', desc: '28p + 11 cars' },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleLoadSampleScenario(preset.id)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all ${
                  isLight
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
                }`}
                title={preset.desc}
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          {/* Right: Confidence Threshold & Grid Size */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Conf: <b className="font-mono text-blue-500">{confThreshold.toFixed(2)}</b>
              </span>
              <input
                type="range"
                min="0.15"
                max="0.75"
                step="0.05"
                value={confThreshold}
                onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                className="w-20 accent-blue-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1">
              <span className={`text-[11px] font-semibold mr-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Grid:
              </span>
              {['3x4', '4x4'].map((grid) => (
                <button
                  key={grid}
                  onClick={() => setGridConfig(grid)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold transition-all ${
                    gridConfig === grid
                      ? 'bg-blue-600 text-white'
                      : isLight
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {grid}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Top Telemetry Metric Cards ─── */}
      <CrowdMetricsCards data={analysisResult} isLight={isLight} />

      {/* ─── Main Two-Column Analysis Workstation ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Frame Viewer & Upload Zone (7 of 12 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <CrowdFrameViewer
            annotatedSrc={analysisResult?.annotated_image_b64}
            rawSrc={filePreview}
            cameraName={selectedCamera?.name || selectedCameraId}
            cameraId={selectedCameraId}
            crowdLevel={analysisResult?.crowd_level || 'LOW'}
            timingMs={analysisResult?.timing_ms}
            zones={analysisResult?.zones || []}
            gridRows={gridRows}
            gridCols={gridCols}
            isLight={isLight}
          />

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200 ${
              isDragOver
                ? 'border-blue-500 bg-blue-500/10'
                : isLight
                ? 'border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/20'
                : 'border-white/10 bg-[#141929]/50 hover:border-blue-500/50 hover:bg-[#141929]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
              }}
            />
            <div className="flex items-center justify-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'
              }`}>
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                  {selectedFile ? `Selected: ${selectedFile.name}` : 'Drop CCTV Snapshot or Click to Browse'}
                </p>
                <p className={`text-[11px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  Supports JPEG, JPG, PNG up to 20MB • Runs multi-pass inference & occlusion correction
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sector Density Matrix & Scene Object Inventory (5 of 12 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <ZoneDensityGrid
            zones={analysisResult?.zones || []}
            gridRows={gridRows}
            gridCols={gridCols}
            isLight={isLight}
          />

          <SceneInventoryCard
            inventory={analysisResult?.object_inventory || {}}
            isLight={isLight}
          />
        </div>
      </div>

      {/* ─── Bottom Section: Recent Crowd Surges & Incidents ─── */}
      <CrowdAlertsTable
        isLight={isLight}
        onSelectCamera={(camId) => setSelectedCameraId(camId)}
      />
    </div>
  );
}

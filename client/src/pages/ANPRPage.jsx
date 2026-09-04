import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { anprAPI, alertAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import {
  Car, Shield, AlertTriangle, CheckCircle, Search, Plus, RefreshCw,
  UploadCloud, FileText, Activity, Image as ImageIcon, Sparkles, Filter,
  CheckCircle2, XCircle, AlertCircle, Eye, Trash2, Edit, Radio, Clock,
  Video, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import MatchAlertModal from '../components/anpr/MatchAlertModal';
import WatchlistModal from '../components/anpr/WatchlistModal';
import VideoUploadZone from '../components/anpr/VideoUploadZone';
import VideoAnalysisResults from '../components/anpr/VideoAnalysisResults';
import DetectionsExplorer from '../components/anpr/DetectionsExplorer';

const CATEGORY_COLORS = {
  STOLEN: 'text-red-400 bg-red-500/15 border-red-500/30',
  WANTED: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
  SUSPECT: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  VIP: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
  BLACKLISTED: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  FLEET: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  RESTRICTED: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
  OTHER: 'text-slate-400 bg-white/5 border-white/10',
};

const PRIORITY_COLORS = {
  HIGH: 'text-red-400 bg-red-500/10 border-red-500/20',
  MEDIUM: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  LOW: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

export default function ANPRPage() {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('SCANNER');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [activeMatchModal, setActiveMatchModal] = useState(null);
  const [activeVideoJob, setActiveVideoJob] = useState(null);

  // Watchlist state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showWatchlistModal, setShowWatchlistModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const fileInputRef = useRef(null);

  // 1. Fetch Stats
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['anpr-stats'],
    queryFn: () => anprAPI.getStats().then((r) => r.data?.data || {}),
    refetchInterval: 12000,
  });

  // 2. Fetch Watchlist
  const { data: watchlistData, isLoading: watchlistLoading, refetch: refetchWatchlist } = useQuery({
    queryKey: ['anpr-watchlist', search, categoryFilter, statusFilter],
    queryFn: () =>
      anprAPI
        .getWatchlist({
          search: search || undefined,
          category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          limit: 100,
        })
        .then((r) => r.data?.records || []),
  });

  // 3. Fetch ANPR Alerts
  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ['anpr-alerts'],
    queryFn: () =>
      alertAPI
        .getAll({ type: 'anpr_match', limit: 50 })
        .then((r) => r.data?.data || []),
    refetchInterval: 15000,
  });

  // File selection handlers
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    addFiles(files);
  };

  const addFiles = (files) => {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) {
      return toast.error('Please select valid image files (JPG, PNG, WebP).');
    }
    const combined = [...selectedFiles, ...valid].slice(0, 10);
    setSelectedFiles(combined);

    // Create previews
    const previews = combined.map((f) => URL.createObjectURL(f));
    setFilePreviews(previews);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (idx) => {
    const nextFiles = selectedFiles.filter((_, i) => i !== idx);
    setSelectedFiles(nextFiles);
    setFilePreviews(nextFiles.map((f) => URL.createObjectURL(f)));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setFilePreviews([]);
    setBatchResults(null);
  };

  // Run ANPR Analysis
  const handleAnalyze = async () => {
    if (selectedFiles.length === 0) return;

    setAnalyzing(true);
    setBatchResults(null);
    const toastId = toast.loading('Running AI License Plate Extraction Pipeline...');

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('images', file);
      });

      const res = await anprAPI.analyze(formData);
      const data = res.data;
      setBatchResults(data);

      toast.success(
        `Analysis complete! Detected ${data.summary?.total_plates_detected || 0} plate(s).`,
        { id: toastId }
      );

      // Check if any plate triggered a match
      let firstMatch = null;
      (data.results || []).forEach((imgRes) => {
        (imgRes.plates || []).forEach((p) => {
          if (p.match_status === 'MATCH_FOUND' || p.match_status === 'POSSIBLE_MATCH') {
            if (!firstMatch) firstMatch = p;
          }
        });
      });

      if (firstMatch) {
        setActiveMatchModal(firstMatch);
      }

      refetchStats();
      refetchAlerts();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'ANPR processing failed', {
        id: toastId,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Watchlist Save Mutation
  const handleSaveWatchlist = async (formData) => {
    if (editingRecord) {
      await anprAPI.updateWatchlistRecord(editingRecord._id, formData);
      toast.success('Watchlist record updated.');
    } else {
      await anprAPI.createWatchlistRecord(formData);
      toast.success('Vehicle registered into surveillance watchlist.');
    }
    refetchWatchlist();
    refetchStats();
  };

  const handleDeleteRecord = async (record) => {
    if (!confirm(`Remove vehicle ${record.plate_number} from active watchlist?`)) return;
    try {
      await anprAPI.deleteWatchlistRecord(record._id, false);
      toast.success('Record deactivated.');
      refetchWatchlist();
      refetchStats();
    } catch (err) {
      toast.error('Failed to deactivate record');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      
      {/* ─── Top Institutional Header & KPI Ribbon ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-xl lg:text-2xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  ANPR Vehicle Surveillance
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  AI OCR 2.0
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                સ્વચાલિત નંબર પ્લેટ ઓળખ પ્રણાલી · Automatic Plate Detection, Watchlist Cross-Referencing &amp; Instant Alerts
              </p>
            </div>
          </div>
        </div>

        {/* Quick KPI Chips */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className={`px-3 py-2 rounded-xl border flex flex-col ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/8'
          }`}>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
              Active Monitored
            </span>
            <span className="text-sm font-black text-emerald-400">
              {statsData?.activeRecords ?? 0} VEHICLES
            </span>
          </div>

          <div className={`px-3 py-2 rounded-xl border flex flex-col ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/8'
          }`}>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
              Hits Today
            </span>
            <span className={`text-sm font-black ${(statsData?.alertsToday ?? 0) > 0 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
              {statsData?.alertsToday ?? 0} ALERTS
            </span>
          </div>

          <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/8'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${statsData?.aiServiceOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-400 animate-pulse'}`} />
            <div className="text-left">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block">
                AI Engine
              </span>
              <span className="text-xs font-black text-slate-200">
                {statsData?.aiServiceOnline ? 'FASTAPI ONLINE' : 'SIMULATION ACTIVE'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div className={`border-b flex items-center gap-2 overflow-x-auto ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
        <button
          onClick={() => setActiveTab('SCANNER')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'SCANNER'
              ? 'border-blue-500 text-blue-500 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Plate Verification &amp; Scanner</span>
        </button>

        <button
          onClick={() => setActiveTab('VIDEO')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'VIDEO'
              ? 'border-blue-500 text-blue-500 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>1-FPS Video Surveillance</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 font-bold">
            NEW
          </span>
        </button>

        <button
          onClick={() => setActiveTab('DETECTIONS')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'DETECTIONS'
              ? 'border-blue-500 text-blue-500 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Intelligence Explorer</span>
        </button>

        <button
          onClick={() => setActiveTab('WATCHLIST')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'WATCHLIST'
              ? 'border-blue-500 text-blue-500 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Hotlist &amp; Watchlist Registry</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 font-mono">
            {statsData?.totalRecords ?? 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('INCIDENTS')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'INCIDENTS'
              ? 'border-red-500 text-red-400 bg-red-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Incident Detections</span>
          {(statsData?.alertsToday ?? 0) > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-600 text-white font-mono animate-pulse">
              {statsData?.alertsToday}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TAB 1: PLATE VERIFICATION & BATCH SCANNER
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'SCANNER' && (
        <div className="space-y-6">
          
          {/* Multi-image Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              isLight
                ? 'bg-white border-slate-300 hover:border-blue-500 shadow-sm'
                : 'bg-[#121626] border-white/15 hover:border-blue-500/50 hover:bg-[#151b30]'
            }`}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <p className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  Drag &amp; drop vehicle images here, or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-500 hover:underline font-extrabold"
                  >
                    browse files
                  </button>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports multiple CCTV snapshots, street camera frames (JPG, PNG, WebP · Max 10 images)
                </p>
              </div>
            </div>

            {/* Thumbnail Strip */}
            {selectedFiles.length > 0 && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-300">
                    Selected Images ({selectedFiles.length}/10)
                  </span>
                  <button
                    onClick={clearAllFiles}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold"
                  >
                    Clear All
                  </button>
                </div>

                <div className="flex flex-wrap gap-3">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="relative w-24 h-24 rounded-xl overflow-hidden border border-white/15 bg-black/40 group shadow-sm"
                    >
                      <img
                        src={filePreviews[idx]}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeFile(idx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1 py-0.5 text-[9px] text-slate-300 truncate">
                        {file.name}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Submit Action */}
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="px-6 py-2.5 rounded-xl font-black text-xs text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-600/25 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {analyzing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Analyzing with AI Pipeline...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Run AI License Plate Scan ({selectedFiles.length})
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Batch Results View */}
          {batchResults && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Summary Banner */}
              <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
                isLight ? 'bg-white border-slate-200' : 'bg-[#121626] border-white/10'
              }`}>
                <div>
                  <h3 className="text-sm font-black text-slate-100">
                    Analysis Completed ({batchResults.summary?.images_processed || 0} images)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    Total duration: {batchResults.summary?.total_duration_ms || 0} ms · Pipeline: YOLOv8 + CLAHE + PaddleOCR
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-xl">
                    {batchResults.summary?.total_plates_detected || 0} Plates Detected
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl border ${
                    (batchResults.summary?.matching_plates || 0) > 0
                      ? 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse'
                      : 'bg-white/5 border-white/10 text-slate-300'
                  }`}>
                    {batchResults.summary?.matching_plates || 0} Watchlist Hits
                  </div>
                </div>
              </div>

              {/* Per-Image Cards */}
              <div className="space-y-4">
                {batchResults.results?.map((imgRes, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl border p-5 space-y-4 ${
                      isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/7'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-bold text-slate-200">{imgRes.image_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({imgRes.file_size_kb} KB)</span>
                        {imgRes.simulated && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
                            Fallback Simulation
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-400">
                        {imgRes.plates_detected} Plate(s) Detected
                      </span>
                    </div>

                    {imgRes.plates?.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">
                        No license plates found in this image frame.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {imgRes.plates.map((plate, pIdx) => {
                          const isMatch = plate.match_status === 'MATCH_FOUND' || plate.match_status === 'POSSIBLE_MATCH';
                          return (
                            <div
                              key={pIdx}
                              className={`p-4 rounded-xl border transition-all ${
                                isMatch
                                  ? 'bg-red-950/20 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                                  : 'bg-black/30 border-white/8'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="plate-pill scale-105 origin-left mb-2">
                                    <span className="plate-ind">IND</span>
                                    <span className="plate-text">{plate.raw_ocr || plate.normalized_plate}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 font-mono">
                                    Normalized: <strong className="text-slate-200">{plate.normalized_plate}</strong>
                                  </p>
                                  {(plate.car_color || plate.vehicle_type) && (
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                      {plate.car_color && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/5 border border-white/10 text-slate-300">
                                          <span
                                            className="w-2 h-2 rounded-full border border-white/30"
                                            style={{
                                              backgroundColor:
                                                plate.car_color.toLowerCase().includes('white') ? '#ffffff'
                                                : plate.car_color.toLowerCase().includes('black') ? '#000000'
                                                : plate.car_color.toLowerCase().includes('red') ? '#ef4444'
                                                : plate.car_color.toLowerCase().includes('blue') ? '#3b82f6'
                                                : plate.car_color.toLowerCase().includes('green') ? '#22c55e'
                                                : plate.car_color.toLowerCase().includes('silver') || plate.car_color.toLowerCase().includes('gray') ? '#94a3b8'
                                                : '#64748b'
                                            }}
                                          />
                                          <span>{plate.car_color}</span>
                                        </span>
                                      )}
                                      {plate.vehicle_type && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                          {plate.vehicle_type}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                                  isMatch
                                    ? 'bg-red-500 text-white border-red-400 animate-pulse'
                                    : 'bg-slate-700 text-slate-300 border-slate-600'
                                }`}>
                                  {plate.match_status}
                                </span>
                              </div>

                              {/* Crops & Visual Evidence */}
                              {(plate.original_crop || plate.enhanced_crop) && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  {plate.original_crop && (
                                    <div className="bg-black/60 rounded p-1 text-center border border-white/10">
                                      <p className="text-[9px] text-slate-400 mb-0.5">Raw Crop</p>
                                      <img
                                        src={plate.original_crop.startsWith('data:') ? plate.original_crop : `data:image/jpeg;base64,${plate.original_crop}`}
                                        alt="Crop"
                                        className="max-h-12 mx-auto object-contain"
                                      />
                                    </div>
                                  )}
                                  {plate.enhanced_crop && (
                                    <div className="bg-black/60 rounded p-1 text-center border border-blue-500/20">
                                      <p className="text-[9px] text-blue-400 mb-0.5">Enhanced</p>
                                      <img
                                        src={plate.enhanced_crop.startsWith('data:') ? plate.enhanced_crop : `data:image/jpeg;base64,${plate.enhanced_crop}`}
                                        alt="Enhanced"
                                        className="max-h-12 mx-auto object-contain"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Confidence Meter */}
                              <div className="mt-3 space-y-1">
                                <div className="flex justify-between text-[10px] text-slate-400">
                                  <span>OCR Confidence</span>
                                  <span className="font-bold text-slate-200">
                                    {Math.round((plate.ocr_confidence || 0.95) * 100)}%
                                  </span>
                                </div>
                                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full"
                                    style={{ width: `${Math.round((plate.ocr_confidence || 0.95) * 100)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Matched Details */}
                              {isMatch && plate.matched_record && (
                                <div className="mt-3 pt-3 border-t border-red-500/30 text-xs space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-red-400 font-black">
                                      {plate.matched_record.category} VEHICLE
                                    </span>
                                    <button
                                      onClick={() => setActiveMatchModal(plate)}
                                      className="text-[10px] text-white bg-red-600 hover:bg-red-500 px-2 py-0.5 rounded font-bold transition-colors"
                                    >
                                      View Dossier
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-slate-300">
                                    Record: {plate.matched_record.recordId} · Priority: {plate.matched_record.priority}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: 1-FPS CCTV VIDEO SURVEILLANCE PIPELINE
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'VIDEO' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {!activeVideoJob ? (
            <VideoUploadZone
              activeRecordsCount={statsData?.activeRecords ?? 0}
              onAnalysisComplete={(jobId, videoId) => {
                setActiveVideoJob({ jobId, videoId });
              }}
            />
          ) : (
            <VideoAnalysisResults
              jobId={activeVideoJob.jobId}
              videoId={activeVideoJob.videoId}
              sourceVideoUrl={activeVideoJob.sourceVideoUrl}
              onReset={() => setActiveVideoJob(null)}
              onViewAlert={() => setActiveTab('INCIDENTS')}
            />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: HISTORICAL INTELLIGENCE EXPLORER & REGISTRY
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'DETECTIONS' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <DetectionsExplorer />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 2: HOTLIST & WATCHLIST REGISTRY
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'WATCHLIST' && (
        <div className="space-y-4">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 flex-1 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search plate, FIR, owner..."
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs outline-none transition-all ${
                    isLight
                      ? 'bg-white border border-slate-300 text-slate-900 focus:border-blue-500'
                      : 'bg-white/5 border border-white/10 text-white focus:border-blue-500'
                  }`}
                />
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={`text-xs rounded-xl px-3 py-2 outline-none ${
                  isLight ? 'bg-white border border-slate-300 text-slate-800' : 'bg-white/5 border border-white/10 text-slate-300'
                }`}
              >
                <option value="ALL">All Categories</option>
                <option value="STOLEN">Stolen</option>
                <option value="WANTED">Wanted</option>
                <option value="SUSPECT">Suspect</option>
                <option value="VIP">VIP</option>
                <option value="BLACKLISTED">Blacklisted</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`text-xs rounded-xl px-3 py-2 outline-none ${
                  isLight ? 'bg-white border border-slate-300 text-slate-800' : 'bg-white/5 border border-white/10 text-slate-300'
                }`}
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <button
              onClick={() => {
                setEditingRecord(null);
                setShowWatchlistModal(true);
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Register Target Plate
            </button>
          </div>

          {/* Watchlist Table */}
          <div className={`rounded-2xl border overflow-hidden ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/7'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b ${isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-white/3 border-white/7 text-slate-400'}`}>
                    <th className="px-4 py-3 font-extrabold uppercase tracking-wider">Plate Number</th>
                    <th className="px-4 py-3 font-extrabold uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 font-extrabold uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 font-extrabold uppercase tracking-wider">Reference / FIR</th>
                    <th className="px-4 py-3 font-extrabold uppercase tracking-wider">Owner / Model</th>
                    <th className="px-4 py-3 font-extrabold uppercase tracking-wider">Hits</th>
                    <th className="px-4 py-3 font-extrabold uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-extrabold uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {watchlistLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading surveillance watchlist...
                      </td>
                    </tr>
                  ) : watchlistData?.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No watchlist records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    watchlistData?.map((rec) => (
                      <tr key={rec._id} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-3">
                          <div className="plate-pill scale-90 origin-left">
                            <span className="plate-ind">IND</span>
                            <span className="plate-text">{rec.plate_number}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{rec.recordId}</p>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[rec.category] || CATEGORY_COLORS.OTHER}`}>
                            {rec.category}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${PRIORITY_COLORS[rec.priority] || PRIORITY_COLORS.LOW}`}>
                            {rec.priority}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-300">
                          {rec.reference_id || '—'}
                        </td>

                        <td className="px-4 py-3">
                          <p className="text-slate-200 font-semibold">{rec.ownerName || '—'}</p>
                          <p className="text-[10px] text-slate-400">{rec.vehicleModel || '—'}</p>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`font-mono font-bold ${(rec.total_alerts || 0) > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                            {rec.total_alerts || 0}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            rec.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-700 text-slate-400'
                          }`}>
                            {rec.status}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingRecord(rec);
                                setShowWatchlistModal(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-white/5 transition-colors"
                              title="Edit Record"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(rec)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors"
                              title="Deactivate Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 3: ANPR INCIDENTS & ALERT LOG
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'INCIDENTS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-200">
              License Plate Match Incidents ({alertsData?.length || 0})
            </h3>
            <button
              onClick={() => refetchAlerts()}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {alertsLoading ? (
            <div className="py-16 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading incident alerts...
            </div>
          ) : alertsData?.length === 0 ? (
            <div className="py-16 text-center text-slate-500 border border-dashed border-white/10 rounded-2xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-2" />
              <p className="font-bold">No active ANPR match incidents</p>
              <p className="text-xs text-slate-500 mt-0.5">All monitored vehicle scans are normal.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alertsData?.map((alert) => (
                <div
                  key={alert._id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                    alert.severity === 'critical'
                      ? 'bg-red-950/25 border-red-500/40 hover:bg-red-950/35'
                      : 'bg-[#141929] border-white/8 hover:bg-[#1a2035]'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="plate-pill scale-90 origin-left">
                          <span className="plate-ind">IND</span>
                          <span className="plate-text">
                            {alert.metadata?.detected_plate || alert.title.replace('ANPR Hit: ', '')}
                          </span>
                        </div>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-500 text-white">
                          {alert.metadata?.category || 'WATCHLIST'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {alert.alertId}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{alert.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                        <span>District: <strong className="text-slate-400">{alert.district || 'Ahmedabad'}</strong></span>
                        <span>Camera: <strong className="text-blue-400">{alert.camera?.name || alert.cameraId || 'CCTV-CAM'}</strong></span>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {new Date(alert.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded border ${
                      alert.status === 'active'
                        ? 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse'
                        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {alert.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Emergency Watchlist Match Modal ─── */}
      <MatchAlertModal
        match={activeMatchModal}
        onClose={() => setActiveMatchModal(null)}
        onAcknowledge={() => {
          setActiveMatchModal(null);
          refetchAlerts();
        }}
      />

      {/* ─── Add/Edit Watchlist Modal ─── */}
      <WatchlistModal
        isOpen={showWatchlistModal}
        record={editingRecord}
        onClose={() => {
          setShowWatchlistModal(false);
          setEditingRecord(null);
        }}
        onSave={handleSaveWatchlist}
      />

    </div>
  );
}

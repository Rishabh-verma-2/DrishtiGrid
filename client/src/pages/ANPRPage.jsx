import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { anprAPI, alertAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import { useANPRStore } from '../store/anprStore';
import {
  Car, Shield, AlertTriangle, CheckCircle, Search, Plus, RefreshCw,
  UploadCloud, FileText, Activity, Image as ImageIcon, ScanEye, Cpu, Filter,
  CheckCircle2, XCircle, AlertCircle, Eye, Trash2, Edit, Radio, Clock,
  Video, Layers, Maximize2, ZoomIn, ZoomOut, Database, Crosshair, Columns2
} from 'lucide-react';
import toast from 'react-hot-toast';
import MatchAlertModal from '../components/anpr/MatchAlertModal';
import WatchlistModal from '../components/anpr/WatchlistModal';
import VideoUploadZone from '../components/anpr/VideoUploadZone';
import VideoAnalysisResults from '../components/anpr/VideoAnalysisResults';
import DetectionsExplorer from '../components/anpr/DetectionsExplorer';
import LiveANPRWorkspace from '../components/anpr/LiveANPRWorkspace';

const CATEGORY_COLORS = {
  STOLEN: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500/30',
  WANTED: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30',
  SUSPECT: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30',
  VIP: 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15 border-purple-200 dark:border-purple-500/30',
  BLACKLISTED: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/30',
  FLEET: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30',
  RESTRICTED: 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/15 border-yellow-200 dark:border-yellow-500/30',
  OTHER: 'text-slate-700 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10',
};

const PRIORITY_COLORS = {
  HIGH: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20',
  MEDIUM: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
  LOW: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
};

export default function ANPRPage() {
  const queryClient = useQueryClient();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCamId = searchParams.get('cameraId') || searchParams.get('cam');

  // Persistent ANPR state across page & tab navigations
  const {
    activeTab,
    setActiveTab,
    batchResults,
    setBatchResults,
    clearBatchResults,
    selectedCameraId,
    setSelectedCameraId,
  } = useANPRStore();

  useEffect(() => {
    if (urlCamId) {
      setSelectedCameraId(urlCamId);
      setActiveTab('LIVE_STREAM');
    }
  }, [urlCamId, setSelectedCameraId, setActiveTab]);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(null);
  const [activeMatchModal, setActiveMatchModal] = useState(null);
  const [activeVideoJob, setActiveVideoJob] = useState(null);
  const [viewModeMap, setViewModeMap] = useState({}); // { [imageIndex]: 'ANNOTATED' | 'ORIGINAL' | 'SIDE_BY_SIDE' }
  const [inspectModalImage, setInspectModalImage] = useState(null);
  const [modalZoom, setModalZoom] = useState(1);
  const [selectedVehicle, setSelectedVehicle] = useState(null); // { imgIndex, vehicleIndex, vehicle }

  // Watchlist state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showWatchlistModal, setShowWatchlistModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const [clearingIncidents, setClearingIncidents] = useState(false);

  const handleClearIncidents = async () => {
    if (!window.confirm('Are you sure you want to clear all incident match alerts and plate detections from the database? Watchlist registry will be preserved.')) {
      return;
    }
    try {
      setClearingIncidents(true);
      await anprAPI.clearIncidents();
      clearBatchResults();
      toast.success('Incident detections and sighting records cleared successfully.');
      refetchAlerts();
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ['anpr-stats'] });
      queryClient.invalidateQueries({ queryKey: ['anpr-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['anpr-detections'] });
    } catch (err) {
      toast.error(`Failed to clear incidents: ${err.response?.data?.message || err.message}`);
    } finally {
      setClearingIncidents(false);
    }
  };

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
    clearBatchResults();
    setCurrentProcessingIndex(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Run ANPR Analysis with Real-time One-by-One Progressive Results
  const handleAnalyze = async () => {
    if (selectedFiles.length === 0) return;

    setAnalyzing(true);
    setCurrentProcessingIndex(0);
    const toastId = toast.loading(`Starting real-time AI analysis on ${selectedFiles.length} image(s)...`);

    const aggregatedResults = [];
    let totalPlatesDetected = 0;
    let totalMatchedPlates = 0;
    let totalAlertsGenerated = 0;
    let firstMatch = null;
    const batchStartTime = Date.now();

    // Initialize batch results immediately so user sees real-time progress right away
    setBatchResults({
      success: true,
      isProcessing: true,
      summary: {
        images_submitted: selectedFiles.length,
        images_processed: 0,
        total_plates_detected: 0,
        matching_plates: 0,
        alerts_generated: 0,
        total_duration_ms: 0,
      },
      results: [],
    });

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentProcessingIndex(i);
        toast.loading(`Processing image ${i + 1} of ${selectedFiles.length}: ${file.name}...`, { id: toastId });

        try {
          const formData = new FormData();
          formData.append('images', file);

          const res = await anprAPI.analyze(formData);
          const data = res.data;

          if (data.results && data.results.length > 0) {
            data.results.forEach((imgRes) => {
              imgRes.image_index = aggregatedResults.length + 1;
              aggregatedResults.push(imgRes);

              (imgRes.plates || []).forEach((p) => {
                if (p.match_status === 'MATCH_FOUND' || p.match_status === 'POSSIBLE_MATCH') {
                  if (!firstMatch) firstMatch = p;
                }
              });
            });
            totalPlatesDetected += data.summary?.total_plates_detected || 0;
            totalMatchedPlates += data.summary?.matching_plates || 0;
            totalAlertsGenerated += data.summary?.alerts_generated || 0;
          }
        } catch (imgErr) {
          console.error(`Error analyzing ${file.name}:`, imgErr);
          aggregatedResults.push({
            image_index: aggregatedResults.length + 1,
            image_name: file.name,
            file_size_kb: Math.round(file.size / 1024),
            status: 'FAILED',
            plates_detected: 0,
            matched_plates: 0,
            alerts_generated: 0,
            original_image: filePreviews[i] || '',
            processed_image: '',
            plates: [],
            error: imgErr.response?.data?.message || imgErr.message || 'Analysis failed',
            timings: { total_image_ms: 0 },
          });
        }

        // Real-time progressive UI update: immediately display plate crops & findings for this image!
        setBatchResults({
          success: true,
          isProcessing: i < selectedFiles.length - 1,
          summary: {
            images_submitted: selectedFiles.length,
            images_processed: aggregatedResults.length,
            total_plates_detected: totalPlatesDetected,
            matching_plates: totalMatchedPlates,
            alerts_generated: totalAlertsGenerated,
            total_duration_ms: Date.now() - batchStartTime,
          },
          results: [...aggregatedResults],
        });
      }

      setCurrentProcessingIndex(null);
      toast.success(
        `Analysis complete! Detected ${totalPlatesDetected} plate(s) across ${selectedFiles.length} image(s).`,
        { id: toastId }
      );

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
      setCurrentProcessingIndex(null);
    }
  };

  // Watchlist Save Mutation
  const handleSaveWatchlist = async (formData) => {
    try {
      if (editingRecord) {
        await anprAPI.updateWatchlistRecord(editingRecord._id, formData);
        toast.success('Watchlist record updated.');
      } else {
        const res = await anprAPI.createWatchlistRecord(formData);
        toast.success(res.data?.message || 'Vehicle plate registered into surveillance watchlist.');
      }
      setShowWatchlistModal(false);
      setEditingRecord(null);
      await refetchWatchlist();
      await refetchStats();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to save watchlist record';
      toast.error(errMsg);
      throw err;
    }
  };

  const handleDeleteRecord = async (record) => {
    if (!confirm(`Permanently delete vehicle plate "${record.plate_number}" from surveillance watchlist?`)) return;
    try {
      await anprAPI.deleteWatchlistRecord(record._id, true);
      toast.success(`Plate "${record.plate_number}" deleted from watchlist.`);
      await refetchWatchlist();
      await refetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete record');
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
          onClick={() => setActiveTab('LIVE_STREAM')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'LIVE_STREAM'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>Live CCTV &amp; Continuous ANPR</span>
          {selectedCameraId ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold">
              {selectedCameraId}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
              LIVE
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('SCANNER')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'SCANNER'
              ? 'border-blue-500 text-blue-500 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ScanEye className="w-4 h-4" />
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
          TAB 0: LIVE CCTV STREAM & CONTINUOUS ANPR WORKSPACE
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'LIVE_STREAM' && (
        <LiveANPRWorkspace
          cameraId={selectedCameraId || urlCamId || 'cam01'}
          onBackToGIS={() => navigate('/gis-map')}
          isLight={isLight}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 1: PLATE VERIFICATION & BATCH SCANNER
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'SCANNER' && (
        <div className="space-y-6">
          
          {/* Multi-image Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              setIsDragging(false);
              handleDrop(e);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all select-none ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10 scale-[1.005]'
                : isLight
                ? 'bg-white border-slate-300 hover:border-blue-500 hover:bg-blue-50/25 shadow-sm'
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

            <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <p className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  Drag &amp; drop vehicle images here, or{' '}
                  <span className="text-blue-500 underline font-extrabold">
                    browse files
                  </span>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports multiple CCTV snapshots, street camera frames (JPG, PNG, WebP · Max 10 images)
                </p>
              </div>
            </div>

            {/* Thumbnail Strip */}
            {selectedFiles.length > 0 && (
              <div className="mt-6 pt-6 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
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
                        <ScanEye className="w-4 h-4" />
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
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#121626] border-white/10'
              }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-black flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                      {batchResults.isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                          <span>Real-Time AI Scan in Progress...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>Analysis Completed ({batchResults.summary?.images_processed || 0} of {batchResults.summary?.images_submitted || 0} images)</span>
                        </>
                      )}
                    </h3>
                    {batchResults.isProcessing && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30 animate-pulse">
                        LIVE PROGRESSIVE STREAM
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {batchResults.isProcessing ? (
                      `Processed ${batchResults.summary?.images_processed || 0} of ${batchResults.summary?.images_submitted || 0} frames · elapsed ${batchResults.summary?.total_duration_ms || 0} ms`
                    ) : (
                      `Total duration: ${batchResults.summary?.total_duration_ms || 0} ms · Pipeline: YOLO11 + Zero-DCE + PaddleOCR`
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                    isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  }`}>
                    <Car className="w-3.5 h-3.5" />
                    <span>{batchResults.summary?.total_plates_detected || 0} Plates Detected</span>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                    (batchResults.summary?.matching_plates || 0) > 0
                      ? (isLight ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' : 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse')
                      : (isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-white/5 border-white/10 text-slate-300')
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{batchResults.summary?.matching_plates || 0} Watchlist Hits</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      clearBatchResults();
                      clearAllFiles();
                      toast.success('ANPR results cleared.');
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isLight
                        ? 'bg-slate-100 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-600 border-slate-300 shadow-2xs'
                        : 'bg-white/5 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-slate-400 border-white/10'
                    }`}
                    title="Clear current scan results"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Results</span>
                  </button>
                </div>
              </div>

              {/* Per-Image Cards */}
              <div className="space-y-4">
                {batchResults.results?.map((imgRes, idx) => (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                      isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/7'
                    }`}
                  >
                    <div className={`flex items-center justify-between flex-wrap gap-2 pb-3 border-b ${
                      isLight ? 'border-slate-100' : 'border-white/5'
                    }`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <ImageIcon className="w-4 h-4 text-blue-500" />
                        <span className={`text-xs font-black ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{imgRes.image_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({imgRes.file_size_kb} KB)</span>

                        {/* Exact Processing Timestamp Badge */}
                        <span
                          className={`text-[10px] font-mono flex items-center gap-1 px-2 py-0.5 rounded-lg border ${
                            isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-white/5 text-slate-300 border-white/10'
                          }`}
                          title="Exact time this plate was detected and recorded"
                        >
                          <Clock className="w-3 h-3 text-blue-500" />
                          <span>{imgRes.analyzed_time || (imgRes.analyzed_at ? new Date(imgRes.analyzed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Recorded Just now')}</span>
                        </span>

                        {/* Permanent Storage Confirmation Badge */}
                        {imgRes.status === 'SUCCESS' && (
                          <span
                            className={`text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg border ${
                              isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}
                            title="Analyzed plate details and timestamp stored to MongoDB and local registry"
                          >
                            <Database className="w-3 h-3 text-emerald-500" />
                            <span>Stored to Registry</span>
                          </span>
                        )}

                        {imgRes.status === 'FAILED' && (
                          <span className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-red-500/15 text-red-400 border-red-500/30">
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            <span>Analysis Error: {imgRes.error || 'Server error or timeout'}</span>
                          </span>
                        )}

                        {imgRes.simulated && (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                            isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                          }`}>
                            Fallback Simulation
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {imgRes.status === 'FAILED' ? (
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg border bg-red-500/20 text-red-400 border-red-500/40">
                            Failed
                          </span>
                        ) : imgRes.plates_detected > 0 ? (
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg flex items-center gap-1 border ${
                            isLight
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs'
                              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          }`}>
                            <CheckCircle2 className="w-3 h-3" />
                            {imgRes.plates_detected} {imgRes.plates_detected === 1 ? 'Plate' : 'Plates'}
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isLight
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          }`}>
                            0 Plates
                          </span>
                        )}
                        {imgRes.processing_time_ms && (
                          <span className={`text-[10px] font-mono flex items-center gap-1 ${
                            isLight ? 'text-slate-500' : 'text-slate-400'
                          }`}>
                            <Clock className="w-2.5 h-2.5" />
                            {imgRes.processing_time_ms}ms
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dual Viewport: Provided Input (Left) & Analyzed AI Detection (Right) in a Single Row */}
                    {(imgRes.processed_image || imgRes.original_image) && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Column 1: Provided / Uploaded Input Frame */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between px-1">
                            <span className={`text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                              isLight ? 'text-slate-800' : 'text-slate-200'
                            }`}>
                              <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                              <span>Provided Input Image</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-black/60 text-slate-400 border-white/10'
                              }`}>
                                RAW SENSOR
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectModalImage({ ...imgRes, activeView: 'ORIGINAL' });
                                  setModalZoom(1);
                                }}
                                className={`p-1 rounded-md border transition-all ${
                                  isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                                }`}
                                title="Inspect Fullscreen"
                              >
                                <Maximize2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div
                            onClick={() => {
                              setInspectModalImage({ ...imgRes, activeView: 'ORIGINAL' });
                              setModalZoom(1);
                            }}
                            className={`relative rounded-2xl overflow-hidden border p-2 flex items-center justify-center group cursor-zoom-in transition-all ${
                              isLight
                                ? 'bg-slate-950 border-slate-200 hover:border-blue-500 shadow-sm'
                                : 'bg-[#0a0d16] border-white/10 hover:border-blue-500/40 shadow-md'
                            }`}
                          >
                            <div className="absolute top-2.5 left-2.5 w-3 h-3 border-t-2 border-l-2 border-blue-400/80 pointer-events-none z-10" />
                            <div className="absolute top-2.5 right-2.5 w-3 h-3 border-t-2 border-r-2 border-blue-400/80 pointer-events-none z-10" />
                            <div className="absolute bottom-2.5 left-2.5 w-3 h-3 border-b-2 border-l-2 border-blue-400/80 pointer-events-none z-10" />
                            <div className="absolute bottom-2.5 right-2.5 w-3 h-3 border-b-2 border-r-2 border-blue-400/80 pointer-events-none z-10" />

                            <img
                              src={imgRes.original_image}
                              alt="Provided Input"
                              className="max-h-72 w-full object-contain rounded-xl shadow-md transition-transform duration-300 group-hover:scale-[1.01]"
                            />

                            <div className="absolute bottom-2 inset-x-2 z-10 bg-black/75 backdrop-blur-sm px-2.5 py-1.5 rounded-xl border border-white/10 flex items-center justify-between text-[10px] text-white opacity-90 group-hover:opacity-100 transition-opacity">
                              <span className="font-mono text-slate-300 truncate max-w-[200px]">{imgRes.image_name}</span>
                              <span className="text-blue-400 font-bold flex items-center gap-1">
                                <Maximize2 className="w-3 h-3" /> Click to Inspect
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Analyzed AI Output with Bounding Boxes */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between px-1">
                            <span className={`text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                              isLight ? 'text-blue-700' : 'text-blue-400'
                            }`}>
                              <Cpu className="w-3.5 h-3.5 text-blue-500" />
                              <span>Analyzed AI Detection</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-600 text-white shadow-xs">
                                YOLO + OCR DETECTIONS ({imgRes.plates_detected})
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectModalImage({ ...imgRes, activeView: 'ANNOTATED' });
                                  setModalZoom(1);
                                }}
                                className={`p-1 rounded-md border transition-all ${
                                  isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                                }`}
                                title="Inspect Fullscreen"
                              >
                                <Maximize2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div
                            onClick={() => {
                              setInspectModalImage({ ...imgRes, activeView: 'ANNOTATED' });
                              setModalZoom(1);
                            }}
                            className={`relative rounded-2xl overflow-hidden border p-2 flex items-center justify-center group cursor-zoom-in transition-all ${
                              isLight
                                ? 'bg-slate-950 border-blue-200 hover:border-blue-500 shadow-sm'
                                : 'bg-[#0a0d16] border-blue-500/30 hover:border-blue-400 shadow-md'
                            }`}
                          >
                            <div className="absolute top-2.5 left-2.5 w-3 h-3 border-t-2 border-blue-400 pointer-events-none z-10" />
                            <div className="absolute top-2.5 right-2.5 w-3 h-3 border-t-2 border-r-2 border-blue-400 pointer-events-none z-10" />
                            <div className="absolute bottom-2.5 left-2.5 w-3 h-3 border-b-2 border-l-2 border-blue-400 pointer-events-none z-10" />
                            <div className="absolute bottom-2.5 right-2.5 w-3 h-3 border-b-2 border-r-2 border-blue-400 pointer-events-none z-10" />

                            <img
                              src={imgRes.processed_image || imgRes.original_image}
                              alt="Analyzed Detection"
                              className="max-h-72 w-full object-contain rounded-xl shadow-md transition-transform duration-300 group-hover:scale-[1.01]"
                            />

                            {/* Selected Vehicle Focus Banner */}
                            {selectedVehicle && selectedVehicle.imgIndex === idx && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-2 inset-x-2 z-20 bg-blue-600/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl border border-blue-400/50 flex items-center justify-between text-xs shadow-lg"
                              >
                                <span className="font-bold flex items-center gap-1.5">
                                  <Car className="w-3.5 h-3.5 text-white" />
                                  <span>Focused: Vehicle #{selectedVehicle.vehicle.vehicle_index || selectedVehicle.vehicleIndex + 1}</span>
                                  <span className="opacity-80 font-normal">({selectedVehicle.vehicle.vehicle_type || 'Vehicle'} • {selectedVehicle.vehicle.vehicle_color || 'Unknown'})</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVehicle(null);
                                  }}
                                  className="text-[10px] bg-white/20 hover:bg-white/30 text-white font-semibold px-2 py-0.5 rounded-md transition-colors"
                                >
                                  Clear Focus
                                </button>
                              </div>
                            )}

                            <div className="absolute bottom-2 inset-x-2 z-10 bg-black/75 backdrop-blur-sm px-2.5 py-1.5 rounded-xl border border-white/10 flex items-center justify-between text-[10px] text-white opacity-90 group-hover:opacity-100 transition-opacity">
                              <div className="flex items-center gap-1.5 flex-wrap truncate max-w-[260px]">
                                {imgRes.plates && imgRes.plates.length > 0 ? (
                                  imgRes.plates.map((p, pidx) => (
                                    <span
                                      key={pidx}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[9px] bg-blue-500/30 text-blue-200 border border-blue-400/40"
                                    >
                                      <span>#{pidx + 1}</span>
                                      <span>{p.normalized_plate || p.raw_ocr}</span>
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-400 text-[10px]">No plates</span>
                                )}
                              </div>
                              <span className="text-blue-400 font-bold flex items-center gap-1 shrink-0">
                                <Maximize2 className="w-3 h-3" /> Fullscreen
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Successful ANPR Detections Table Section */}
                    {(() => {
                      // Only consume successful_anpr_results for the primary ANPR detections table
                      const successfulResults = (imgRes.successful_anpr_results && imgRes.successful_anpr_results.length > 0)
                        ? imgRes.successful_anpr_results
                        : (imgRes.plates || [])
                            .filter(p => p.normalized_plate && p.normalized_plate !== 'UNREADABLE')
                            .map((p, pIdx) => ({
                              vehicle_number: pIdx + 1,
                              vehicle_id: p.vehicle_id || `veh_${pIdx + 1}`,
                              number_plate: p.corrected_plate || p.normalized_plate || p.raw_ocr,
                              vehicle_type: p.vehicle_type || 'Car',
                              vehicle_color: p.car_color || 'Unknown',
                              plate_confidence: Math.round((p.detection_confidence || 0.9) * 100),
                              overall_confidence: Math.round((p.overall_confidence || p.ocr_confidence || 0.85) * 100),
                              status: p.result_state || 'VERIFIED',
                              plate_bbox: p.bbox,
                              vehicle_bbox: p.vehicle_bbox,
                              plate: p,
                            }));

                      const getColorHex = (cName) => {
                        if (!cName) return '#94a3b8';
                        const c = cName.toLowerCase();
                        if (c.includes('maroon')) return '#800000';
                        if (c.includes('white')) return '#ffffff';
                        if (c.includes('black')) return '#0f172a';
                        if (c.includes('red')) return '#ef4444';
                        if (c.includes('blue')) return '#3b82f6';
                        if (c.includes('green')) return '#22c55e';
                        if (c.includes('silver') || c.includes('grey') || c.includes('gray')) return '#cbd5e1';
                        if (c.includes('yellow')) return '#eab308';
                        if (c.includes('orange')) return '#f97316';
                        if (c.includes('brown')) return '#92400e';
                        return '#64748b';
                      };

                      return (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Car className="w-4 h-4 text-blue-500" />
                              <h4 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                SUCCESSFUL ANPR DETECTIONS ({successfulResults.length})
                              </h4>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className={`px-2 py-0.5 rounded-full border ${
                                isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                              }`}>
                                {successfulResults.length} Plates Detected
                              </span>
                              {selectedVehicle && selectedVehicle.imgIndex === idx && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedVehicle(null)}
                                  className="text-xs text-blue-500 hover:text-blue-400 font-semibold"
                                >
                                  Reset Selection
                                </button>
                              )}
                            </div>
                          </div>

                          {successfulResults.length === 0 ? (
                            <div className={`p-4 rounded-xl text-center border ${
                              isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-white/5 border-white/10 text-slate-400'
                            }`}>
                              <p className="text-xs italic">No readable license plates detected.</p>
                            </div>
                          ) : (
                            <>
                              {/* Desktop / Tablet Results Table */}
                              <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-black/20">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                                      isLight ? 'bg-slate-100/80 border-slate-200 text-slate-600' : 'bg-white/5 border-white/10 text-slate-400'
                                    }`}>
                                      <th className="py-2.5 px-3">#</th>
                                      <th className="py-2.5 px-3">NUMBER PLATE</th>
                                      <th className="py-2.5 px-3">VEHICLE TYPE</th>
                                      <th className="py-2.5 px-3">COLOR</th>
                                      <th className="py-2.5 px-3 text-center">PLATE CONF</th>
                                      <th className="py-2.5 px-3 text-center">OVERALL CONF</th>
                                      <th className="py-2.5 px-3 text-right">STATUS</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5 font-sans">
                                    {successfulResults.map((item, vIdx) => {
                                      const isSelected = selectedVehicle && selectedVehicle.imgIndex === idx && selectedVehicle.vehicleIndex === vIdx;
                                      const plate = item.plate || item;
                                      const isMatch = plate && (plate.match_status === 'MATCH_FOUND' || plate.match_status === 'POSSIBLE_MATCH');

                                      return (
                                        <tr
                                          key={vIdx}
                                          onClick={() => setSelectedVehicle(isSelected ? null : { imgIndex: idx, vehicleIndex: vIdx, vehicle: item })}
                                          onMouseEnter={() => setSelectedVehicle({ imgIndex: idx, vehicleIndex: vIdx, vehicle: item })}
                                          className={`cursor-pointer transition-colors ${
                                            isSelected
                                              ? (isLight ? 'bg-blue-50/90 ring-1 ring-blue-400' : 'bg-blue-950/40 ring-1 ring-blue-500')
                                              : (isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.03]')
                                          }`}
                                        >
                                          {/* # */}
                                          <td className="py-3 px-3 font-semibold text-slate-300">
                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                                              isSelected ? 'bg-blue-600 text-white' : isLight ? 'bg-slate-200 text-slate-700' : 'bg-white/10 text-slate-300'
                                            }`}>
                                              {item.vehicle_number || vIdx + 1}
                                            </span>
                                          </td>

                                          {/* NUMBER PLATE */}
                                          <td className="py-3 px-3 font-mono">
                                            <div className="inline-flex items-center rounded overflow-hidden border border-slate-800 shadow-xs text-xs">
                                              <span className="bg-[#003399] text-white text-[9px] px-1.5 py-0.5 font-sans font-black">
                                                IND
                                              </span>
                                              <span className="bg-white text-slate-950 px-2 py-0.5 font-extrabold tracking-wider">
                                                {item.number_plate}
                                              </span>
                                            </div>
                                          </td>

                                          {/* VEHICLE TYPE */}
                                          <td className="py-3 px-3 font-medium">
                                            <span className="capitalize">{item.vehicle_type || 'Car'}</span>
                                          </td>

                                          {/* COLOR */}
                                          <td className="py-3 px-3">
                                            <div className="flex items-center gap-1.5">
                                              <span
                                                className="w-3 h-3 rounded-full border border-black/20 shadow-xs shrink-0"
                                                style={{ backgroundColor: getColorHex(item.vehicle_color || item.car_color) }}
                                              />
                                              <span className="capitalize">{item.vehicle_color || item.car_color || 'Unknown'}</span>
                                            </div>
                                          </td>

                                          {/* PLATE CONF */}
                                          <td className="py-3 px-3 text-center font-mono">
                                            <span className="font-semibold text-slate-200">
                                              {item.plate_confidence != null ? `${item.plate_confidence}%` : '—'}
                                            </span>
                                          </td>

                                          {/* OVERALL CONF */}
                                          <td className="py-3 px-3 text-center font-mono">
                                            <span className="font-semibold text-blue-400">
                                              {item.overall_confidence != null ? `${item.overall_confidence}%` : '—'}
                                            </span>
                                          </td>

                                          {/* STATUS */}
                                          <td className="py-3 px-3 text-right">
                                            {isMatch ? (
                                              <div className="inline-flex items-center gap-1.5 justify-end">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-red-600 text-white shadow-xs animate-pulse">
                                                  MATCH
                                                </span>
                                                {plate?.matched_record && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setActiveMatchModal(plate);
                                                    }}
                                                    className="text-[10px] text-red-300 hover:text-white underline font-semibold"
                                                  >
                                                    Dossier
                                                  </button>
                                                )}
                                              </div>
                                            ) : (
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                                item.status === 'VERIFIED'
                                                  ? (isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30')
                                                  : (isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-500/15 text-blue-400 border-blue-500/30')
                                              }`}>
                                                {item.status || 'VERIFIED'}
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile Cards View */}
                              <div className="block md:hidden space-y-2">
                                {successfulResults.map((item, vIdx) => {
                                  const isSelected = selectedVehicle && selectedVehicle.imgIndex === idx && selectedVehicle.vehicleIndex === vIdx;
                                  const plate = item.plate || item;
                                  const isMatch = plate && (plate.match_status === 'MATCH_FOUND' || plate.match_status === 'POSSIBLE_MATCH');

                                  return (
                                    <div
                                      key={vIdx}
                                      onClick={() => setSelectedVehicle(isSelected ? null : { imgIndex: idx, vehicleIndex: vIdx, vehicle: item })}
                                      className={`p-3 rounded-xl border transition-all ${
                                        isSelected
                                          ? (isLight ? 'bg-blue-50/90 border-blue-400 shadow-sm' : 'bg-blue-950/40 border-blue-500')
                                          : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/10')
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                                            {item.vehicle_number || vIdx + 1}
                                          </span>
                                          <span className="text-xs font-bold capitalize">{item.vehicle_type || 'Car'}</span>
                                          <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                            <span
                                              className="w-2 h-2 rounded-full border border-black/20"
                                              style={{ backgroundColor: getColorHex(item.vehicle_color || item.car_color) }}
                                            />
                                            <span className="capitalize">{item.vehicle_color || item.car_color || 'Unknown'}</span>
                                          </div>
                                        </div>

                                        {isMatch ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white animate-pulse">
                                            MATCH
                                          </span>
                                        ) : (
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'
                                          }`}>
                                            {item.status || 'VERIFIED'}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center justify-between gap-2 mt-2">
                                        <div className="font-mono text-sm font-bold tracking-wider">
                                          {item.number_plate || plate?.plate_number || item.plate_number || 'UNKNOWN'}
                                        </div>
                                        <span className="text-[11px] text-slate-400 font-mono">
                                          {Math.round((plate?.confidence ?? item.confidence ?? 0) * 100)}%
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {imgRes.plates?.length === 0 ? (
                      <p className={`text-xs italic py-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        No license plates found in this image frame.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {imgRes.plates.map((plate, pIdx) => {
                          const isMatch = plate.match_status === 'MATCH_FOUND' || plate.match_status === 'POSSIBLE_MATCH';
                          const origCrop = plate.original_crop_b64 || plate.original_crop;
                          const enhCrop = plate.enhanced_crop_b64 || plate.enhanced_crop;
                          return (
                            <div
                              key={pIdx}
                              className={`p-4 rounded-2xl border transition-all ${
                                isMatch
                                  ? (isLight ? 'bg-red-50/90 border-red-300 shadow-sm' : 'bg-red-950/20 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]')
                                  : (isLight ? 'bg-slate-50/80 border-slate-200 shadow-xs hover:border-slate-300' : 'bg-black/30 border-white/8 hover:border-white/15')
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="plate-pill scale-105 origin-left mb-2">
                                    <span className="plate-ind">IND</span>
                                    <span className="plate-text">{plate.raw_ocr || plate.normalized_plate}</span>
                                  </div>
                                  <p className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                    Normalized: <strong className={isLight ? 'text-slate-900 font-black' : 'text-slate-200'}>{plate.normalized_plate}</strong>
                                  </p>
                                  {(plate.car_color || plate.vehicle_type) && (
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                      {plate.car_color && (
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                          isLight ? 'bg-white text-slate-700 border-slate-300 shadow-2xs' : 'bg-white/5 text-slate-300 border-white/10'
                                        }`}>
                                          <span
                                            className="w-2 h-2 rounded-full border border-black/20"
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
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                          isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        }`}>
                                          {plate.vehicle_type}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${
                                  isMatch
                                    ? 'bg-red-600 text-white border-red-500 animate-pulse'
                                    : isLight
                                    ? 'bg-slate-200/90 text-slate-700 border-slate-300 font-bold'
                                    : 'bg-slate-700 text-slate-300 border-slate-600'
                                }`}>
                                  {plate.match_status}
                                </span>
                              </div>

                              {/* Crops & Visual Evidence */}
                              {(origCrop || enhCrop) && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  {origCrop && (
                                    <div className={`rounded-xl p-2 text-center border transition-all ${
                                      isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-black/70 border-white/10'
                                    }`}>
                                      <p className={`text-[9px] font-bold mb-1 flex items-center justify-center gap-1 ${
                                        isLight ? 'text-slate-700' : 'text-slate-400'
                                      }`}>
                                        <Eye className="w-2.5 h-2.5 text-slate-500" />
                                        <span>Raw Crop</span>
                                      </p>
                                      <div className={`h-16 flex items-center justify-center rounded-lg p-1 overflow-hidden ${
                                        isLight ? 'bg-slate-900 border border-slate-800' : 'bg-black/40'
                                      }`}>
                                        <img
                                          src={origCrop.startsWith('data:') ? origCrop : `data:image/jpeg;base64,${origCrop}`}
                                          alt="Raw Plate Crop"
                                          className="max-h-full max-w-full object-contain filter drop-shadow hover:scale-110 transition-transform"
                                        />
                                      </div>
                                    </div>
                                  )}
                                  {enhCrop && (
                                    <div className={`rounded-xl p-2 text-center border transition-all ${
                                      isLight ? 'bg-white border-blue-200 shadow-xs' : 'bg-black/70 border-blue-500/30'
                                    }`}>
                                      <p className={`text-[9px] font-bold mb-1 flex items-center justify-center gap-1 ${
                                        isLight ? 'text-blue-700' : 'text-blue-400'
                                      }`}>
                                        <Cpu className="w-2.5 h-2.5 text-blue-500" />
                                        <span>Enhanced Plate</span>
                                      </p>
                                      <div className={`h-16 flex items-center justify-center rounded-lg p-1 overflow-hidden ${
                                        isLight ? 'bg-slate-900 border border-slate-800' : 'bg-black/40'
                                      }`}>
                                        <img
                                          src={enhCrop.startsWith('data:') ? enhCrop : `data:image/jpeg;base64,${enhCrop}`}
                                          alt="Enhanced Plate Crop"
                                          className="max-h-full max-w-full object-contain filter drop-shadow hover:scale-110 transition-transform"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Confidence Meter */}
                              <div className="mt-3 space-y-1">
                                <div className={`flex justify-between text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                  <span>OCR Confidence</span>
                                  <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                                    {Math.round((plate.ocr_confidence || 0.95) * 100)}%
                                  </span>
                                </div>
                                <div className={`w-full rounded-full h-1.5 overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-white/10'}`}>
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
                                    <span className={`font-black ${isLight ? 'text-red-700' : 'text-red-400'}`}>
                                      {plate.matched_record.category} VEHICLE
                                    </span>
                                    <button
                                      onClick={() => setActiveMatchModal(plate)}
                                      className="text-[10px] text-white bg-red-600 hover:bg-red-500 px-2 py-0.5 rounded font-bold transition-colors"
                                    >
                                      View Dossier
                                    </button>
                                  </div>
                                  <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
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

                {/* Active live processing card for currently analyzed frame */}
                {batchResults.isProcessing && currentProcessingIndex !== null && selectedFiles[currentProcessingIndex] && (
                  <div className={`rounded-2xl border-2 border-dashed p-5 flex items-center gap-4 transition-all animate-pulse ${
                    isLight ? 'bg-blue-50/70 border-blue-400/60 shadow-sm' : 'bg-blue-950/20 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                  }`}>
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/50 border border-blue-500/30 flex-shrink-0 relative shadow-inner">
                      {filePreviews[currentProcessingIndex] && (
                        <img
                          src={filePreviews[currentProcessingIndex]}
                          alt="Processing"
                          className="w-full h-full object-cover opacity-60"
                        />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping inline-block" />
                          Processing Frame {currentProcessingIndex + 1} of {selectedFiles.length}...
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                          AI PIPELINE ACTIVE
                        </span>
                      </div>
                      <p className={`text-xs font-bold truncate mt-1 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {selectedFiles[currentProcessingIndex].name}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Detecting vehicle bounding box, cropping plate region, performing Zero-DCE &amp; OCR recognition...
                      </p>
                    </div>
                  </div>
                )}
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
              onAnalysisComplete={(jobId, videoId, sourceVideoUrl) => {
                setActiveVideoJob({ jobId, videoId, sourceVideoUrl });
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
                <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/5'}`}>
                  {watchlistLoading ? (
                    <tr>
                      <td colSpan={8} className={`py-12 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                        Loading surveillance watchlist...
                      </td>
                    </tr>
                  ) : watchlistData?.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={`py-12 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        No watchlist records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    watchlistData?.map((rec) => (
                      <tr key={rec._id} className={`transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/3'}`}>
                        <td className="px-4 py-3">
                          <div className="plate-pill scale-90 origin-left">
                            <span className="plate-ind">IND</span>
                            <span className="plate-text">{rec.plate_number}</span>
                          </div>
                          <p className={`text-[10px] font-mono mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{rec.recordId}</p>
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

                        <td className={`px-4 py-3 font-mono ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                          {rec.reference_id || '—'}
                        </td>

                        <td className="px-4 py-3">
                          <p className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{rec.ownerName || '—'}</p>
                          <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{rec.vehicleModel || '—'}</p>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`font-mono font-bold ${(rec.total_alerts || 0) > 0 ? (isLight ? 'text-red-600' : 'text-red-400') : (isLight ? 'text-slate-400' : 'text-slate-500')}`}>
                            {rec.total_alerts || 0}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            rec.status === 'ACTIVE'
                              ? (isLight ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30')
                              : (isLight ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-slate-700 text-slate-400')
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
                              className={`p-1.5 rounded-lg transition-colors ${
                                isLight ? 'text-slate-500 hover:text-blue-600 hover:bg-slate-100' : 'text-slate-400 hover:text-blue-400 hover:bg-white/5'
                              }`}
                              title="Edit Record"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(rec)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isLight ? 'text-slate-500 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-red-400 hover:bg-white/5'
                              }`}
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
            <h3 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
              License Plate Match Incidents ({alertsData?.length || 0})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetchAlerts()}
                className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-semibold px-2.5 py-1.5 rounded-lg border border-transparent hover:border-blue-500/20"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
              <button
                onClick={handleClearIncidents}
                disabled={clearingIncidents}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 transition-all disabled:opacity-50"
                title="Purge all incident match records and sightings from database"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {clearingIncidents ? 'Clearing...' : 'Clear Incidents'}
              </button>
            </div>
          </div>

          {alertsLoading ? (
            <div className={`py-16 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
              Loading incident alerts...
            </div>
          ) : alertsData?.length === 0 ? (
            <div className={`py-16 text-center rounded-2xl border border-dashed p-8 ${
              isLight ? 'bg-white border-slate-200 text-slate-600 shadow-xs' : 'border-white/10 text-slate-500'
            }`}>
              <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-2" />
              <p className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>No active ANPR match incidents</p>
              <p className="text-xs text-slate-500 mt-0.5">All monitored vehicle scans are normal.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alertsData?.map((alert) => (
                <div
                  key={alert._id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                    alert.severity === 'critical'
                      ? (isLight ? 'bg-red-50/90 border-red-200 hover:bg-red-100/70 shadow-xs' : 'bg-red-950/25 border-red-500/40 hover:bg-red-950/35')
                      : (isLight ? 'bg-white border-slate-200 hover:bg-slate-50 shadow-xs' : 'bg-[#141929] border-white/8 hover:bg-[#1a2035]')
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0 mt-0.5">
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
                      <p className={`text-xs mt-1 ${isLight ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>{alert.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                        <span>District: <strong className={isLight ? 'text-slate-700' : 'text-slate-400'}>{alert.district || 'Ahmedabad'}</strong></span>
                        <span>Camera: <strong className="text-blue-500 font-semibold">{alert.camera?.name || alert.cameraId || 'CCTV-CAM'}</strong></span>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-blue-500" />
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

      {/* ─── High-Resolution Tactical Image Inspection Modal ─── */}
      {inspectModalImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setInspectModalImage(null)}
        >
          <div
            className={`w-full max-w-5xl max-h-[92vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl transition-all ${
              isLight
                ? 'bg-white border-slate-200 text-slate-900 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.25)] ring-1 ring-slate-900/5'
                : 'bg-[#0f1422] border-white/15 text-white shadow-2xl'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`p-4 border-b flex items-center justify-between flex-wrap gap-3 transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/40 border-white/10 text-white'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  isLight
                    ? 'bg-blue-50 border border-blue-200 text-blue-600 shadow-2xs'
                    : 'bg-blue-600/20 border border-blue-500/30 text-blue-400'
                }`}>
                  <Crosshair className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{inspectModalImage.image_name}</h3>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>({inspectModalImage.file_size_kb} KB)</span>
                  </div>
                  <div className={`flex items-center gap-2 mt-0.5 text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>{inspectModalImage.analyzed_time || (inspectModalImage.analyzed_at ? new Date(inspectModalImage.analyzed_at).toLocaleTimeString() : 'Recorded Just now')}</span>
                    </span>
                    <span>·</span>
                    <span className={`flex items-center gap-1 font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                      <Database className="w-3 h-3 text-emerald-500" />
                      <span>Stored to Registry &amp; DB</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* View Switcher & Zoom Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`inline-flex rounded-xl p-0.5 border ${
                  isLight ? 'bg-slate-200/80 border-slate-300' : 'bg-black/60 border-white/10'
                }`}>
                  <button
                    type="button"
                    onClick={() => setInspectModalImage(prev => ({ ...prev, activeView: 'ANNOTATED' }))}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${
                      (inspectModalImage.activeView || 'ANNOTATED') === 'ANNOTATED'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ScanEye className="w-3 h-3" />
                    <span>AI Annotated</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectModalImage(prev => ({ ...prev, activeView: 'ORIGINAL' }))}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${
                      inspectModalImage.activeView === 'ORIGINAL'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>Raw Frame</span>
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className={`flex items-center gap-1 rounded-xl px-1 py-0.5 border ${
                  isLight ? 'bg-slate-200/80 border-slate-300 text-slate-700' : 'bg-black/60 border-white/10 text-slate-300'
                }`}>
                  <button
                    type="button"
                    onClick={() => setModalZoom(z => Math.max(0.7, Number((z - 0.2).toFixed(1))))}
                    className={`p-1 rounded transition-colors ${
                      isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/60' : 'text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalZoom(1)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                      isLight ? 'text-slate-800' : 'text-slate-300 hover:text-white'
                    }`}
                    title="Reset Zoom"
                  >
                    {Math.round(modalZoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalZoom(z => Math.min(2.5, Number((z + 0.2).toFixed(1))))}
                    className={`p-1 rounded transition-colors ${
                      isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/60' : 'text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setInspectModalImage(null)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ml-1 border ${
                    isLight
                      ? 'bg-slate-200/80 hover:bg-slate-300 border-slate-300 text-slate-700'
                      : 'bg-white/10 hover:bg-white/20 border-white/10 text-slate-300 hover:text-white'
                  }`}
                  title="Close inspection"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Image Surface */}
            <div className={`flex-1 overflow-auto p-4 flex items-center justify-center min-h-[360px] relative transition-colors ${
              isLight ? 'bg-slate-100/90 border-y border-slate-200' : 'bg-[#070a12]'
            }`}>
              <img
                src={
                  inspectModalImage.activeView === 'ORIGINAL'
                    ? inspectModalImage.original_image
                    : (inspectModalImage.processed_image || inspectModalImage.original_image)
                }
                alt={inspectModalImage.image_name}
                style={{ transform: `scale(${modalZoom})`, transformOrigin: 'center center' }}
                className="max-h-[58vh] max-w-full object-contain rounded-xl shadow-2xl transition-transform duration-200 select-none"
              />
            </div>

            {/* Modal Telemetry & Plate Crops Footer */}
            <div className={`p-4 border-t space-y-3 transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/60 border-white/10'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  <Car className="w-3.5 h-3.5 text-blue-500" />
                  <span>Detected Plates ({inspectModalImage.plates?.length || 0})</span>
                </span>
                <span className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Total Processing Time: <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200'}>{inspectModalImage.timings?.total_image_ms || 120} ms</strong>
                </span>
              </div>

              {inspectModalImage.plates && inspectModalImage.plates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                  {inspectModalImage.plates.map((plate, pidx) => (
                    <div
                      key={pidx}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        isLight
                          ? 'bg-white border-slate-200 text-slate-900 shadow-2xs hover:border-slate-300'
                          : 'border-white/10 bg-black/40 text-slate-100'
                      }`}
                    >
                      <div>
                        <div className="plate-pill scale-95 origin-left mb-1">
                          <span className="plate-ind">IND</span>
                          <span className="plate-text">{plate.raw_ocr || plate.normalized_plate}</span>
                        </div>
                        <div className={`flex items-center gap-2 text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          <span>Conf: <strong className={isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400 font-bold'}>{Math.round((plate.overall_confidence || 0.95) * 100)}%</strong></span>
                          {plate.car_color && <span>· {plate.car_color} {plate.vehicle_type || 'car'}</span>}
                          {plate.validation_status && <span className={isLight ? 'text-blue-700 font-semibold' : 'text-blue-400 font-semibold'}>· {plate.validation_status}</span>}
                        </div>
                      </div>

                      {/* Thumbnails */}
                      <div className="flex items-center gap-2 shrink-0">
                        {plate.enhanced_crop_b64 && (
                          <div className={`rounded-lg p-1 border text-center ${
                            isLight ? 'bg-slate-100 border-blue-200' : 'bg-black/80 border-blue-500/30'
                          }`}>
                            <span className={`text-[8px] block font-bold ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>Enhanced</span>
                            <div className={`rounded overflow-hidden p-0.5 ${isLight ? 'bg-slate-900' : 'bg-transparent'}`}>
                              <img
                                src={plate.enhanced_crop_b64.startsWith('data:') ? plate.enhanced_crop_b64 : `data:image/jpeg;base64,${plate.enhanced_crop_b64}`}
                                alt="Enhanced Crop"
                                className="h-9 w-auto object-contain rounded"
                              />
                            </div>
                          </div>
                        )}
                        {plate.original_crop_b64 && (
                          <div className={`rounded-lg p-1 border text-center ${
                            isLight ? 'bg-slate-100 border-slate-200' : 'bg-black/80 border-white/10'
                          }`}>
                            <span className={`text-[8px] block font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Raw</span>
                            <div className={`rounded overflow-hidden p-0.5 ${isLight ? 'bg-slate-900' : 'bg-transparent'}`}>
                              <img
                                src={plate.original_crop_b64.startsWith('data:') ? plate.original_crop_b64 : `data:image/jpeg;base64,${plate.original_crop_b64}`}
                                alt="Raw Crop"
                                className="h-9 w-auto object-contain rounded"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`text-xs italic ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>No license plates identified in this frame.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

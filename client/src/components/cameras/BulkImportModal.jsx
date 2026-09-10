import { useState, useRef, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cameraAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import {
  X, UploadCloud, FileSpreadsheet, Download, CheckCircle2,
  AlertTriangle, XCircle, RefreshCw, MapPin, Search,
  ChevronRight, Shield, AlertCircle, Check, FileText, ArrowRight, Eye, Play
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom Map Marker for Import Preview
const previewMarkerIcon = L.divIcon({
  className: 'custom-import-preview-marker',
  html: `
    <div style="
      width: 24px;
      height: 24px;
      background: #0284c7;
      border: 2px solid #ffffff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 12px rgba(2, 132, 199, 0.6);
      color: white;
      font-size: 11px;
      font-weight: 800;
    ">
      ★
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function BulkImportModal({ isOpen, onClose, onImportSuccess }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const fileInputRef = useRef(null);

  // Workflow Steps: 'upload' | 'preview' | 'complete'
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Session Data returned from /validate
  const [sessionData, setSessionData] = useState(null);

  // Filter & Search inside Data Preview
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'valid' | 'errors' | 'warnings' | 'duplicates'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [isMapPreviewOpen, setIsMapPreviewOpen] = useState(false);

  // Confirmation Dialog State
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Result state after /import
  const [importResult, setImportResult] = useState(null);

  // ─── MUTATIONS ─────────────────────────────────────────────────────────────

  // 1. Validation Mutation (Upload & Parse without saving to Camera collection)
  const validateMutation = useMutation({
    mutationFn: (uploadFile) => {
      const formData = new FormData();
      formData.append('file', uploadFile);
      return cameraAPI.validateBulk(formData);
    },
    onSuccess: (res) => {
      const data = res.data;
      setSessionData(data);
      setStep('preview');
      toast.success(`Analysis complete: ${data.summary?.total || 0} rows evaluated.`);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || 'Validation failed';
      toast.error(msg);
    },
  });

  // 2. Commit Mutation (Saves valid cameras to MongoDB)
  const commitMutation = useMutation({
    mutationFn: (importId) => cameraAPI.commitBulkImport(importId),
    onSuccess: (res) => {
      const data = res.data;
      setImportResult(data);
      setIsConfirmOpen(false);
      setStep('complete');

      // Invalidate relevant queries so registry & GIS map refresh immediately
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      queryClient.invalidateQueries({ queryKey: ['camera-stats'] });

      toast.success(`Successfully onboarded ${data.importedCount} cameras!`);
      if (onImportSuccess) onImportSuccess(data);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Failed to commit bulk import';
      toast.error(msg);
      setIsConfirmOpen(false);
    },
  });

  // ─── ACTIONS & HANDLERS ───────────────────────────────────────────────────

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    const lowerName = selectedFile.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      toast.error('Invalid file format. Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      toast.error('File size exceeds maximum limit of 15MB.');
      return;
    }

    setFile(selectedFile);
    validateMutation.mutate(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      toast('Generating official template...', { icon: '📄' });
      const res = await cameraAPI.downloadBulkTemplate();
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'DrishtiGrid_Camera_Registry_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully!');
    } catch (err) {
      toast.error('Failed to download camera registry template.');
    }
  };

  const handleDownloadReport = async (importId) => {
    if (!importId) return;
    try {
      toast('Generating audit report...', { icon: '📊' });
      const res = await cameraAPI.downloadImportReport(importId);
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `DrishtiGrid_Import_Report_${importId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Audit report downloaded!');
    } catch (err) {
      toast.error('Failed to download import report.');
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setSessionData(null);
    setImportResult(null);
    setSelectedRow(null);
    setIsMapPreviewOpen(false);
    setIsConfirmOpen(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // ─── FILTERED ROWS & METRICS ──────────────────────────────────────────────

  const allRows = sessionData?.rows || [];

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allRows.filter((r) => {
      // 1. Status filter
      let matchStatus = true;
      if (activeFilter === 'valid') matchStatus = r.status === 'VALID';
      else if (activeFilter === 'errors') matchStatus = r.status === 'ERROR';
      else if (activeFilter === 'warnings') matchStatus = r.status === 'WARNING';
      else if (activeFilter === 'duplicates') matchStatus = r.status === 'DUPLICATE';

      // 2. Search query
      if (!matchStatus) return false;
      if (!q) return true;

      const id = (r.normalized?.cameraId || r.data?.cameraId || '').toLowerCase();
      const name = (r.normalized?.cameraName || r.data?.cameraName || '').toLowerCase();
      const district = (r.normalized?.district || r.data?.district || '').toLowerCase();
      const road = (r.normalized?.roadName || r.data?.roadName || '').toLowerCase();

      return id.includes(q) || name.includes(q) || district.includes(q) || road.includes(q);
    });
  }, [allRows, activeFilter, searchQuery]);

  // Valid rows eligible for map preview
  const validPreviewPoints = useMemo(() => {
    return allRows
      .filter((r) => (r.status === 'VALID' || r.status === 'WARNING') && !r.isDuplicate)
      .map((r) => ({
        id: r.normalized?.cameraId,
        name: r.normalized?.cameraName,
        district: r.normalized?.district,
        lat: r.normalized?.latitude,
        lng: r.normalized?.longitude,
        type: r.normalized?.type,
        status: r.status,
      }))
      .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng));
  }, [allRows]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${
        isLight ? 'bg-white border border-slate-200 text-slate-900' : 'bg-[#0d1322] border border-white/10 text-slate-100'
      }`}>
        
        {/* Top Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
          isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-[#141929]/70 border-white/10'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isLight ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-blue-600/15 border-blue-500/30 text-blue-400'
            }`}>
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  Bulk Camera Onboarding & GIS Registry Import
                </h2>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                  isLight ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}>
                  GOV SPEC
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Excel metadata verification, spatial bounds validation, and safe atomic ingestion
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
              isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className={`px-6 py-2.5 border-b flex items-center justify-between text-xs shrink-0 ${
          isLight ? 'bg-slate-100/80 border-slate-200' : 'bg-[#0a0f1d] border-white/5'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === 'upload' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
            }`}>
              {step === 'upload' ? '1' : '✓'}
            </span>
            <span className={step === 'upload' ? (isLight ? 'font-bold text-blue-600' : 'font-bold text-blue-400') : (isLight ? 'text-slate-600' : 'text-slate-400')}>
              Upload Excel
            </span>
          </div>
          <span className={isLight ? 'text-slate-300' : 'text-slate-700'}>────────</span>
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === 'preview' ? 'bg-blue-600 text-white' : step === 'complete' ? 'bg-emerald-600 text-white' : isLight ? 'bg-slate-200 text-slate-600' : 'bg-white/10 text-slate-400'
            }`}>
              {step === 'complete' ? '✓' : '2'}
            </span>
            <span className={step === 'preview' ? (isLight ? 'font-bold text-blue-600' : 'font-bold text-blue-400') : (isLight ? 'text-slate-500' : 'text-slate-400')}>
              Validate & Preview
            </span>
          </div>
          <span className={isLight ? 'text-slate-300' : 'text-slate-700'}>────────</span>
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === 'complete' ? 'bg-emerald-600 text-white' : isLight ? 'bg-slate-200 text-slate-600' : 'bg-white/10 text-slate-400'
            }`}>
              3
            </span>
            <span className={step === 'complete' ? (isLight ? 'font-bold text-emerald-600' : 'font-bold text-emerald-400') : (isLight ? 'text-slate-500' : 'text-slate-400')}>
              Persistence & GIS Sync
            </span>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className={`flex-1 overflow-y-auto p-6 space-y-6 ${isLight ? 'bg-white text-slate-800' : 'bg-[#0d1322] text-slate-100'}`}>

          {/* ══════════════════════════════════════════════════════════════════
              STEP 1: UPLOAD EXCEL
             ══════════════════════════════════════════════════════════════════ */}
          {step === 'upload' && (
            <div className="space-y-6 max-w-2xl mx-auto py-4">
              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragging
                    ? (isLight ? 'border-blue-500 bg-blue-50/80 scale-[1.01]' : 'border-blue-500 bg-blue-500/10 scale-[1.01]')
                    : (isLight ? 'border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/30' : 'border-white/15 bg-white/[0.02] hover:border-blue-500/50 hover:bg-white/[0.04]')
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />

                <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-4 ${
                  isLight ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}>
                  {validateMutation.isPending ? (
                    <RefreshCw className={`w-8 h-8 animate-spin ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                  ) : (
                    <FileSpreadsheet className="w-8 h-8" />
                  )}
                </div>

                <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  {validateMutation.isPending ? 'Analyzing Excel File...' : 'Drop your Camera Metadata Excel here'}
                </h3>
                <p className={`text-xs mt-1 max-w-md ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {validateMutation.isPending
                    ? 'Verifying columns, normalizing schemas, and cross-referencing database...'
                    : 'Supports Microsoft Excel (.xlsx or .xls) up to 15MB. All rows will be validated prior to database persistence.'}
                </p>

                <button
                  type="button"
                  disabled={validateMutation.isPending}
                  className="mt-5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
                >
                  Browse Files
                </button>
              </div>

              {/* Template & Guidelines Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/8'
                }`}>
                  <div>
                    <div className={`flex items-center gap-2 text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                      <Download className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                      Official Registry Template
                    </div>
                    <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Contains required columns, instruction sheet, reference enums, and sample rows.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className={`mt-3 flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isLight ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200' : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    Download Template (.xlsx)
                  </button>
                </div>

                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/8'
                }`}>
                  <div>
                    <div className={`flex items-center gap-2 text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                      <Shield className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                      Verification Safeguards
                    </div>
                    <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      No records are saved upon upload. You will review row-by-row validation errors and preview cameras on the GIS map.
                    </p>
                  </div>
                  <div className={`mt-3 flex items-center gap-1.5 text-[11px] font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                    <Check className="w-3.5 h-3.5" />
                    Two-Phase Transaction Security
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 2: PRE-SAVE DATA PREVIEW & ANALYSIS
             ══════════════════════════════════════════════════════════════════ */}
          {step === 'preview' && sessionData && (
            <div className="space-y-5">
              {/* Validation Summary Metrics Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/8'}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Total Rows</span>
                  <p className={`text-xl font-black font-mono mt-0.5 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{sessionData.summary?.total || 0}</p>
                </div>
                <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-emerald-50/80 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                    <CheckCircle2 className="w-3 h-3" /> Valid Rows
                  </span>
                  <p className={`text-xl font-black font-mono mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{sessionData.summary?.valid || 0}</p>
                </div>
                <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-amber-50/80 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                    <AlertTriangle className="w-3 h-3" /> Warnings
                  </span>
                  <p className={`text-xl font-black font-mono mt-0.5 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{sessionData.summary?.warnings || 0}</p>
                </div>
                <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-rose-50/80 border-rose-200' : 'bg-rose-500/10 border-rose-500/20'}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-rose-700' : 'text-rose-400'}`}>
                    <XCircle className="w-3 h-3" /> Errors
                  </span>
                  <p className={`text-xl font-black font-mono mt-0.5 ${isLight ? 'text-rose-700' : 'text-rose-400'}`}>{sessionData.summary?.errors || 0}</p>
                </div>
                <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-indigo-50/80 border-indigo-200' : 'bg-indigo-500/10 border-indigo-500/20'}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-indigo-700' : 'text-indigo-400'}`}>
                    <RefreshCw className="w-3 h-3" /> Duplicates
                  </span>
                  <p className={`text-xl font-black font-mono mt-0.5 ${isLight ? 'text-indigo-700' : 'text-indigo-400'}`}>{sessionData.summary?.duplicates || 0}</p>
                </div>
              </div>

              {/* Action Toolbar: Filter Pills, Search, and Map Preview Toggle */}
              <div className={`flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl border ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141929]/50 border-white/8'
              }`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : isLight
                        ? 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-sm'
                        : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({sessionData.summary?.total || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('valid')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      activeFilter === 'valid'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                        : isLight
                        ? 'bg-white border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50 shadow-sm'
                        : 'bg-white/5 text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    ✓ Valid ({sessionData.summary?.valid || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('errors')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      activeFilter === 'errors'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                        : isLight
                        ? 'bg-white border border-slate-200 text-slate-600 hover:text-rose-700 hover:bg-rose-50/50 shadow-sm'
                        : 'bg-white/5 text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    ❌ Errors ({sessionData.summary?.errors || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('warnings')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      activeFilter === 'warnings'
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                        : isLight
                        ? 'bg-white border border-slate-200 text-slate-600 hover:text-amber-700 hover:bg-amber-50/50 shadow-sm'
                        : 'bg-white/5 text-slate-400 hover:text-amber-400'
                    }`}
                  >
                    ⚠ Warnings ({sessionData.summary?.warnings || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('duplicates')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      activeFilter === 'duplicates'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : isLight
                        ? 'bg-white border border-slate-200 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/50 shadow-sm'
                        : 'bg-white/5 text-slate-400 hover:text-indigo-400'
                    }`}
                  >
                    ↻ Duplicates ({sessionData.summary?.duplicates || 0})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                    <input
                      type="text"
                      placeholder="Search ID, name, district..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-blue-500 w-48 sm:w-60 border ${
                        isLight
                          ? 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                          : 'bg-black/30 border-white/10 text-slate-200 placeholder-slate-500'
                      }`}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMapPreviewOpen(!isMapPreviewOpen)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      isMapPreviewOpen
                        ? isLight
                          ? 'bg-cyan-50 border-cyan-300 text-cyan-800'
                          : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                        : isLight
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-cyan-500" />
                    {isMapPreviewOpen ? 'Hide Map Preview' : 'Preview on Map'}
                  </button>
                </div>
              </div>

              {/* Optional GIS Map Preview (Shows candidate coordinates on map before persistence) */}
              {isMapPreviewOpen && (
                <div className={`border rounded-xl overflow-hidden shadow-xl relative ${
                  isLight ? 'border-cyan-200 bg-white' : 'border-cyan-500/30 bg-[#0a0f1d]'
                }`}>
                  <div className={`px-4 py-2 border-b flex items-center justify-between ${
                    isLight ? 'bg-cyan-50/90 border-cyan-200' : 'bg-cyan-950/40 border-cyan-500/20'
                  }`}>
                    <div className={`flex items-center gap-2 text-xs font-bold ${isLight ? 'text-cyan-900' : 'text-cyan-300'}`}>
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      GIS STAGING PREVIEW ({validPreviewPoints.length} valid coordinates)
                    </div>
                    <span className={`text-[11px] font-mono ${isLight ? 'text-cyan-700' : 'text-cyan-400/80'}`}>
                      Temporary Preview Pins • Uncommitted
                    </span>
                  </div>

                  <div className="h-[280px] w-full relative z-0">
                    <MapContainer
                      center={[23.0225, 72.5714]}
                      zoom={7}
                      scrollWheelZoom={false}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        attribution='&copy; OpenStreetMap'
                      />
                      {validPreviewPoints.map((p) => (
                        <Marker key={p.id} position={[p.lat, p.lng]} icon={previewMarkerIcon}>
                          <Popup>
                            <div className="text-xs space-y-1">
                              <p className="font-bold text-blue-600">{p.id}</p>
                              <p className="font-semibold text-slate-800">{p.name}</p>
                              <p className="text-slate-600">{p.district} • {p.type}</p>
                              <p className="font-mono text-[10px] text-slate-500">
                                {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                              </p>
                            </div>
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div className={`border rounded-xl overflow-hidden ${
                isLight ? 'border-slate-200 bg-white shadow-sm' : 'border-white/10 bg-black/20'
              }`}>
                <div className="overflow-x-auto max-h-[340px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className={`sticky top-0 z-10 font-semibold uppercase tracking-wider text-[10px] border-b ${
                      isLight ? 'bg-slate-100/90 text-slate-600 border-slate-200' : 'bg-[#141929] text-slate-400 border-white/10'
                    }`}>
                      <tr>
                        <th className="py-2.5 px-3"># Row</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Camera ID</th>
                        <th className="py-2.5 px-3">Camera Title</th>
                        <th className="py-2.5 px-3">District</th>
                        <th className="py-2.5 px-3">Coordinates</th>
                        <th className="py-2.5 px-3">Dept</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-right">Action / Diagnostic</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-white/5'}`}>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className={`py-8 text-center ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                            No records found matching the active filter or search query.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r) => {
                          const isErr = r.status === 'ERROR';
                          const isWarn = r.status === 'WARNING';
                          const isDup = r.status === 'DUPLICATE';

                          return (
                            <tr
                              key={r.rowNumber}
                              onClick={() => setSelectedRow(selectedRow?.rowNumber === r.rowNumber ? null : r)}
                              className={`transition-colors cursor-pointer ${
                                selectedRow?.rowNumber === r.rowNumber
                                  ? isLight ? 'bg-blue-50/80' : 'bg-blue-600/10'
                                  : isLight ? 'hover:bg-slate-50/80' : 'hover:bg-white/[0.04]'
                              }`}
                            >
                              <td className={`py-2 px-3 font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Row {r.rowNumber}</td>
                              <td className="py-2 px-3">
                                {isErr && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isLight ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                  }`}>
                                    <XCircle className="w-2.5 h-2.5" /> ERROR
                                  </span>
                                )}
                                {isWarn && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isLight ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  }`}>
                                    <AlertTriangle className="w-2.5 h-2.5" /> WARNING
                                  </span>
                                )}
                                {isDup && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isLight ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                                  }`}>
                                    <RefreshCw className="w-2.5 h-2.5" /> DUPLICATE
                                  </span>
                                )}
                                {r.status === 'VALID' && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isLight ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  }`}>
                                    <Check className="w-2.5 h-2.5" /> VALID
                                  </span>
                                )}
                              </td>
                              <td className={`py-2 px-3 font-mono font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                                {r.normalized?.cameraId || r.data?.cameraId || '—'}
                              </td>
                              <td className={`py-2 px-3 max-w-[200px] truncate ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                                {r.normalized?.cameraName || r.data?.cameraName || '—'}
                              </td>
                              <td className={`py-2 px-3 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                {r.normalized?.district || r.data?.district || '—'}
                              </td>
                              <td className={`py-2 px-3 font-mono text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                {r.normalized?.latitude !== undefined
                                  ? `${r.normalized.latitude.toFixed(4)}, ${r.normalized.longitude.toFixed(4)}`
                                  : 'Invalid'}
                              </td>
                              <td className={`py-2 px-3 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                {r.normalized?.departmentCode || 'POLICE'}
                              </td>
                              <td className={`py-2 px-3 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                {r.normalized?.type || 'Fixed'}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {(r.errors?.length > 0 || r.warnings?.length > 0) && (
                                  <span className={`text-[11px] hover:underline font-semibold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
                                    View Details ({r.errors.length + r.warnings.length})
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detailed Row Diagnostic Drawer (shows when clicking a row) */}
              {selectedRow && (
                <div className={`p-4 rounded-xl border space-y-2 animate-in slide-in-from-top-2 ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900 shadow-sm' : 'bg-slate-900/90 border-white/15 text-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-xs ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        Row {selectedRow.rowNumber} Diagnostics:
                      </span>
                      <span className={`font-mono text-xs font-bold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
                        {selectedRow.normalized?.cameraId || selectedRow.data?.cameraId || 'N/A'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRow(null)}
                      className={`text-xs cursor-pointer ${isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Close Details ✕
                    </button>
                  </div>

                  {selectedRow.errors?.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {selectedRow.errors.map((err, i) => (
                        <div key={i} className={`p-2.5 rounded-lg border text-xs ${
                          isLight ? 'bg-rose-50 border-rose-200 text-rose-950' : 'bg-rose-500/10 border-rose-500/20 text-slate-200'
                        }`}>
                          <p className={`font-bold ${isLight ? 'text-rose-700' : 'text-rose-400'}`}>❌ Problem in [{err.field}]: {err.problem}</p>
                          <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            Value received: <span className={`font-mono font-semibold ${isLight ? 'text-rose-800' : 'text-rose-300'}`}>"{String(err.value)}"</span>
                          </p>
                          {err.suggestion && (
                            <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>
                              💡 Suggested Correction: {err.suggestion}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedRow.warnings?.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {selectedRow.warnings.map((warn, i) => (
                        <div key={i} className={`p-2.5 rounded-lg border text-xs ${
                          isLight ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-amber-500/10 border-amber-500/20 text-slate-200'
                        }`}>
                          <p className={`font-bold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>⚠ Warning on [{warn.field}]: {warn.problem}</p>
                          <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            Value received: <span className={`font-mono font-semibold ${isLight ? 'text-amber-800' : 'text-amber-300'}`}>"{String(warn.value)}"</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 3: COMPLETION & PERSISTENCE SUMMARY
             ══════════════════════════════════════════════════════════════════ */}
          {step === 'complete' && importResult && (
            <div className="py-8 max-w-lg mx-auto text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className={`text-xl font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  Bulk Camera Import Complete
                </h3>
                <p className={`text-xs mt-1 font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Import Reference ID: {importResult.importId}
                </p>
              </div>

              <div className={`grid grid-cols-3 gap-3 p-4 rounded-xl text-left border ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/8'
              }`}>
                <div>
                  <span className={`text-[10px] uppercase font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Total Rows</span>
                  <p className={`text-lg font-black font-mono ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{importResult.totalRows}</p>
                </div>
                <div>
                  <span className={`text-[10px] uppercase font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Successfully Saved</span>
                  <p className={`text-lg font-black font-mono ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{importResult.importedCount}</p>
                </div>
                <div>
                  <span className={`text-[10px] uppercase font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Skipped Records</span>
                  <p className={`text-lg font-black font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{importResult.skippedCount}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleDownloadReport(importResult.importId)}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold w-full sm:w-auto transition-all cursor-pointer ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200' : 'bg-white/10 hover:bg-white/15 text-slate-200'
                  }`}
                >
                  <FileText className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                  Download Audit Report
                </button>

                <button
                  type="button"
                  onClick={() => { handleClose(); navigate('/gis'); }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold w-full sm:w-auto transition-all shadow-lg shadow-blue-600/25 cursor-pointer"
                >
                  <MapPin className="w-4 h-4" />
                  View on GIS Map
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className={`px-6 py-4 border-t flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-[#141929]/70 border-white/10'
        }`}>
          {step === 'upload' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                Cancel
              </button>
              <span className={`text-[11px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                Awaiting file upload...
              </span>
            </>
          )}

          {step === 'preview' && sessionData && (
            <>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  Discard & Re-upload
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadReport(sessionData.importId)}
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isLight ? 'text-slate-700 hover:bg-slate-200/60' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <FileText className={`w-3.5 h-3.5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                  Export Validation Report
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                  {sessionData.summary?.valid || 0} valid cameras ready
                </span>
                <button
                  type="button"
                  disabled={commitMutation.isPending || (sessionData.summary?.valid === 0 && sessionData.summary?.warnings === 0)}
                  onClick={() => setIsConfirmOpen(true)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {commitMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Save Valid Cameras
                </button>
              </div>
            </>
          )}

          {step === 'complete' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Close Registry Import
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CONFIRMATION DIALOG MODAL (Step 4 Mandatory Confirmation)
         ══════════════════════════════════════════════════════════════════ */}
      {isConfirmOpen && sessionData && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl border ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#141929] border-white/15 text-slate-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  Confirm Bulk Camera Ingestion
                </h3>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Official Gujarat Surveillance Registry
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border space-y-2 text-xs ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/40 border-white/5 text-slate-300'
            }`}>
              <p>
                You are about to permanently onboard{' '}
                <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                  {sessionData.summary?.valid + sessionData.summary?.warnings} valid cameras
                </span>{' '}
                into the official state registry.
              </p>
              <div className={`pt-2 border-t space-y-1 text-[11px] ${
                isLight ? 'border-slate-200 text-slate-600' : 'border-white/5 text-slate-400'
              }`}>
                <p>• {sessionData.summary?.errors || 0} invalid rows will NOT be imported.</p>
                <p>• {sessionData.summary?.duplicates || 0} duplicate IDs will be excluded.</p>
                <p>• An immutable System Audit Log record will be created.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                Review More
              </button>
              <button
                type="button"
                disabled={commitMutation.isPending}
                onClick={() => commitMutation.mutate(sessionData.importId)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                {commitMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm & Save to Registry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

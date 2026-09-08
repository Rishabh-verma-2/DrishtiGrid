import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { crowdAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import {
  Users, UploadCloud, Sliders, RefreshCw, Sparkles, Image as ImageIcon,
  CheckCircle2, AlertTriangle, Info, X, ChevronRight, FileCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

import CrowdMetricsCards from '../components/crowd/CrowdMetricsCards';
import CrowdFrameViewer from '../components/crowd/CrowdFrameViewer';
import PersonDetectionsList from '../components/crowd/PersonDetectionsList';
import ZoneDensityGrid from '../components/crowd/ZoneDensityGrid';

export default function CrowdDetectionPage() {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  // State
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [gridConfig, setGridConfig] = useState('3x4'); // '3x4' | '4x4'
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Mutation to analyze uploaded image
  const analyzeMutation = useMutation({
    mutationFn: async ({ file }) => {
      const [rowsStr, colsStr] = gridConfig.split('x');
      const res = await crowdAPI.analyzeFrame(file, 'image-upload', {
        confThreshold: 0.03, // Ultra-sensitive: include every person regardless of confidence
        gridRows: parseInt(rowsStr, 10) || 3,
        gridCols: parseInt(colsStr, 10) || 4,
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.data) {
        setAnalysisResult(data.data);
        const count = data.data.total_count ?? data.data.detected_count ?? 0;
        const level = data.data.crowd_level;
        toast.success(`Predicted ${count} ${count === 1 ? 'person' : 'people'} (${level} density)`, {
          icon: '👥',
        });
      } else {
        toast.error('Unexpected analysis response structure');
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || err.message || 'People counting analysis failed');
    },
  });

  const handleFileChange = (file) => {
    if (!file) return;
    const isImg = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|webp|bmp|tiff|gif)$/i.test(file.name || '');
    if (!isImg) {
      toast.error('Please upload a valid image file (JPEG, PNG, WebP)');
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setFilePreview(e.target.result);
    reader.readAsDataURL(file);

    // Run people detection analysis immediately
    analyzeMutation.mutate({ file });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // One-click real crowd photo sample loader
  const handleLoadSamplePhoto = async () => {
    try {
      const res = await fetch('/sample_crowd.jpg');
      if (!res.ok) throw new Error('Sample file not found');
      const blob = await res.blob();
      const file = new File([blob], 'sample_pedestrian_crowd.jpg', { type: 'image/jpeg' });
      handleFileChange(file);
      toast.success('Loaded sample crowd photo');
    } catch (e) {
      toast.error('Could not load sample image: ' + e.message);
    }
  };

  const handleClearImage = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setAnalysisResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [gridRows, gridCols] = gridConfig.split('x').map((n) => parseInt(n, 10));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span
              className={`text-xs font-mono font-bold uppercase tracking-wider ${
                isLight ? 'text-blue-700' : 'text-blue-400'
              }`}
            >
              Gujarat Police Netram Vision • AI People Counter
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs font-mono text-slate-400">YOLOv8 Single-Pass</span>
          </div>
          <h1 className={`text-2xl md:text-3xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Crowd & People Detection
          </h1>
          <p className={`text-xs md:text-sm mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Upload any image to accurately detect, count, and locate individuals with direct YOLOv8 person vision.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSamplePhoto}
            disabled={analyzeMutation.isPending}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Try Sample Photo</span>
          </button>

          {selectedFile && (
            <button
              type="button"
              onClick={() => analyzeMutation.mutate({ file: selectedFile })}
              disabled={analyzeMutation.isPending}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all ${
                isLight
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
              <span>{analyzeMutation.isPending ? 'Counting People...' : 'Re-count'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Control Bar: Upload Status & Sensitivity Sliders ─── */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isLight
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-[#141929] border-white/5 shadow-md'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* File Selected Status or Quick Upload Button */}
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                selectedFile
                  ? isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400'
                  : isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {selectedFile ? <FileCheck className="w-5 h-5" /> : <UploadCloud className="w-5 h-5" />}
            </div>
            <div>
              <p className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {selectedFile ? selectedFile.name : 'No image loaded'}
              </p>
              <p className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {selectedFile
                  ? `${(selectedFile.size / 1024).toFixed(1)} KB • Ready for detection`
                  : 'Upload an image below or use sample photo'}
              </p>
            </div>
            {selectedFile && (
              <button
                type="button"
                onClick={handleClearImage}
                className="p-1 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all ml-1"
                title="Clear image"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Mode Indicator & Grid Dimension Controls */}
          <div className="flex items-center gap-3.5 flex-wrap">
            {/* Ultra-sensitive mode indicator */}
            <span
              className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                isLight
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}
              title="All visible people included"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              All People Included
            </span>

            {/* Grid Dimensions */}
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold mr-1 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                Sector Grid:
              </span>
              {['3x4', '4x4'].map((grid) => (
                <button
                  key={grid}
                  type="button"
                  onClick={() => {
                    setGridConfig(grid);
                    if (selectedFile) {
                      analyzeMutation.mutate({ file: selectedFile });
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    gridConfig === grid
                      ? 'bg-blue-600 text-white shadow-xs'
                      : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
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

      {/* ─── Main Two-Column Workstation ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Image Viewer & Upload Dropzone (7 of 12 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <CrowdFrameViewer
            annotatedSrc={analysisResult?.annotated_image_b64}
            rawSrc={filePreview}
            cameraName={selectedFile?.name || 'Uploaded Image'}
            cameraId="image-upload"
            crowdLevel={analysisResult?.crowd_level || 'LOW'}
            timingMs={analysisResult?.processing_time_ms ?? analysisResult?.timing_ms}
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
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
              isDragOver
                ? 'border-blue-500 bg-blue-500/10'
                : isLight
                ? 'border-slate-300 bg-white hover:border-blue-500 hover:bg-blue-50/20 shadow-xs'
                : 'border-white/15 bg-[#141929]/60 hover:border-blue-500/50 hover:bg-[#141929]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
              }}
            />
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'
                }`}
              >
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="text-center sm:text-left">
                <p className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {selectedFile ? `Replace Image (${selectedFile.name})` : 'Upload Image to Count People'}
                </p>
                <p className={`text-xs ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                  Drag and drop JPG, PNG or WebP here, or click to browse from device
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Itemized Person Detections & Sector Matrix (5 of 12 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <PersonDetectionsList
            detections={analysisResult?.person_detections || []}
            totalCount={analysisResult?.total_count || 0}
            isLight={isLight}
          />

          <ZoneDensityGrid
            zones={analysisResult?.zones || []}
            gridRows={gridRows}
            gridCols={gridCols}
            isLight={isLight}
          />
        </div>
      </div>

      {/* ─── Bottom Info Bar ─── */}
      <div
        className={`p-4 rounded-2xl border flex items-start gap-3 text-xs ${
          isLight
            ? 'bg-blue-50/90 border-blue-200 text-blue-950 shadow-2xs'
            : 'bg-blue-950/20 border-blue-500/20 text-blue-200'
        }`}
      >
        <Info className={`w-4 h-4 shrink-0 mt-0.5 ${isLight ? 'text-blue-700' : 'text-blue-400'}`} />
        <div className="space-y-1 leading-relaxed">
          <p className={`font-bold ${isLight ? 'text-blue-950' : 'text-white'}`}>How the AI People Counting Works:</p>
          <p className={isLight ? 'text-blue-900/90 font-medium' : 'opacity-90'}>
            DrishtiGrid uses a real-time YOLOv8 neural network trained on COCO person classes. Each person detected
            in the image is assigned an individual ID, bounding box coordinates, and confidence score. The total count
            reflects the exact number of people detected above your selected confidence threshold, without artificial
            multipliers or synthetic fallbacks.
          </p>
        </div>
      </div>
    </div>
  );
}

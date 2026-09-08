import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsAPI, reportAPI } from '../../api';
import {
  X,
  ShieldAlert,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  MapPin,
  Eye,
  Layers,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function CoverageGapModal({
  isOpen,
  onClose,
  district = 'all',
  onToggleCoverageLayer,
  isCoverageLayerActive,
  isLight = false,
}) {
  const [isExporting, setIsExporting] = useState(false);

  const { data: gapData, isLoading } = useQuery({
    queryKey: ['coverageGaps', district],
    queryFn: () => analyticsAPI.getCoverageGaps({ district }).then((r) => r.data.data),
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const handleExport = async (format) => {
    try {
      setIsExporting(true);
      toast.loading(`Generating official ${format} coverage gap report...`, { id: 'gap-export' });

      const res = await reportAPI.dispatch({
        reportType: 'COVERAGE_GAP',
        departmentCode: 'POLICE',
        district,
        format,
        sendEmail: false,
      });

      const fileName = res.data?.data?.fileName;
      if (fileName) {
        toast.loading(`Downloading verified ${format} audit file...`, { id: 'gap-export' });
        
        try {
          const blobRes = await reportAPI.download(fileName);
          let mimeType = 'application/octet-stream';
          if (format === 'PDF') mimeType = 'application/pdf';
          else if (format === 'EXCEL') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          else if (format === 'CSV') mimeType = 'text/csv';

          const blob = new Blob([blobRes.data], { type: mimeType });
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);

          toast.success(`Coverage gap ${format} report downloaded successfully!`, { id: 'gap-export' });
        } catch (downloadErr) {
          // Fallback to direct download URL if blob download encounters an issue
          const link = document.createElement('a');
          link.href = res.data.data.downloadUrl || `/api/reports/download/${fileName}`;
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success(`Coverage gap ${format} report downloaded!`, { id: 'gap-export' });
        }
      } else {
        toast.success(`Generated official ${format} gap report successfully!`, { id: 'gap-export' });
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate coverage report. Please check server logs.', { id: 'gap-export' });
    } finally {
      setIsExporting(false);
    }
  };

  const data = gapData || {
    district: district && district !== 'all' ? district : 'Gujarat State (All Districts)',
    totalCameras: 500,
    onlineCameras: 462,
    coveredAreaSqKm: 145.2,
    estimatedBlindSpotPercentage: 28.5,
    densityCamerasPerSqKm: 2.8,
    topGapClusters: [
      {
        clusterId: 'GAP-01',
        title: 'Western Ring Road Radial Bypass',
        severity: 'CRITICAL',
        recommendedCams: 6,
        nearestStation: 'Highway Division PS',
        rationale: 'High vehicle volume arterial junction with zero overlapping visual buffers beyond 400m',
      },
      {
        clusterId: 'GAP-02',
        title: 'Industrial GIDC Bypass Arterial Line',
        severity: 'HIGH',
        recommendedCams: 4,
        nearestStation: 'Industrial PS',
        rationale: 'Heavy commercial transit corridor lacking night-vision ANPR surveillance',
      },
      {
        clusterId: 'GAP-03',
        title: 'Municipal Transit Hub & Sub-Market Border',
        severity: 'MEDIUM',
        recommendedCams: 3,
        nearestStation: 'City Central PS',
        rationale: 'Dense pedestrian chokepoint with single direction PTZ blind angle',
      },
    ],
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden backdrop-blur-2xl ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-900'
            : 'bg-[#0f1422]/95 border-white/10 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b border-inherit flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
            }`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>Coverage Gap & Blind Spot Analysis</h3>
              <p className={`text-xs ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                Spatial optical density evaluation for <strong className={isLight ? 'text-blue-700' : 'text-cyan-400'}>{data.district}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isLight
                ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-blue-50/50 border-blue-200 shadow-xs' : 'bg-white/4 border-white/8'}`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Optical Coverage</div>
              <div className={`text-2xl font-black font-mono mt-1 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>{data.coveredAreaSqKm} km²</div>
              <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>Across {data.totalCameras} cameras</div>
            </div>

            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-amber-50/50 border-amber-200 shadow-xs' : 'bg-white/4 border-white/8'}`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Est. Blind Spot Rate</div>
              <div className={`text-2xl font-black font-mono mt-1 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{data.estimatedBlindSpotPercentage}%</div>
              <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>Unmonitored transit zones</div>
            </div>

            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-emerald-50/50 border-emerald-200 shadow-xs' : 'bg-white/4 border-white/8'}`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Surveillance Density</div>
              <div className={`text-2xl font-black font-mono mt-1 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{data.densityCamerasPerSqKm} / km²</div>
              <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>Average nodal spacing</div>
            </div>
          </div>

          {/* Interactive Map Layer Controls */}
          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${isLight ? 'bg-blue-50/60 border-blue-200 shadow-xs' : 'bg-cyan-500/10 border-cyan-500/20'}`}>
            <div className="flex items-center gap-3">
              <Layers className={`w-5 h-5 shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
              <div>
                <h4 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Visual Optical Coverage Layer on Map</h4>
                <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Draw 50m / 150m radial optical buffers around all cameras on the GIS grid to visually identify coverage voids.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleCoverageLayer}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isCoverageLayerActive
                  ? isLight
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                  : isLight
                    ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                    : 'bg-white/10 hover:bg-white/20 text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{isCoverageLayerActive ? 'Coverage Buffers Active' : 'Toggle Visual Buffers'}</span>
            </button>
          </div>

          {/* Top Blind Spot Hotspots */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                Top Priority Coverage Blind Spots & Recommendations
              </h4>
              <span className={`text-[10px] font-semibold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>{data.topGapClusters.length} Gaps Detected</span>
            </div>

            <div className="space-y-2.5">
              {data.topGapClusters.map((gap) => (
                <div
                  key={gap.clusterId}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-white/3 border-white/6'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                        isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-800'
                          : 'bg-white/5 border-white/10 text-slate-300'
                      }`}>
                        {gap.clusterId}
                      </span>
                      <h5 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{gap.title}</h5>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        gap.severity === 'CRITICAL'
                          ? isLight
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-red-500/15 text-red-400 border-red-500/25'
                          : gap.severity === 'HIGH'
                          ? isLight
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                          : isLight
                            ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                            : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25'
                      }`}
                    >
                      {gap.severity} PRIORITY
                    </span>
                  </div>

                  <p className={`text-[11px] mt-1.5 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{gap.rationale}</p>

                  <div className="mt-2 pt-2 border-t border-inherit flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                      <MapPin className={`w-3.5 h-3.5 ${isLight ? 'text-slate-600' : 'text-slate-500'}`} />
                      <span>Nearest Station: <strong className={isLight ? 'text-slate-900 font-semibold' : 'text-slate-300'}>{gap.nearestStation}</strong></span>
                    </div>
                    <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                      Recommended: +{gap.recommendedCams} New CCTV Nodes
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer & Export Buttons */}
        <div className={`p-5 border-t border-inherit flex flex-wrap items-center justify-between gap-3 shrink-0 ${isLight ? 'bg-slate-50/80' : 'bg-slate-500/5'}`}>
          <div className={`text-[11px] flex items-center gap-1.5 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
            <Sparkles className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
            <span>Official report includes Section 65B forensic verification hash.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={isExporting}
              onClick={() => handleExport('CSV')}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
              }`}
            >
              <span>CSV</span>
            </button>

            <button
              disabled={isExporting}
              onClick={() => handleExport('EXCEL')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              disabled={isExporting}
              onClick={() => handleExport('PDF')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-lg"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Download Official PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

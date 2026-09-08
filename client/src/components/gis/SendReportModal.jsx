import React, { useState } from 'react';
import { reportAPI } from '../../api';
import {
  X,
  Send,
  Shield,
  ShieldCheck,
  FileText,
  Mail,
  CheckCircle2,
  AlertCircle,
  Download,
  Calendar,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SendReportModal({
  isOpen,
  onClose,
  targetCamera = null,
  targetDistrict = 'all',
  departments = [],
  isLight = false,
}) {
  const [departmentCode, setDepartmentCode] = useState(
    targetCamera?.departmentCode || targetCamera?.departmentName?.toUpperCase() || 'POLICE'
  );
  const [recipientEmail, setRecipientEmail] = useState('');
  const [timeframe, setTimeframe] = useState('30d');
  const [format, setFormat] = useState('PDF');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // Sync recipient email when department or camera changes
  React.useEffect(() => {
    const dept = departments.find((d) => d.code === departmentCode) || {
      contactEmail: 'controlroom.police@gujarat.gov.in',
    };
    setRecipientEmail(dept.contactEmail || 'controlroom.police@gujarat.gov.in');
  }, [departmentCode, departments]);

  if (!isOpen) return null;

  const currentDept = departments.find((d) => d.code === departmentCode) || {
    name: `${departmentCode} Surveillance Division`,
    nodalOfficer: {
      name: 'Shri R. K. Patel, IPS',
      designation: 'Superintendent of Police (Command & Control)',
    },
    contactEmail: 'controlroom.police@gujarat.gov.in',
  };

  const handleSend = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      toast.loading('Compiling report and authenticating departmental dispatch...', { id: 'report-dispatch' });

      const res = await reportAPI.dispatch({
        reportType: targetCamera ? 'HEALTH_AUDIT' : 'COMBINED_DEPARTMENT_AUDIT',
        departmentCode,
        district: targetCamera?.district || targetDistrict || 'all',
        timeframe,
        format,
        sendEmail: true,
        overrideRecipient: recipientEmail,
      });

      const data = res.data?.data;
      setResult(data);
      toast.success(
        res.data?.message || 'Report generated and dispatched to department nodal officer!',
        { id: 'report-dispatch' }
      );
    } catch (err) {
      console.error(err);
      toast.error('Error dispatching departmental report. Check server logs.', { id: 'report-dispatch' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!result?.fileName) return;
    try {
      toast.loading('Downloading verified audit report...', { id: 'report-download' });
      const blobRes = await reportAPI.download(result.fileName);
      let mimeType = 'application/octet-stream';
      if (format === 'PDF') mimeType = 'application/pdf';
      else if (format === 'EXCEL') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (format === 'CSV') mimeType = 'text/csv';

      const blob = new Blob([blobRes.data], { type: mimeType });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', result.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success('Report downloaded successfully!', { id: 'report-download' });
    } catch (err) {
      const link = document.createElement('a');
      link.href = result.downloadUrl || `/api/reports/download/${result.fileName}`;
      link.setAttribute('download', result.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Report downloaded!', { id: 'report-download' });
    }
  };

  const handleReset = () => {
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden backdrop-blur-2xl transition-all ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-900'
            : 'bg-[#0f1422]/95 border-white/10 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b border-inherit flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Request Official Audit Report</h3>
              <p className="text-[11px] text-slate-400">Departmental Compliance & Health Dispatch System</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {result ? (
          /* Success Screen */
          <div className="p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-base font-bold">Official Report Dispatched!</h4>
              <p className="text-xs text-slate-400">
                Transmitted to <strong className="text-slate-200">{result.recipient}</strong>
              </p>
            </div>

            <div className={`p-4 rounded-2xl border space-y-2 text-xs font-mono ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/4 border-white/8'}`}>
              <div className="flex justify-between">
                <span className="text-slate-400">Dispatch Status:</span>
                <span className="text-emerald-400 font-bold">{result.deliveryStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">File Generated:</span>
                <span className="text-slate-300 truncate max-w-[240px]">{result.fileName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Forensic SHA-256:</span>
                <span className="text-cyan-400 text-[10px] truncate max-w-[220px]">{result.hashSha256}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Report Now</span>
              </button>

              <button
                onClick={handleReset}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSend} className="p-5 space-y-4">
            {/* Target Context Banner */}
            <div className={`p-3 rounded-2xl border text-xs ${isLight ? 'bg-slate-50 border-slate-200 shadow-xs' : 'bg-white/4 border-white/8'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Target Entity:</span>
                <span className={`font-mono font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                  {targetCamera ? `Camera: ${targetCamera.cameraId}` : `District Sector: ${targetDistrict}`}
                </span>
              </div>
              <div className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                {targetCamera ? targetCamera.name || targetCamera.cameraName : `All Monitored Units in ${targetDistrict}`}
              </div>
            </div>

            {/* Handling Department Selector */}
            <div className="space-y-1.5">
              <label className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                Handling Department Authority
              </label>
              <select
                value={departmentCode}
                onChange={(e) => setDepartmentCode(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-xs outline-none cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-white/5 border-white/10 text-slate-200'
                }`}
              >
                <option value="POLICE">Gujarat State Police Surveillance Branch</option>
                <option value="TRAFFIC">Gujarat Traffic Police & Highway Patrol</option>
                <option value="MUNICIPAL">Urban Development & Smart City Mission</option>
                <option value="TRANSPORT">Gujarat Transport Department (RTO)</option>
              </select>
            </div>

            {/* Nodal Officer Info Card */}
            <div className={`p-3 rounded-xl border text-xs space-y-1 ${isLight ? 'bg-blue-50/70 border-blue-200 text-blue-950 shadow-xs' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-200'}`}>
              <div className="flex items-center gap-1.5 font-bold">
                <Shield className={`w-3.5 h-3.5 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
                <span>Nodal Officer: {currentDept.nodalOfficer?.name || 'Superintendent of Police'}</span>
              </div>
              <p className={`text-[11px] ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                Designation: {currentDept.nodalOfficer?.designation || 'Command & Control In-charge'}
              </p>
            </div>

            {/* Recipient Official Email */}
            <div className="space-y-1.5">
              <label className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                Recipient Official Email Address
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className={`w-full pl-8 pr-3 py-2 rounded-xl border text-xs outline-none font-mono ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-white/5 border-white/10 text-slate-200'
                  }`}
                />
              </div>
            </div>

            {/* Timeframe & Format Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                  Evaluation Window
                </label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className={`w-full p-2 rounded-xl border text-xs outline-none cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-white/5 border-white/10 text-slate-200'
                  }`}
                >
                  <option value="24h">Past 24 Hours</option>
                  <option value="7d">Past 7 Days</option>
                  <option value="30d">Past 30 Days</option>
                  <option value="90d">Quarterly (90 Days)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                  Report Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className={`w-full p-2 rounded-xl border text-xs outline-none cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-white/5 border-white/10 text-slate-200'
                  }`}
                >
                  <option value="PDF">Official PDF Document</option>
                  <option value="EXCEL">Excel Spreadsheet (.xlsx)</option>
                  <option value="CSV">Tabular CSV File</option>
                </select>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Authenticating & Dispatching...' : 'Dispatch Report to Department'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

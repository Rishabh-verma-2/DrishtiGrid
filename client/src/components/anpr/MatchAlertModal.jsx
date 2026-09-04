import { AlertTriangle, ShieldAlert, CheckCircle, ExternalLink, X, Car, Calendar, User, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../../store/themeStore';

export default function MatchAlertModal({ match, onClose, onAcknowledge }) {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  if (!match) return null;

  const rec = match.matched_record || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.35)] overflow-hidden flex flex-col border-2 border-red-500 transition-colors ${
          isLight ? 'bg-white text-slate-900' : 'bg-[#0f1422] text-slate-100'
        }`}
      >
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-red-700 via-red-600 to-rose-700 px-6 py-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center text-white animate-bounce">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest bg-white/20 text-white px-2 py-0.5 rounded">
                  LAW ENFORCEMENT INTERCEPTION ALERT
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                WATCHLIST MATCH CONFIRMED: {rec.category || 'SUSPECT'} VEHICLE
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plate Spotlight Banner */}
        <div
          className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141a2e] border-white/10'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="plate-pill shadow-lg border-2 border-slate-900 scale-110">
              <span className="plate-ind">IND</span>
              <span className="plate-text">{match.raw_ocr || match.normalized_plate || rec.plate_number}</span>
            </div>
            <div>
              <span
                className={`text-xs font-black uppercase px-2.5 py-1 rounded-full border ${
                  rec.priority === 'HIGH'
                    ? 'bg-red-500/20 text-red-500 border-red-500/40 animate-pulse'
                    : 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                }`}
              >
                {rec.priority || 'HIGH'} PRIORITY
              </span>
              <p className={`text-[11px] mt-1 font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Record ID: {rec.recordId} · Match Type: {match.match_type || 'EXACT_MATCH'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className={`text-[11px] uppercase tracking-wider block font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Confidence
            </span>
            <span className="text-base font-black text-emerald-500">
              {Math.round((match.overall_confidence || 0.95) * 100)}%
            </span>
          </div>
        </div>

        {/* Evidence & Details Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
          {/* Visual Crops */}
          {(match.original_crop || match.enhanced_crop) && (
            <div>
              <h4 className={`text-xs font-black uppercase tracking-wider mb-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Optical Evidence Captures
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {match.original_crop && (
                  <div className={`rounded-xl p-2.5 text-center border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/60 border-white/10'}`}>
                    <p className={`text-[10px] font-bold mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>RAW PLATE CROP</p>
                    <img
                      src={match.original_crop.startsWith('data:') ? match.original_crop : `data:image/jpeg;base64,${match.original_crop}`}
                      alt="Raw Plate"
                      className="max-h-20 mx-auto object-contain rounded"
                    />
                  </div>
                )}
                {match.enhanced_crop && (
                  <div className={`rounded-xl p-2.5 text-center border ${isLight ? 'bg-blue-50/50 border-blue-200' : 'bg-black/60 border-blue-500/30'}`}>
                    <p className="text-[10px] text-blue-600 font-bold mb-1">NEURAL ENHANCED (Real-ESRGAN)</p>
                    <img
                      src={match.enhanced_crop.startsWith('data:') ? match.enhanced_crop : `data:image/jpeg;base64,${match.enhanced_crop}`}
                      alt="Enhanced Plate"
                      className="max-h-20 mx-auto object-contain rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Watchlist Record Details */}
          <div className={`rounded-xl p-4 border space-y-2.5 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/4 border-white/7'}`}>
            <h4 className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              Government Hotlist Dossier
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className={`font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Registered Category:</span>
                <p className={`font-extrabold mt-0.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  {rec.category || 'N/A'}
                </p>
              </div>
              <div>
                <span className={`font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Case / FIR Ref:</span>
                <p className={`font-mono font-bold mt-0.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  {rec.reference_id || 'FIR-PENDING-REG'}
                </p>
              </div>
              <div>
                <span className={`font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Registered Owner:</span>
                <p className={`font-semibold mt-0.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  {rec.ownerName || 'Unknown / Flagged'}
                </p>
              </div>
              <div>
                <span className={`font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Vehicle Model / Spec:</span>
                <p className={`font-semibold mt-0.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  {rec.vehicleModel || 'N/A'}
                </p>
              </div>
            </div>

            {rec.description && (
              <div className={`pt-2 border-t ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
                <span className={`text-xs font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Notice &amp; Instructions:</span>
                <p className={`text-xs mt-1 p-2.5 rounded-lg border ${
                  isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/30 border-white/5 text-slate-300'
                }`}>
                  {rec.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className={`px-6 py-4 border-t flex flex-wrap items-center justify-between gap-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0b0e18] border-white/10'
          }`}
        >
          <button
            onClick={() => {
              onClose();
              navigate('/alerts');
            }}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              isLight ? 'text-slate-600 hover:text-blue-600' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Full Alert Center
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isLight
                  ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                if (onAcknowledge) onAcknowledge(match);
                onClose();
              }}
              className="px-5 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all active:scale-95"
            >
              <CheckCircle className="w-4 h-4" />
              Acknowledge &amp; Dispatch Unit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

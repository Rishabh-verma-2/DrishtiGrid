import React from "react";
import { AlertTriangleIcon, BellIcon, XIcon } from "./Icons";

export default function MatchAlertPopup({ matches = [], onClose, onViewAlerts }) {
  if (!matches || matches.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl border border-red-500 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Urgent Emergency Header */}
        <div className="bg-red-900 text-white px-6 py-4 flex items-center justify-between border-b border-red-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-800/80 border border-red-700 flex items-center justify-center shrink-0">
              <AlertTriangleIcon className="w-5 h-5 text-red-200" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-wider uppercase">
                SECURITY ALERT — WATCHLIST MATCH DETECTED
              </h2>
              <p className="text-xs text-red-200">
                {matches.length} matching license plate {matches.length === 1 ? "record" : "records"} identified in surveillance pipeline.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-red-300 hover:text-white p-1 transition-colors"
            onClick={onClose}
            title="Dismiss Alert"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Matches List */}
        <div className="p-6 overflow-y-auto space-y-6">
          {matches.map((match, idx) => {
            const rec = match.matched_record || {};
            return (
              <div
                key={match.plate_id || idx}
                className="bg-red-50/70 border-2 border-red-400 rounded-xl p-5 shadow-sm space-y-4"
              >
                {/* Match Header Badge */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded shadow">
                      MATCH #{idx + 1}
                    </span>
                    <div className="plate-pill-lg shadow">
                      <span className="plate-ind-lg">IND</span>
                      <span className="plate-text-lg">
                        {match.normalized_plate || match.raw_ocr || rec.plate_number}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="bg-red-600 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider shadow">
                      {rec.category || "WATCHLIST"}
                    </span>
                    <span className="bg-red-100 border border-red-300 text-red-900 text-xs font-black px-2.5 py-1 rounded uppercase">
                      {rec.priority || "HIGH"} PRIORITY
                    </span>
                  </div>
                </div>

                {/* Match Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/80 p-3 rounded-lg border border-red-200 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block">Record ID</span>
                    <span className="font-mono font-black text-slate-900">{rec.recordId || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block">Reference ID</span>
                    <span className="font-mono font-bold text-slate-800">{rec.reference_id || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block">OCR Confidence</span>
                    <span className="font-black text-emerald-700">
                      {Math.round((match.ocr_confidence || 0) * 1000) / 10}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block">Detection Conf.</span>
                    <span className="font-black text-slate-800">
                      {Math.round((match.detection_confidence || 0) * 1000) / 10}%
                    </span>
                  </div>
                </div>

                {rec.description && (
                  <div className="text-xs text-red-950 bg-red-100/50 p-2.5 rounded border border-red-200">
                    <strong className="font-bold">Record Description / Notes: </strong>
                    <span>{rec.description}</span>
                  </div>
                )}

                {/* Forensic Evidence Showcase */}
                <div>
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                    Visual Verification Evidence
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Source scene */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">
                        Source Scene
                      </span>
                      <div className="h-24 bg-slate-950 rounded-lg border border-slate-300 flex items-center justify-center overflow-hidden p-1">
                        {match.original_image ? (
                          <img
                            src={match.original_image}
                            alt="Source Scene"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-slate-500 text-[10px]">Not available</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">
                        Original Detected Crop
                      </span>
                      <div className="h-24 bg-slate-950 rounded-lg border border-slate-300 flex items-center justify-center overflow-hidden p-1">
                        {match.original_crop ? (
                          <img
                            src={
                              match.original_crop.startsWith("data:")
                                ? match.original_crop
                                : `data:image/jpeg;base64,${match.original_crop}`
                            }
                            alt="Original Crop"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-slate-500 text-[10px]">No crop</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">
                        Enhanced Super-Resolved Crop
                      </span>
                      <div className="h-24 bg-slate-950 rounded-lg border border-slate-300 flex items-center justify-center overflow-hidden p-1">
                        {match.enhanced_crop ? (
                          <img
                            src={
                              match.enhanced_crop.startsWith("data:")
                                ? match.enhanced_crop
                                : `data:image/jpeg;base64,${match.enhanced_crop}`
                            }
                            alt="Enhanced Crop"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-slate-500 text-[10px]">No crop</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors shadow-sm"
            onClick={onClose}
          >
            Review Images &amp; Details
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
              onClick={() => {
                onClose();
                if (onViewAlerts) onViewAlerts();
              }}
            >
              <BellIcon className="w-4 h-4 text-white" />
              <span>VIEW IN ALERT HISTORY</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { AlertTriangleIcon, XIcon } from "./Icons";

const PRIORITY_CLASSES = {
  HIGH: "bg-red-100 text-red-800 border-red-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-slate-100 text-slate-700 border-slate-300",
};

const STATUS_CLASSES = {
  NEW: "bg-red-600 text-white",
  ACKNOWLEDGED: "bg-amber-500 text-white",
  RESOLVED: "bg-emerald-600 text-white",
};

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wide w-40 shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export default function AlertDetailModal({ alert, onClose, onUpdateStatus }) {
  if (!alert) return null;

  const canAcknowledge = alert.status === "NEW";
  const canResolve = alert.status === "NEW" || alert.status === "ACKNOWLEDGED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-red-900 px-5 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-red-800 border border-red-700 flex items-center justify-center text-white shrink-0">
              <AlertTriangleIcon className="w-4 h-4 text-red-200" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wider uppercase">ALERT INCIDENT REPORT</h2>
              <p className="text-xs text-red-300 mt-0.5 font-mono">Alert ID: {alert.alertId}</p>
            </div>
          </div>
          <button
            type="button"
            className="text-red-300 hover:text-white p-1 transition-colors rounded"
            onClick={onClose}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Status + Priority ribbon */}
        <div className="bg-slate-800 px-5 py-3 flex flex-wrap items-center gap-3">
          <div className="plate-pill">
            <span className="plate-ind">IND</span>
            <span className="plate-text">{alert.detected_plate}</span>
          </div>
          <span className={`text-xs font-extrabold px-2.5 py-1 rounded ${STATUS_CLASSES[alert.status] || "bg-slate-600 text-white"}`}>
            {alert.status}
          </span>
          <span className={`text-xs font-extrabold px-2.5 py-1 rounded border ${PRIORITY_CLASSES[alert.priority] || ""}`}>
            {alert.priority} PRIORITY
          </span>
          <span className="text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1 rounded">
            {alert.category}
          </span>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[70vh] flex flex-col gap-5">
          {/* Evidence Images */}
          <div>
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-3">
              Forensic Evidence
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Source Image</span>
                <div className="bg-black rounded border border-slate-300 h-28 flex items-center justify-center overflow-hidden">
                  {alert.source_image ? (
                    <img
                      src={alert.source_image.startsWith("data:") ? alert.source_image : `data:image/jpeg;base64,${alert.source_image}`}
                      alt="Source"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-slate-500 text-xs">N/A</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Original Crop</span>
                <div className="bg-black rounded border border-slate-300 h-28 flex items-center justify-center overflow-hidden">
                  {alert.original_crop ? (
                    <img
                      src={alert.original_crop.startsWith("data:") ? alert.original_crop : `data:image/jpeg;base64,${alert.original_crop}`}
                      alt="Original Crop"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-slate-500 text-xs">N/A</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Enhanced Crop</span>
                <div className="bg-black rounded border border-slate-300 h-28 flex items-center justify-center overflow-hidden">
                  {alert.enhanced_crop ? (
                    <img
                      src={alert.enhanced_crop.startsWith("data:") ? alert.enhanced_crop : `data:image/jpeg;base64,${alert.enhanced_crop}`}
                      alt="Enhanced Crop"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-slate-500 text-xs">N/A</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div>
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">
              Alert Details
            </h3>
            <InfoRow label="Alert ID" value={alert.alertId} mono />
            <InfoRow label="Matched Record ID" value={alert.matched_record_id} mono />
            <InfoRow label="Detected Plate" value={alert.detected_plate} mono />
            <InfoRow label="Normalized Plate" value={alert.normalized_detected} mono />
            <InfoRow label="Category" value={alert.category} />
            <InfoRow label="Priority" value={alert.priority} />
            <InfoRow label="Status" value={alert.status} />
            <InfoRow label="OCR Confidence" value={alert.ocr_confidence != null ? `${Math.round(alert.ocr_confidence * 1000) / 10}%` : "—"} />
            <InfoRow label="Source Image" value={alert.source_image_name} />
            <InfoRow
              label="Detected At"
              value={alert.detected_at ? new Date(alert.detected_at).toLocaleString() : "—"}
            />
            {alert.acknowledged_at && (
              <InfoRow
                label="Acknowledged At"
                value={new Date(alert.acknowledged_at).toLocaleString()}
              />
            )}
            {alert.resolved_at && (
              <InfoRow
                label="Resolved At"
                value={new Date(alert.resolved_at).toLocaleString()}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex gap-2">
            {canAcknowledge && (
              <button
                type="button"
                className="px-3.5 py-2 text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm"
                onClick={() => onUpdateStatus && onUpdateStatus(alert.alertId, "ACKNOWLEDGED")}
              >
                Acknowledge
              </button>
            )}
            {canResolve && (
              <button
                type="button"
                className="px-3.5 py-2 text-xs font-extrabold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors shadow-sm"
                onClick={() => onUpdateStatus && onUpdateStatus(alert.alertId, "RESOLVED")}
              >
                Mark Resolved
              </button>
            )}
          </div>
          <button
            type="button"
            className="px-4 py-2 text-sm font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

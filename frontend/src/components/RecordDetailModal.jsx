import { XIcon } from "./Icons";

const PRIORITY_CLASSES = {
  HIGH: "bg-red-100 text-red-800 border-red-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-slate-100 text-slate-700 border-slate-300",
};

const STATUS_CLASSES = {
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-300",
  INACTIVE: "bg-slate-200 text-slate-600 border-slate-300",
};

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wide w-36 shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export default function RecordDetailModal({ record, onClose, onEdit }) {
  if (!record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 px-5 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-white tracking-wider uppercase">RECORD DOSSIER</h2>
            <p className="text-xs text-slate-400 mt-0.5">Monitored Plate Record Details</p>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-white p-1 transition-colors rounded"
            onClick={onClose}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Plate Pill Hero */}
        <div className="bg-slate-800 px-5 py-4 flex items-center justify-center">
          <div className="plate-pill text-xl">
            <span className="plate-ind">IND</span>
            <span className="plate-text">{record.plate_number}</span>
          </div>
        </div>

        {/* Details Body */}
        <div className="p-5 flex flex-col gap-1 overflow-y-auto max-h-[60vh]">
          <div className="flex gap-2 flex-wrap mb-3">
            <span
              className={`text-xs font-extrabold px-2.5 py-0.5 rounded border ${
                STATUS_CLASSES[record.status] || "bg-slate-100 text-slate-600 border-slate-300"
              }`}
            >
              {record.status}
            </span>
            <span
              className={`text-xs font-extrabold px-2.5 py-0.5 rounded border ${
                PRIORITY_CLASSES[record.priority] || "bg-slate-100 text-slate-700 border-slate-300"
              }`}
            >
              {record.priority} PRIORITY
            </span>
            <span className="text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded">
              {record.category}
            </span>
          </div>

          <InfoRow label="Record ID" value={record.recordId} mono />
          <InfoRow label="Raw Plate" value={record.plate_number} mono />
          <InfoRow label="Normalized" value={record.normalized_plate_number} mono />
          <InfoRow label="Reference ID" value={record.reference_id} />
          <InfoRow label="Category" value={record.category} />
          <InfoRow label="Priority" value={record.priority} />
          <InfoRow label="Status" value={record.status} />
          <InfoRow label="Total Alerts" value={record.alert_count ?? 0} />
          <InfoRow
            label="Created At"
            value={record.created_at ? new Date(record.created_at).toLocaleString() : "—"}
          />
          <InfoRow
            label="Updated At"
            value={record.updated_at ? new Date(record.updated_at).toLocaleString() : "—"}
          />

          {record.description && (
            <div className="mt-2 pt-3 border-t border-slate-200">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wide">Description</span>
              <p className="text-sm text-slate-700 mt-1 leading-relaxed">{record.description}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 flex justify-end gap-2.5 bg-slate-50">
          <button
            type="button"
            className="px-4 py-2 text-sm font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
            onClick={onClose}
          >
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              className="px-5 py-2 text-sm font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              onClick={() => {
                onEdit(record);
                onClose();
              }}
            >
              Edit Record
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

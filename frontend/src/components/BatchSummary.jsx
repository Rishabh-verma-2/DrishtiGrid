export default function BatchSummary({ summary, onReset }) {
  if (!summary) return null;

  const hasMatches = (summary.matching_plates || 0) > 0;

  return (
    <div
      className={`bg-white border rounded-lg p-5 shadow-sm flex flex-col gap-4 ${
        hasMatches ? "border-t-4 border-t-red-600 border-slate-300" : "border-t-4 border-t-emerald-600 border-slate-300"
      }`}
    >
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-extrabold px-2.5 py-1 rounded tracking-wider ${
              hasMatches
                ? "bg-red-100 text-red-800 border border-red-200 animate-pulse"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            }`}
          >
            {hasMatches ? "🚨 MATCHES IDENTIFIED" : "✓ ANALYSIS COMPLETE"}
          </span>
          <h3 className="text-base font-extrabold text-slate-900">
            Operational Analysis Summary
          </h3>
        </div>
        {onReset && (
          <button
            type="button"
            className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-1.5 rounded transition-colors"
            onClick={onReset}
          >
            New Analysis
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col">
          <span className="text-2xl font-black text-slate-900">
            {summary.images_submitted || 0}
          </span>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            Images Submitted
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col">
          <span className="text-2xl font-black text-slate-900">
            {summary.images_processed || 0}
          </span>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            Images Processed
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col">
          <span className="text-2xl font-black text-slate-900">
            {summary.total_plates_detected || 0}
          </span>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            Plates Detected
          </span>
        </div>

        <div
          className={`rounded p-3 flex flex-col ${
            hasMatches
              ? "bg-red-50 border border-red-300 text-red-950"
              : "bg-slate-50 border border-slate-200"
          }`}
        >
          <span className={`text-2xl font-black ${hasMatches ? "text-red-700 font-extrabold" : "text-slate-900"}`}>
            {summary.matching_plates || 0}
          </span>
          <span className={`text-[11px] font-bold uppercase tracking-wider mt-1 ${hasMatches ? "text-red-700" : "text-slate-500"}`}>
            Matching Plates
          </span>
        </div>

        <div
          className={`rounded p-3 flex flex-col ${
            hasMatches
              ? "bg-red-50 border border-red-300 text-red-950"
              : "bg-slate-50 border border-slate-200"
          }`}
        >
          <span className={`text-2xl font-black ${hasMatches ? "text-red-700 font-extrabold" : "text-slate-900"}`}>
            {summary.alerts_generated || 0}
          </span>
          <span className={`text-[11px] font-bold uppercase tracking-wider mt-1 ${hasMatches ? "text-red-700" : "text-slate-500"}`}>
            Alerts Generated
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col">
          <span className="text-2xl font-black text-slate-900">
            {summary.images_with_no_plates || 0}
          </span>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            No Plates Found
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col">
          <span className="text-2xl font-black text-slate-900">
            {summary.ocr_uncertain || 0}
          </span>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            OCR Uncertain
          </span>
        </div>
      </div>

      {!hasMatches && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-3.5 py-2.5 rounded flex items-center gap-2">
          <span>ℹ️</span>
          <span>No active matching plate records were found in this batch of images.</span>
        </div>
      )}
    </div>
  );
}

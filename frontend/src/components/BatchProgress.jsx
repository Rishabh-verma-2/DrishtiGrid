import { CheckCircleIcon } from "./Icons";

export default function BatchProgress({
  totalImages,
  processedCount,
  currentImageName,
  currentStage = "Running OCR & Enhancement",
  files = [],
}) {
  const percentage = totalImages > 0 ? Math.round((processedCount / totalImages) * 100) : 0;

  return (
    <div className="bg-white border-l-4 border-l-blue-600 border border-slate-300 rounded-lg p-5 shadow-sm flex flex-col gap-3.5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
          <h4 className="text-sm font-extrabold text-slate-900 tracking-wider">
            ANALYZING IMAGE {Math.min(processedCount + 1, totalImages)} OF {totalImages}
          </h4>
        </div>
        <div className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
          {processedCount} / {totalImages} Done ({percentage}%)
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
        <div
          className="bg-blue-600 h-full transition-all duration-300 rounded-full"
          style={{ width: `${Math.max(percentage, 6)}%` }}
        />
      </div>

      <div className="flex flex-wrap justify-between items-center text-xs text-slate-600 gap-2">
        <div>
          <span className="font-semibold text-slate-500">Current Image: </span>
          <span className="font-mono font-bold text-slate-800">
            {currentImageName || "Initializing pipeline..."}
          </span>
        </div>
        <div>
          <span className="font-semibold text-slate-500">Current Stage: </span>
          <span className="bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded border border-sky-200">
            {currentStage}
          </span>
        </div>
      </div>

      {/* Checklist */}
      {files && files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-3 border-t border-slate-200">
          {files.map((file, idx) => {
            const isCompleted = idx < processedCount;
            const isCurrent = idx === processedCount;
            return (
              <div
                key={`${file.name}-${idx}`}
                className={`flex items-center gap-1.5 text-xs p-1.5 rounded truncate ${
                  isCompleted
                    ? "text-emerald-700 font-semibold bg-emerald-50/60"
                    : isCurrent
                    ? "text-blue-700 font-bold bg-blue-50 border border-blue-200"
                    : "text-slate-400"
                }`}
              >
                {isCompleted ? (
                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : isCurrent ? (
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shrink-0 ml-1 mr-0.5" />
                ) : (
                  <span className="w-2 h-2 rounded-full border border-slate-300 shrink-0 ml-1 mr-0.5" />
                )}
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

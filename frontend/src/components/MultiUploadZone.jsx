import { useState, useRef } from "react";

export default function MultiUploadZone({
  selectedFiles,
  onFilesSelected,
  onRemoveFile,
  onClearAll,
  onAnalyzeAll,
  activeRecordsCount = 0,
  isProcessing = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith("image/") || /\.(jpe?g|png)$/i.test(f.name)
    );
    if (droppedFiles.length > 0) {
      onFilesSelected(droppedFiles);
    }
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all bg-white shadow-sm ${
          isDragging
            ? "border-blue-600 bg-blue-50/50 scale-[0.99]"
            : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"
        } ${selectedFiles.length > 0 ? "py-6" : "py-12"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={isProcessing}
        />

        <div className="flex flex-col items-center gap-2">
          <div className="text-4xl mb-1">📁</div>
          <h4 className="text-base font-bold text-slate-800 tracking-wide">
            DROP IMAGES HERE OR <span className="text-blue-600 underline">BROWSE FILES</span>
          </h4>
          <p className="text-xs text-slate-500">
            Select 1, 5, 10 or multiple captures (JPG, JPEG, PNG · Up to 20 MB each)
          </p>
          <button
            type="button"
            className="mt-2 inline-flex items-center px-4 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded shadow-sm transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            disabled={isProcessing}
          >
            Select Images
          </button>
        </div>
      </div>

      {/* Selected Files List & Pre-Analysis Summary */}
      {selectedFiles.length > 0 && (
        <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-sm flex flex-col gap-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="bg-slate-900 text-white text-xs font-bold px-2 py-0.5 rounded">
                {selectedFiles.length}
              </span>
              <span className="text-sm font-bold text-slate-900">
                {selectedFiles.length === 1 ? "Selected Image for Verification" : "Selected Images for Batch Verification"}
              </span>
            </div>
            <button
              type="button"
              className="text-xs font-bold text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded transition-colors"
              onClick={onClearAll}
              disabled={isProcessing}
            >
              Clear All
            </button>
          </div>

          {/* Image Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-52 overflow-y-auto p-1">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded p-2 text-left"
              >
                <span className="text-lg">🖼️</span>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-800 truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                {!isProcessing && (
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600 text-base font-bold px-1"
                    onClick={() => onRemoveFile(idx)}
                    title="Remove file"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Pre-Analysis Operation Summary Box */}
          <div className="bg-slate-50 border border-slate-300 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-4 text-slate-700">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Selected Images
                </span>
                <span className="text-base font-extrabold text-slate-900">
                  {selectedFiles.length}
                </span>
              </div>

              <div className="text-xl font-bold text-slate-400">×</div>

              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Active Monitored Records
                </span>
                <span className="text-base font-extrabold text-emerald-700">
                  {activeRecordsCount} Active
                </span>
              </div>

              <div className="text-xl font-bold text-slate-400">=</div>

              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Expected Operation
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {selectedFiles.length} images × all detected plates × {activeRecordsCount} active records
                </span>
              </div>
            </div>

            <div>
              <button
                type="button"
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-extrabold rounded shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                onClick={onAnalyzeAll}
                disabled={isProcessing || selectedFiles.length === 0}
              >
                {isProcessing ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing Batch...
                  </>
                ) : (
                  <>⚡ ANALYZE ALL {selectedFiles.length > 1 ? `(${selectedFiles.length} IMAGES)` : "IMAGE"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

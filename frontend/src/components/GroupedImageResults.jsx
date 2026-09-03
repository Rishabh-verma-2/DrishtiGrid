import { useState, useEffect, useRef } from "react";

/**
 * LocalPreview: shows the uploaded file immediately using a blob URL (instant, no server round-trip).
 * Falls back to the server-returned base64 if the local file is unavailable.
 */
function LocalPreview({ localFile, serverImage, altText }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const prevUrl = useRef(null);

  useEffect(() => {
    if (localFile) {
      const url = URL.createObjectURL(localFile);
      setBlobUrl(url);
      prevUrl.current = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [localFile]);

  const src = blobUrl || serverImage || null;

  return (
    <div className="bg-black border border-slate-300 rounded overflow-hidden h-60 flex items-center justify-center">
      {src ? (
        <img
          src={src}
          alt={altText || "Source image"}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <span className="text-slate-500 text-xs">Preview unavailable</span>
      )}
    </div>
  );
}

export default function GroupedImageResults({ results = [], localFiles = [], onViewAlert }) {
  const [filterMode, setFilterMode] = useState("ALL");
  const [expandedImages, setExpandedImages] = useState({});

  if (!results || results.length === 0) return null;


  const toggleExpand = (imgId) => {
    setExpandedImages((prev) => ({
      ...prev,
      [imgId]: !prev[imgId],
    }));
  };

  const filteredResults = results.filter((img) => {
    if (filterMode === "ALL") return true;
    if (filterMode === "MATCHES_ONLY") return (img.matched_plates || 0) > 0;
    if (filterMode === "NO_MATCH") return (img.matched_plates || 0) === 0;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-base font-extrabold text-slate-900 tracking-wide">
          Image-by-Image Verification Results
        </h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={`px-3 py-1 text-xs font-bold rounded border transition-colors ${
              filterMode === "ALL"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
            onClick={() => setFilterMode("ALL")}
          >
            All Images ({results.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs font-bold rounded border transition-colors ${
              filterMode === "MATCHES_ONLY"
                ? "bg-red-700 text-white border-red-700"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
            onClick={() => setFilterMode("MATCHES_ONLY")}
          >
            Matches Only ({results.filter((r) => (r.matched_plates || 0) > 0).length})
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs font-bold rounded border transition-colors ${
              filterMode === "NO_MATCH"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
            onClick={() => setFilterMode("NO_MATCH")}
          >
            No Matches ({results.filter((r) => (r.matched_plates || 0) === 0).length})
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {filteredResults.map((imgResult, idx) => {
          const isExpanded = expandedImages[imgResult.image_id] ?? true;
          const hasMatches = (imgResult.matched_plates || 0) > 0;

          return (
            <div
              key={imgResult.image_id || idx}
              className={`bg-white border rounded-lg overflow-hidden shadow-sm transition-all ${
                hasMatches ? "border-l-4 border-l-red-600 border-slate-300" : "border-slate-300"
              }`}
            >
              {/* Header */}
              <div
                className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center cursor-pointer select-none hover:bg-slate-100/70"
                onClick={() => toggleExpand(imgResult.image_id)}
              >
                <div className="flex items-center gap-3">
                  <span className="bg-slate-900 text-white text-[11px] font-black px-2 py-0.5 rounded">
                    IMAGE {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-bold font-mono text-slate-900 truncate max-w-xs sm:max-w-md" title={imgResult.image_name}>
                    {imgResult.image_name}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {imgResult.file_size_kb} KB
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded">
                    {imgResult.plates_detected} {imgResult.plates_detected === 1 ? "Plate" : "Plates"} Detected
                  </span>
                  {hasMatches && (
                    <span className="text-xs font-black bg-red-100 text-red-800 border border-red-200 px-2.5 py-0.5 rounded">
                      🚨 {imgResult.matched_plates} MATCH FOUND
                    </span>
                  )}
                  <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                    {imgResult.timings?.total_image_ms || 0} ms
                  </span>
                  <span className="text-xs text-slate-500 font-bold">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* Body */}
              {isExpanded && (
                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Source Scene Preview */}
                    <div className="lg:col-span-4 flex flex-col gap-2">
                      <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Source Scene Image
                      </span>
                      <LocalPreview
                        serverImage={imgResult.original_image}
                        localFile={localFiles.find((f) => f.name === imgResult.image_name)}
                        altText={imgResult.image_name}
                      />
                    </div>

                    {/* Detected Plates */}
                    <div className="lg:col-span-8 flex flex-col gap-3">
                      <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Detected Plates & OCR Matches ({imgResult.plates.length})
                      </span>

                      {imgResult.plates.length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold p-4 rounded text-center">
                          No license plates localized in this image.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {imgResult.plates.map((plate, pIdx) => {
                            const isMatch = plate.match_status === "MATCH_FOUND";
                            const isPossible = plate.match_status === "POSSIBLE_MATCH";
                            const isUncertain = plate.match_status === "OCR_UNCERTAIN";

                            return (
                              <div
                                key={plate.plate_id || pIdx}
                                className={`p-4 rounded-lg border transition-all ${
                                  isMatch
                                    ? "bg-red-50/70 border-red-300 shadow-sm"
                                    : isPossible
                                    ? "bg-amber-50/70 border-amber-300"
                                    : "bg-slate-50 border-slate-200"
                                }`}
                              >
                                <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-extrabold text-slate-500">
                                      Plate #{pIdx + 1}
                                    </span>
                                    <div className="plate-pill">
                                      <span className="plate-ind">IND</span>
                                      <span className="plate-text">
                                        {plate.normalized_plate || plate.raw_ocr || "UNKNOWN"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {isMatch ? (
                                      <>
                                        <span className="bg-red-600 text-white text-xs font-extrabold px-2.5 py-0.5 rounded shadow-sm">
                                          MATCH FOUND
                                        </span>
                                        {plate.matched_record?.priority && (
                                          <span className="bg-red-100 text-red-800 border border-red-300 text-xs font-bold px-2 py-0.5 rounded">
                                            {plate.matched_record.priority} PRIORITY
                                          </span>
                                        )}
                                      </>
                                    ) : isPossible ? (
                                      <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-2.5 py-0.5 rounded">
                                        POSSIBLE MATCH
                                      </span>
                                    ) : isUncertain ? (
                                      <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded">
                                        OCR UNCERTAIN
                                      </span>
                                    ) : (
                                      <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded">
                                        NO MATCH
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Crop Evidences */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                                  <div>
                                    <span className="block text-[11px] font-bold text-slate-500 mb-1">
                                      Original Crop
                                    </span>
                                    <div className="h-16 bg-slate-900 rounded border border-slate-300 flex items-center justify-center overflow-hidden">
                                      {plate.original_crop ? (
                                        <img
                                          src={
                                            plate.original_crop.startsWith("data:")
                                              ? plate.original_crop
                                              : `data:image/jpeg;base64,${plate.original_crop}`
                                          }
                                          alt="Original Crop"
                                          className="max-h-full max-w-full object-contain"
                                        />
                                      ) : (
                                        <span className="text-slate-500 text-xs">N/A</span>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <span className="block text-[11px] font-bold text-slate-500 mb-1">
                                      Enhanced Crop
                                    </span>
                                    <div className="h-16 bg-slate-900 rounded border border-slate-300 flex items-center justify-center overflow-hidden">
                                      {plate.enhanced_crop ? (
                                        <img
                                          src={
                                            plate.enhanced_crop.startsWith("data:")
                                              ? plate.enhanced_crop
                                              : `data:image/jpeg;base64,${plate.enhanced_crop}`
                                          }
                                          alt="Enhanced Crop"
                                          className="max-h-full max-w-full object-contain"
                                        />
                                      ) : (
                                        <span className="text-slate-500 text-xs">N/A</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-1 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-slate-500 font-semibold">OCR Confidence:</span>
                                      <span className="font-extrabold text-slate-900">
                                        {Math.round((plate.ocr_confidence || 0) * 1000) / 10}%
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500 font-semibold">Det. Confidence:</span>
                                      <span className="font-bold text-slate-800">
                                        {Math.round((plate.detection_confidence || 0) * 1000) / 10}%
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500 font-semibold">Raw OCR:</span>
                                      <span className="font-mono font-bold text-slate-800">
                                        {plate.raw_ocr || "—"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {(isMatch || isPossible) && plate.matched_record && (
                                  <div className="mt-3 pt-2.5 border-t border-red-200 flex flex-wrap justify-between items-center gap-2">
                                    <div className="text-xs text-red-900 font-medium">
                                      Matched Monitored Record:{" "}
                                      <strong className="font-bold">{plate.matched_record?.recordId}</strong> (
                                      {plate.matched_record?.category})
                                    </div>
                                    <button
                                      type="button"
                                      className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white text-xs font-black rounded shadow-sm transition-colors"
                                      onClick={() => {
                                        if (onViewAlert && plate.alert_id) {
                                          onViewAlert(plate.alert_id);
                                        }
                                      }}
                                    >
                                      VIEW ALERT
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

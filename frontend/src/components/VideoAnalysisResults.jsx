import { useState } from "react";
import {
  ShieldCheckIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  ExternalLinkIcon,
  XIcon,
  ArrowLeftIcon,
  MapPinIcon,
} from "./Icons";

export default function VideoAnalysisResults({
  job,
  detections = [],
  onReset,
  onViewAlert,
}) {
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [selectedCropModal, setSelectedCropModal] = useState(null);

  if (!job) return null;

  const isCompleted = job.status === "COMPLETED";
  const isFailed = job.status === "FAILED";
  const isProcessing = job.status === "PROCESSING" || job.status === "QUEUED";

  const totalFrames = job.totalFrames || 0;
  const processedFrames = job.processedFrames || 0;
  const progressPercent = totalFrames > 0
    ? Math.min(100, Math.round((processedFrames / totalFrames) * 100))
    : (isCompleted ? 100 : 5);

  const filteredDetections = detections.filter((d) => {
    if (filterStatus === "ALL") return true;
    return d.match_status === filterStatus;
  });

  const matchFoundCount = detections.filter((d) => d.match_status === "MATCH_FOUND").length;
  const possibleMatchCount = detections.filter((d) => d.match_status === "POSSIBLE_MATCH").length;
  const noMatchCount = detections.filter((d) => d.match_status === "NO_MATCH").length;
  const uncertainCount = detections.filter((d) => d.match_status === "OCR_UNCERTAIN").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header & Status Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col gap-5">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-blue-600 uppercase tracking-widest">
                SURVEILLANCE ARCHIVE &amp; ANALYSIS
              </span>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isCompleted
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : isFailed
                    ? "bg-red-100 text-red-800 border border-red-300"
                    : "bg-blue-100 text-blue-800 border border-blue-300 animate-pulse"
                }`}
              >
                {job.status}
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mt-1">
              Video Stream ANPR Report: {job.videoId}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
              <span>Job ID: <strong className="font-mono text-slate-700">{job.jobId}</strong></span>
              {job.sourceVideoUrl && (
                <a
                  href={job.sourceVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-semibold underline flex items-center gap-1"
                >
                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                  <span>Source Video Stream</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-300 shadow-sm"
              >
                <ArrowLeftIcon className="w-3.5 h-3.5" />
                <span>New Video Analysis</span>
              </button>
            )}
          </div>
        </div>

        {/* In-Progress Live Bar */}
        {isProcessing && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                <span>
                  {totalFrames > 0
                    ? `Processing frame ${processedFrames} of ${totalFrames}`
                    : "Extracting 1-FPS frames via ffmpeg..."}
                </span>
              </div>
              <span className="font-mono text-blue-600 font-extrabold">{progressPercent}%</span>
            </div>

            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex flex-wrap justify-between items-center text-[11px] text-slate-500">
              <span>Live AI Inference (Zero-DCE + Real-ESRGAN + PaddleOCR + Vehicle Attributes)</span>
              <span>Polling status automatically every 2s...</span>
            </div>
          </div>
        )}

        {/* Failed Banner */}
        {isFailed && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-semibold px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
            <span>Video processing failed: {job.error || "Unknown execution error."}</span>
          </div>
        )}

        {/* Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 pt-2">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Frames Analyzed
            </span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
              {job.processedFrames || 0}
              {job.totalFrames ? <span className="text-xs text-slate-400 font-normal"> / {job.totalFrames}</span> : ""}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Plates Detected
            </span>
            <span className="text-xl font-extrabold text-blue-600 mt-1 font-mono">
              {detections.length || job.platesDetected || 0}
            </span>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex flex-col">
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
              Watchlist Matches
            </span>
            <span className="text-xl font-extrabold text-red-600 mt-1 font-mono">
              {matchFoundCount + possibleMatchCount}
            </span>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex flex-col">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
              Privacy Purged (NO_MATCH)
            </span>
            <span className="text-xl font-extrabold text-emerald-600 mt-1 font-mono">
              {job.cleanedUpCount || detections.filter((d) => d.image_deleted).length}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Retained Crops
            </span>
            <span className="text-xl font-extrabold text-slate-800 mt-1 font-mono">
              {job.retainedCount || detections.filter((d) => !d.image_deleted && d.cropped_image_url).length}
            </span>
          </div>
        </div>
      </div>

      {/* Detections Gallery & Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Table Header & Filter Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 bg-slate-50/70">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              License Plate Detections Log ({detections.length})
            </h3>
            <p className="text-xs text-slate-500">
              Extracted occurrences tagged with vehicle color, second offset, and privacy retention status.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-500 mr-1">Filter:</span>
            {[
              { label: `All (${detections.length})`, val: "ALL" },
              { label: `Match Found (${matchFoundCount})`, val: "MATCH_FOUND" },
              { label: `Possible (${possibleMatchCount})`, val: "POSSIBLE_MATCH" },
              { label: `No Match (${noMatchCount})`, val: "NO_MATCH" },
              { label: `Uncertain (${uncertainCount})`, val: "OCR_UNCERTAIN" },
            ].map((f) => (
              <button
                key={f.val}
                type="button"
                onClick={() => setFilterStatus(f.val)}
                className={`text-xs font-extrabold px-2.5 py-1 rounded-md transition-all ${
                  filterStatus === f.val
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Detections List */}
        {filteredDetections.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs font-semibold">
            {detections.length === 0
              ? (isProcessing ? "Analyzing video frames in progress..." : "No license plates detected in this video.")
              : "No detections match the selected filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">Sec</th>
                  <th className="py-2.5 px-3">Crop Evidence</th>
                  <th className="py-2.5 px-3">Detected Plate</th>
                  <th className="py-2.5 px-3">Vehicle Attributes</th>
                  <th className="py-2.5 px-3">Match Status</th>
                  <th className="py-2.5 px-3">Timestamp &amp; Location</th>
                  <th className="py-2.5 px-3">Confidences</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDetections.map((det, idx) => {
                  const isMatch = det.match_status === "MATCH_FOUND";
                  const isPossible = det.match_status === "POSSIBLE_MATCH";
                  const isNoMatch = det.match_status === "NO_MATCH";

                  return (
                    <tr
                      key={det.id || det.detectionId || idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isMatch ? "bg-red-50/40" : isPossible ? "bg-amber-50/30" : ""
                      }`}
                    >
                      {/* Frame Second / Duration */}
                      <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-xs">
                            +{String(Math.floor((det.first_seen_second ?? det.frame_second ?? 0) / 60)).padStart(2, "0")}:
                            {String((det.first_seen_second ?? det.frame_second ?? 0) % 60).padStart(2, "0")}s
                            {det.last_seen_second != null && det.last_seen_second > (det.first_seen_second ?? det.frame_second ?? 0) && (
                              <span className="text-slate-400 font-normal text-[11px]">
                                {" - "}+{String(Math.floor(det.last_seen_second / 60)).padStart(2, "0")}:
                                {String(det.last_seen_second % 60).padStart(2, "0")}s
                              </span>
                            )}
                          </span>
                          {(det.occurrence_count || 1) > 1 && (
                            <span className="inline-block text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-bold border border-blue-200 w-max">
                              {det.occurrence_count} frames
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Crop Evidence (or Privacy Purged Badge) */}
                      <td className="py-3 px-3">
                        {det.cropped_image_url ? (
                          <div
                            onClick={() => setSelectedCropModal(det.cropped_image_url)}
                            className="cursor-pointer group relative w-20 h-10 rounded border border-slate-300 overflow-hidden bg-black flex items-center justify-center shadow-sm"
                          >
                            <img
                              src={det.cropped_image_url}
                              alt="Plate Crop"
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-semibold gap-1">
                              <EyeIcon className="w-3 h-3" />
                              <span>View</span>
                            </div>
                          </div>
                        ) : det.image_deleted ? (
                          <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-600 rounded px-2 py-1 text-[10px] font-semibold" title="Cloudinary image deleted per match status privacy policy">
                            <ShieldCheckIcon className="w-3 h-3 text-slate-500" />
                            <span>Purged</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No crop</span>
                        )}
                      </td>

                      {/* Detected Plate Number */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-sm text-slate-900 tracking-wider bg-slate-100 px-2 py-0.5 rounded border border-slate-300 inline-block w-max">
                            {det.plate_number || "UNKNOWN"}
                          </span>
                          {det.raw_ocr && det.raw_ocr !== det.plate_number && (
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Raw: {det.raw_ocr}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Vehicle Attributes */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-700">
                              {det.car_color ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-slate-400 shrink-0"
                                    style={{
                                      backgroundColor:
                                        det.car_color.toLowerCase().includes("white") ? "#ffffff"
                                        : det.car_color.toLowerCase().includes("black") ? "#111827"
                                        : det.car_color.toLowerCase().includes("silver") || det.car_color.toLowerCase().includes("gray") ? "#9ca3af"
                                        : det.car_color.toLowerCase().includes("red") ? "#dc2626"
                                        : det.car_color.toLowerCase().includes("blue") ? "#2563eb"
                                        : det.car_color.toLowerCase().includes("green") ? "#16a34a"
                                        : det.car_color.toLowerCase().includes("yellow") ? "#eab308"
                                        : det.car_color.toLowerCase().includes("orange") ? "#ea580c"
                                        : "#64748b",
                                    }}
                                  />
                                  <span>{det.car_color}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Color: N/A</span>
                              )}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Model: {det.car_model || "Not Available"}
                          </span>
                        </div>
                      </td>

                      {/* Match Status */}
                      <td className="py-3 px-3">
                        {isMatch ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 w-max shadow-sm">
                              <AlertTriangleIcon className="w-3 h-3 text-red-600" />
                              <span>MATCH FOUND</span>
                            </span>
                            {det.matched_record && (
                              <span className="text-[10px] text-red-700 font-medium">
                                {det.matched_record.category} · {det.matched_record.priority}
                              </span>
                            )}
                          </div>
                        ) : isPossible ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 w-max">
                            <AlertTriangleIcon className="w-3 h-3 text-amber-600" />
                            <span>POSSIBLE MATCH</span>
                          </span>
                        ) : isNoMatch ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 w-max">
                            <CheckCircleIcon className="w-3 h-3 text-slate-500" />
                            <span>NO MATCH</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 w-max">
                            <span>UNCERTAIN</span>
                          </span>
                        )}
                      </td>

                      {/* Timestamp & Location */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col text-[11px]">
                          <span className="font-semibold text-slate-800">
                            {new Date(det.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(det.timestamp).toLocaleDateString()}
                          </span>
                          {det.location_address ? (
                            <span className="text-[10px] text-slate-600 truncate max-w-xs mt-0.5 flex items-center gap-1" title={det.location_address}>
                              <MapPinIcon className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{det.location_address}</span>
                            </span>
                          ) : det.latitude && det.longitude ? (
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                              <MapPinIcon className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{det.latitude.toFixed(4)}, {det.longitude.toFixed(4)}</span>
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Confidences */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <div className="flex flex-col gap-0.5">
                          <span>Overall: <strong>{Math.round((det.overall_confidence || 0) * 100)}%</strong></span>
                          <span className="text-[10px] text-slate-400">
                            Det: {Math.round((det.detection_confidence || 0) * 100)}% · OCR: {Math.round((det.ocr_confidence || 0) * 100)}%
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        {isMatch && onViewAlert ? (
                          <button
                            type="button"
                            onClick={() => onViewAlert()}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-[10px] rounded shadow-sm transition-colors"
                          >
                            View Alert
                          </button>
                        ) : det.cropped_image_url ? (
                          <a
                            href={det.cropped_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-[10px] font-medium underline inline-flex items-center gap-0.5"
                          >
                            <span>Crop Evidence</span>
                            <ExternalLinkIcon className="w-2.5 h-2.5" />
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for viewing plate crop */}
      {selectedCropModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setSelectedCropModal(null)}
        >
          <div
            className="bg-white rounded-xl p-4 max-w-lg w-full flex flex-col gap-3 shadow-2xl border border-slate-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Enhanced Plate Evidence Crop
              </span>
              <button
                type="button"
                onClick={() => setSelectedCropModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-950 rounded-lg p-2 flex items-center justify-center border border-slate-800">
              <img
                src={selectedCropModal}
                alt="License Plate Evidence"
                className="max-h-80 w-auto object-contain rounded"
              />
            </div>
            <div className="flex justify-end">
              <a
                href={selectedCropModal}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded hover:bg-blue-700 shadow-sm"
              >
                <span>Full Resolution Image</span>
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

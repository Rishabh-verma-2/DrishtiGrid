import { useState, useEffect } from "react";
import { getStoredPlateDetections } from "../api/detectionsApi";
import {
  RefreshCwIcon,
  VideoIcon,
  ImageIcon,
  EyeIcon,
  ShieldCheckIcon,
  MapPinIcon,
  SearchIcon,
  XIcon,
  ExternalLinkIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  FilterIcon,
} from "../components/Icons";

export default function DetectionsGridPage({ onViewAlert }) {
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [colorFilter, setColorFilter] = useState("ALL");
  const [selectedCropModal, setSelectedCropModal] = useState(null);

  const fetchDetections = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStoredPlateDetections({
        search,
        match_status: matchFilter,
        source_type: sourceFilter,
        car_color: colorFilter,
        limit: 300,
      });
      setDetections(data);
    } catch (err) {
      setError(err.message || "Failed to load detections.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetections();
  }, [matchFilter, sourceFilter, colorFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDetections();
  };

  const matchFoundCount = detections.filter((d) => d.match_status === "MATCH_FOUND").length;
  const possibleMatchCount = detections.filter((d) => d.match_status === "POSSIBLE_MATCH").length;
  const noMatchCount = detections.filter((d) => d.match_status === "NO_MATCH").length;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-5 flex flex-col gap-4">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-700 tracking-wider uppercase">
                DATABASE REPOSITORY
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                platedetections
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              Surveillance Plate Detections Log
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
              Consolidated, deduplicated record of license plates identified across video streams
              and image batches, stored with vehicle attributes and location telemetry.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchDetections}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-300 shadow-sm flex items-center gap-1.5"
            >
              <RefreshCwIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh Log</span>
            </button>
          </div>
        </div>

        {/* Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-3 flex flex-col">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Logged Vehicles
            </span>
            <span className="text-lg font-bold text-slate-900 mt-1 font-mono">
              {detections.length}
            </span>
          </div>

          <div className="bg-rose-50/50 border border-rose-200/60 rounded-lg p-3 flex flex-col">
            <span className="text-[10px] font-semibold text-rose-700 uppercase tracking-wider">
              Watchlist Matches
            </span>
            <span className="text-lg font-bold text-rose-600 mt-1 font-mono">
              {matchFoundCount}
            </span>
          </div>

          <div className="bg-amber-50/50 border border-amber-200/60 rounded-lg p-3 flex flex-col">
            <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
              Possible Matches
            </span>
            <span className="text-lg font-bold text-amber-600 mt-1 font-mono">
              {possibleMatchCount}
            </span>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-lg p-3 flex flex-col">
            <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
              Privacy Cleared (No Match)
            </span>
            <span className="text-lg font-bold text-emerald-600 mt-1 font-mono">
              {noMatchCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-3.5 flex flex-wrap justify-between items-center gap-3">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <span className="absolute left-2.5 top-2.5 text-slate-400">
              <SearchIcon className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search plate, location, source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs px-3 py-2 pl-8 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 pr-8 text-slate-800 placeholder-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  getStoredPlateDetections({ match_status: matchFilter, source_type: sourceFilter, car_color: colorFilter }).then(setDetections);
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm"
          >
            Search
          </button>
        </form>

        {/* Filter Selects */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-slate-400 text-xs font-medium mr-1">
            <FilterIcon className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Match Status */}
          <select
            value={matchFilter}
            onChange={(e) => setMatchFilter(e.target.value)}
            className="text-xs font-medium px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="MATCH_FOUND">Match Found</option>
            <option value="POSSIBLE_MATCH">Possible Match</option>
            <option value="NO_MATCH">No Match</option>
            <option value="OCR_UNCERTAIN">Uncertain</option>
          </select>

          {/* Source Type */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-xs font-medium px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Sources</option>
            <option value="VIDEO">Video Stream</option>
            <option value="IMAGE">Image Ingestion</option>
          </select>

          {/* Color Filter */}
          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className="text-xs font-medium px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Colors</option>
            <option value="Black">Black</option>
            <option value="White">White</option>
            <option value="Silver">Silver / Gray</option>
            <option value="Red">Red</option>
            <option value="Blue">Blue</option>
            <option value="Green">Green</option>
            <option value="Yellow">Yellow</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs font-medium flex flex-col items-center gap-2">
            <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading detections from repository...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-xs font-semibold">
            {error}
          </div>
        ) : detections.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-medium">
            No plate detections found matching the specified filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3.5">Source &amp; Offset</th>
                  <th className="py-2.5 px-3">Crop Evidence</th>
                  <th className="py-2.5 px-3">Detected Plate</th>
                  <th className="py-2.5 px-3">Vehicle Attributes</th>
                  <th className="py-2.5 px-3">Match Status</th>
                  <th className="py-2.5 px-3">Timestamp &amp; Location</th>
                  <th className="py-2.5 px-3">Confidences</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detections.map((det, idx) => {
                  const isMatch = det.match_status === "MATCH_FOUND";
                  const isPossible = det.match_status === "POSSIBLE_MATCH";
                  const isVideo = det.source_type === "VIDEO" || det.video_id;

                  return (
                    <tr
                      key={det.id || det.detectionId || idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isMatch ? "bg-rose-50/30" : isPossible ? "bg-amber-50/20" : ""
                      }`}
                    >
                      {/* Source & Sec */}
                      <td className="py-3 px-3.5 font-mono text-slate-700 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
                            {isVideo ? (
                              <VideoIcon className="w-3.5 h-3.5 text-slate-500" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                            )}
                            <span>{isVideo ? "Video" : "Image"}</span>
                          </span>
                          {isVideo && (
                            <span className="text-[11px] text-slate-500 font-mono">
                              +{String(Math.floor((det.first_seen_second ?? det.frame_second ?? 0) / 60)).padStart(2, "0")}:
                              {String((det.first_seen_second ?? det.frame_second ?? 0) % 60).padStart(2, "0")}s
                              {det.last_seen_second != null && det.last_seen_second > (det.first_seen_second ?? det.frame_second ?? 0) && (
                                <span className="text-slate-400">
                                  {" - "}+{String(Math.floor(det.last_seen_second / 60)).padStart(2, "0")}:
                                  {String(det.last_seen_second % 60).padStart(2, "0")}s
                                </span>
                              )}
                            </span>
                          )}
                          {(det.occurrence_count || 1) > 1 && (
                            <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-medium border border-blue-100 w-max mt-0.5">
                              {det.occurrence_count} frames
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Crop Evidence */}
                      <td className="py-3 px-3">
                        {det.cropped_image_url ? (
                          <div
                            onClick={() => setSelectedCropModal(det.cropped_image_url)}
                            className="cursor-pointer group relative w-20 h-9 rounded border border-slate-200 overflow-hidden bg-slate-900 flex items-center justify-center shadow-xs"
                          >
                            <img
                              src={det.cropped_image_url}
                              alt="Plate Crop"
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-medium gap-1">
                              <EyeIcon className="w-3 h-3" />
                              <span>View</span>
                            </div>
                          </div>
                        ) : det.image_deleted ? (
                          <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-slate-500 rounded px-2 py-0.5 text-[10px] font-medium" title="Image purged per privacy retention standard">
                            <ShieldCheckIcon className="w-3 h-3 text-slate-400" />
                            <span>Purged</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No crop</span>
                        )}
                      </td>

                      {/* Detected Plate */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-xs text-slate-900 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 inline-block w-max">
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
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-slate-700">
                              {det.car_color ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-full border border-slate-300 shrink-0"
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
                                <span className="text-slate-400">Color: N/A</span>
                              )}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Model: {det.car_model || "Not Available"}
                          </span>
                        </div>
                      </td>

                      {/* Match Status */}
                      <td className="py-3 px-3">
                        {isMatch ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 w-max">
                              <AlertTriangleIcon className="w-3 h-3 text-rose-600" />
                              <span>MATCH FOUND</span>
                            </span>
                            {det.matched_record && (
                              <span className="text-[10px] text-rose-700 font-medium">
                                {det.matched_record.category} · {det.matched_record.priority}
                              </span>
                            )}
                          </div>
                        ) : isPossible ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 w-max">
                            <span>POSSIBLE MATCH</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200 w-max">
                            <CheckCircleIcon className="w-2.5 h-2.5 text-slate-400" />
                            <span>NO MATCH</span>
                          </span>
                        )}
                      </td>

                      {/* Timestamp & Location */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col text-[11px]">
                          <span className="font-medium text-slate-800">
                            {new Date(det.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(det.timestamp).toLocaleDateString()}
                          </span>
                          {det.location_address ? (
                            <span className="text-[10px] text-slate-500 truncate max-w-xs mt-0.5 flex items-center gap-1" title={det.location_address}>
                              <MapPinIcon className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span className="truncate">{det.location_address}</span>
                            </span>
                          ) : det.latitude && det.longitude ? (
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                              <MapPinIcon className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span>{det.latitude.toFixed(4)}, {det.longitude.toFixed(4)}</span>
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Confidences */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-800">Overall: <strong>{Math.round((det.overall_confidence || 0) * 100)}%</strong></span>
                          <span className="text-[10px] text-slate-400">
                            Det: {Math.round((det.detection_confidence || 0) * 100)}% · OCR: {Math.round((det.ocr_confidence || 0) * 100)}%
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right">
                        {isMatch && onViewAlert ? (
                          <button
                            type="button"
                            onClick={() => onViewAlert()}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[10px] rounded transition-colors shadow-xs"
                          >
                            View Alert
                          </button>
                        ) : det.cropped_image_url ? (
                          <a
                            href={det.cropped_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-[10px] font-medium inline-flex items-center gap-1"
                          >
                            <span>Crop</span>
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
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setSelectedCropModal(null)}
        >
          <div
            className="bg-white rounded-xl p-4 max-w-lg w-full flex flex-col gap-3 shadow-xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">
                License Plate Evidence Crop
              </span>
              <button
                type="button"
                onClick={() => setSelectedCropModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-950 rounded-lg p-2 flex items-center justify-center">
              <img
                src={selectedCropModal}
                alt="License Plate Evidence"
                className="max-h-80 w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


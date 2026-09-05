import { useState, useEffect, useRef } from "react";
import MultiUploadZone from "../components/MultiUploadZone";
import BatchProgress from "../components/BatchProgress";
import BatchSummary from "../components/BatchSummary";
import GroupedImageResults from "../components/GroupedImageResults";
import MatchAlertPopup from "../components/MatchAlertPopup";
import VideoUploadZone from "../components/VideoUploadZone";
import VideoAnalysisResults from "../components/VideoAnalysisResults";
import { ImageIcon, VideoIcon, AlertTriangleIcon } from "../components/Icons";
import { analyzeImages } from "../api/analyzeImage";
import { getPlateRecords } from "../api/recordsApi";
import { uploadAndAnalyzeVideo, getVideoJobStatus, getVideoDetections } from "../api/videoApi";

export default function Analyzer({ onViewAlert, onNavigateToRecords }) {
  // Mode: "IMAGE_BATCH" | "VIDEO_STREAM"
  const [analysisMode, setAnalysisMode] = useState("IMAGE_BATCH");

  // Image batch analysis state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [activeRecordsCount, setActiveRecordsCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentImageName, setCurrentImageName] = useState("");
  const [batchResult, setBatchResult] = useState(null);
  const [error, setError] = useState(null);
  const [showAlertPopup, setShowAlertPopup] = useState(false);
  const [detectedMatches, setDetectedMatches] = useState([]);

  // Video analysis state
  const [videoJob, setVideoJob] = useState(null);
  const [videoDetections, setVideoDetections] = useState([]);
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState(null);

  const pollingTimerRef = useRef(null);

  // Fetch active monitored records count
  useEffect(() => {
    getPlateRecords({ status: "ACTIVE" })
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.records || []);
        setActiveRecordsCount(list.length);
      })
      .catch((err) => {
        console.warn("Could not fetch active records count:", err);
      });
  }, []);

  // Poll video job status
  useEffect(() => {
    if (!videoJob || videoJob.status === "COMPLETED" || videoJob.status === "FAILED") {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    let consecutiveErrors = 0;
    const poll = async () => {
      try {
        const updatedJob = await getVideoJobStatus(videoJob.jobId);
        consecutiveErrors = 0;
        setVideoJob(updatedJob);

        // If newly completed, fetch detections and check for match alerts
        if (updatedJob.status === "COMPLETED" && updatedJob.videoId) {
          const detList = await getVideoDetections(updatedJob.videoId);
          setVideoDetections(detList);

          // Check for any matches to show the popup
          const matches = detList
            .filter((d) => d.match_status === "MATCH_FOUND" || d.match_status === "POSSIBLE_MATCH")
            .map((d) => ({
              ...d,
              source_image_name: `video_${d.video_id}_sec_${d.frame_second}.jpg`,
              original_image: d.cropped_image_url || "",
            }));

          if (matches.length > 0) {
            setDetectedMatches(matches);
            setShowAlertPopup(true);
          }
        }
      } catch (err) {
        console.warn("Error polling video job status:", err);
        consecutiveErrors++;
        // If 404 (job missing) or repeated connection failures, stop polling loop
        if (err.message?.includes("404") || consecutiveErrors >= 3) {
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
          }
          setVideoError(
            err.message?.includes("404")
              ? "Video processing job was not found or was interrupted. Please try re-uploading."
              : (err.message || "Error communicating with video processing service.")
          );
          setVideoJob((prev) => (prev ? { ...prev, status: "FAILED", error: err.message } : null));
        }
      }
    };

    pollingTimerRef.current = setInterval(poll, 2000);
    poll(); // Run immediately

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [videoJob?.jobId, videoJob?.status]);

  // Handle image selection
  const handleFilesSelected = (newFiles) => {
    setError(null);
    setSelectedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const filteredNew = newFiles.filter((f) => !existingNames.has(f.name));
      return [...prev, ...filteredNew];
    });
  };

  const handleRemoveFile = (indexToRemove) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
    setBatchResult(null);
    setError(null);
    setShowAlertPopup(false);
    setDetectedMatches([]);
  };

  // Run image batch analysis
  const handleAnalyzeAll = async () => {
    if (selectedFiles.length === 0) return;

    setIsProcessing(true);
    setProcessedCount(0);
    setBatchResult(null);
    setError(null);
    setShowAlertPopup(false);
    setDetectedMatches([]);
    setCurrentImageName(selectedFiles[0]?.name || "");

    try {
      const result = await analyzeImages(selectedFiles, ({ done, total, imageName }) => {
        setProcessedCount(done);
        if (imageName) setCurrentImageName(imageName);
      });

      setProcessedCount(selectedFiles.length);
      setCurrentImageName("");
      setBatchResult(result);

      // Collect all matched plates from the batch result
      const matches = [];
      (result.results || []).forEach((img) => {
        (img.plates || []).forEach((plate) => {
          if (plate.match_status === "MATCH_FOUND" || plate.match_status === "POSSIBLE_MATCH") {
            const localFile = selectedFiles.find((f) => f.name === img.image_name);
            const localPreviewUrl = localFile ? URL.createObjectURL(localFile) : null;
            matches.push({
              ...plate,
              source_image_name: img.image_name,
              original_image: localPreviewUrl || img.original_image || "",
            });
          }
        });
      });

      if (matches.length > 0) {
        setDetectedMatches(matches);
        setShowAlertPopup(true);
      }
    } catch (err) {
      setError(err.message || "Batch analysis failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Run video analysis
  const handleAnalyzeVideo = async ({ videoFile, recordedAt, latitude, longitude }) => {
    setIsVideoUploading(true);
    setVideoError(null);
    setVideoJob(null);
    setVideoDetections([]);
    setShowAlertPopup(false);

    try {
      const response = await uploadAndAnalyzeVideo(videoFile, {
        recordedAt,
        latitude,
        longitude,
      });

      setVideoJob({
        jobId: response.job_id,
        videoId: response.video_id,
        sourceVideoUrl: response.source_video_url,
        status: response.status || "QUEUED",
        totalFrames: 0,
        processedFrames: 0,
        platesDetected: 0,
        matchedCount: 0,
        cleanedUpCount: 0,
      });
    } catch (err) {
      setVideoError(err.message || "Video upload and analysis initiation failed.");
    } finally {
      setIsVideoUploading(false);
    }
  };

  const handleResetVideo = () => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setVideoJob(null);
    setVideoDetections([]);
    setVideoError(null);
    setShowAlertPopup(false);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header with Mode Selector */}
      <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-xs font-extrabold text-blue-600 uppercase tracking-widest">
            SURVEILLANCE INGESTION &amp; RECOGNITION
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
            Automated Number Plate Recognition (ANPR)
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Execute plate localization, Zero-DCE contrast enhancement, Real-ESRGAN super-resolution,
            PaddleOCR text extraction, and vehicle attribute recognition against active watchlist records.
          </p>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center gap-2 mt-4 bg-slate-200/80 p-1 rounded-lg w-max border border-slate-300">
            <button
              type="button"
              onClick={() => setAnalysisMode("IMAGE_BATCH")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                analysisMode === "IMAGE_BATCH"
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Multi-Image Batch</span>
            </button>

            <button
              type="button"
              onClick={() => setAnalysisMode("VIDEO_STREAM")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                analysisMode === "VIDEO_STREAM"
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <VideoIcon className="w-3.5 h-3.5" />
              <span>1-FPS Video Stream</span>
              <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                Feed
              </span>
            </button>
          </div>
        </div>

        {/* Active Watchlist Ribbon */}
        <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-lg px-4 py-2.5 shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <div className="flex flex-col">
            <span className="text-xl font-extrabold text-slate-900 leading-none">
              {activeRecordsCount}
            </span>
            <span className="text-xs font-bold text-slate-500">Active Monitored Records</span>
          </div>
          {onNavigateToRecords && (
            <button
              type="button"
              className="ml-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-md transition-colors shadow-sm"
              onClick={onNavigateToRecords}
            >
              Manage Watchlist
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODE 1: MULTI-IMAGE BATCH ANALYSIS
          ───────────────────────────────────────────────────────────── */}
      {analysisMode === "IMAGE_BATCH" && (
        <>
          {/* Upload Zone */}
          {!batchResult && (
            <MultiUploadZone
              selectedFiles={selectedFiles}
              onFilesSelected={handleFilesSelected}
              onRemoveFile={handleRemoveFile}
              onClearAll={handleClearAll}
              onAnalyzeAll={handleAnalyzeAll}
              activeRecordsCount={activeRecordsCount}
              isProcessing={isProcessing}
            />
          )}

          {/* Error Alert */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-semibold px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* In-Progress Loading Indicator */}
          {isProcessing && (
            <BatchProgress
              totalImages={selectedFiles.length}
              processedCount={processedCount}
              currentImageName={currentImageName}
              files={selectedFiles}
            />
          )}

          {/* Batch Results Showcase */}
          {batchResult && (
            <div className="flex flex-col gap-5">
              <BatchSummary
                summary={batchResult.summary}
                onReset={() => {
                  setBatchResult(null);
                  setSelectedFiles([]);
                  setShowAlertPopup(false);
                  setDetectedMatches([]);
                }}
              />
              <GroupedImageResults
                results={batchResult.results}
                localFiles={selectedFiles}
                onViewAlert={onViewAlert}
              />
            </div>
          )}
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE 2: 1-FPS VIDEO STREAM ANALYSIS (FEATURE 1 - 5)
          ───────────────────────────────────────────────────────────── */}
      {analysisMode === "VIDEO_STREAM" && (
        <>
          {/* Upload Zone (shown when no video is analyzing/completed) */}
          {!videoJob && (
            <VideoUploadZone
              onAnalyzeVideo={handleAnalyzeVideo}
              isUploading={isVideoUploading}
              activeRecordsCount={activeRecordsCount}
            />
          )}

          {/* Video Error Alert */}
          {videoError && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-semibold px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
              <span>{videoError}</span>
            </div>
          )}

          {/* Video Analysis Progress and Results Showcase */}
          {videoJob && (
            <VideoAnalysisResults
              job={videoJob}
              detections={videoDetections}
              onReset={handleResetVideo}
              onViewAlert={onViewAlert}
            />
          )}
        </>
      )}

      {/* Watchlist Match Alert Popup */}
      {showAlertPopup && detectedMatches.length > 0 && (
        <MatchAlertPopup
          matches={detectedMatches}
          onClose={() => setShowAlertPopup(false)}
          onViewAlerts={onViewAlert}
        />
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import MultiUploadZone from "../components/MultiUploadZone";
import BatchProgress from "../components/BatchProgress";
import BatchSummary from "../components/BatchSummary";
import GroupedImageResults from "../components/GroupedImageResults";
import MatchAlertPopup from "../components/MatchAlertPopup";
import { analyzeImages } from "../api/analyzeImage";
import { getPlateRecords } from "../api/recordsApi";

export default function Analyzer({ onViewAlert, onNavigateToRecords }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [activeRecordsCount, setActiveRecordsCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentImageName, setCurrentImageName] = useState("");
  const [batchResult, setBatchResult] = useState(null);
  const [error, setError] = useState(null);
  const [showAlertPopup, setShowAlertPopup] = useState(false);
  const [detectedMatches, setDetectedMatches] = useState([]);

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
            // Find the local file to create a blob preview for the popup
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


  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-xs font-extrabold text-blue-600 uppercase tracking-widest">
            BATCH VERIFICATION
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
            Multi-Image License Plate Analyzer
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Upload single or multiple vehicle captures for automated plate localization, Zero-DCE
            contrast enhancement, Real-ESRGAN super-resolution, and OCR text matching against active
            monitored records.
          </p>
        </div>

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
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm font-semibold px-4 py-3 rounded-lg flex items-center gap-2">
          <span>⚠️</span>
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

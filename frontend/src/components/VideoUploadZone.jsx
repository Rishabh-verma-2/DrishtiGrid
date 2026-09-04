import { useState, useRef } from "react";
import { VideoIcon, MapPinIcon, ZapIcon } from "./Icons";

export default function VideoUploadZone({
  onVideoSelected,
  onAnalyzeVideo,
  isUploading,
  activeRecordsCount = 0,
}) {
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [recordedAt, setRecordedAt] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoStatus, setGeoStatus] = useState(null);

  const fileInputRef = useRef(null);

  const handleFileChange = (file) => {
    if (!file) return;
    const allowed = ["video/mp4", "video/quicktime", "video/x-matroska", "video/x-msvideo", "video/webm"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|mov|mkv|avi|webm)$/i)) {
      alert("Unsupported file format. Please upload an MP4, MOV, MKV, AVI, or WEBM video.");
      return;
    }

    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    setSelectedVideo(file);
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);

    if (onVideoSelected) {
      onVideoSelected(file);
    }
  };

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setGeoStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
        setGeoStatus("Current GPS coordinates captured.");
      },
      (err) => {
        setLocating(false);
        setGeoStatus(`Location error: ${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSetCurrentTime = () => {
    const now = new Date();
    // format as YYYY-MM-DDTHH:mm
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setRecordedAt(localIso);
  };

  const handleStartAnalysis = () => {
    if (!selectedVideo) return;
    onAnalyzeVideo({
      videoFile: selectedVideo,
      recordedAt: recordedAt ? new Date(recordedAt).toISOString() : null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
    });
  };

  const handleClear = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setSelectedVideo(null);
    setVideoPreviewUrl(null);
    setRecordedAt("");
    setLatitude("");
    setLongitude("");
    setGeoStatus(null);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col gap-6">
      {/* Informative Banner */}
      <div className="bg-slate-900 text-white rounded-lg p-4 border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-white shrink-0">
            <VideoIcon className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base tracking-wide text-white">
              Automated 1-FPS Video Surveillance Pipeline
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Instantly archives raw footage to Cloudinary, runs sequential 1-second frame decomposition,
              detects vehicle attributes (color &amp; model), matches active records, and auto-purges non-matching crops.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded text-xs font-semibold text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active Watchlist: {activeRecordsCount} records</span>
        </div>
      </div>

      {/* Drag & Drop or Video Preview */}
      {!selectedVideo ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
            isDragging
              ? "border-blue-500 bg-blue-50/60 scale-[1.005]"
              : "border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-matroska,video/x-msvideo,video/webm"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />

          <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
            <VideoIcon className="w-7 h-7" />
          </div>

          <div>
            <div className="text-base font-extrabold text-slate-800">
              Drag and drop surveillance video here, or{" "}
              <span className="text-blue-600 underline decoration-2 underline-offset-2">browse files</span>
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-1">
              Supports MP4, MOV, MKV, AVI, and WEBM (up to 150 MB)
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
          {/* Video Preview Player */}
          <div className="w-full lg:w-1/2 flex flex-col gap-2">
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Footage Preview
            </span>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-300 shadow-sm">
              <video
                src={videoPreviewUrl}
                controls
                className="w-full h-full object-contain max-h-64"
              />
            </div>
            <div className="flex justify-between items-center text-xs text-slate-600 px-1">
              <span className="font-bold truncate max-w-xs">{selectedVideo.name}</span>
              <span className="font-mono">{(selectedVideo.size / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
          </div>

          {/* Video Metadata Inputs */}
          <div className="w-full lg:w-1/2 flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Surveillance Metadata (Optional)
              </span>

              {/* Timestamp Input */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">Recording Start Time</label>
                  <button
                    type="button"
                    onClick={handleSetCurrentTime}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline"
                  >
                    Set to Now
                  </button>
                </div>
                <input
                  type="datetime-local"
                  value={recordedAt}
                  onChange={(e) => setRecordedAt(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <span className="text-[10px] text-slate-500">
                  Used to tag wall-clock timestamps on each 1-second extracted frame.
                </span>
              </div>

              {/* Geolocation Coordinates */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">Deployment Coordinates</label>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={locating}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                  >
                    <MapPinIcon className="w-3.5 h-3.5" />
                    <span>{locating ? "Acquiring..." : "Auto-Detect GPS"}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitude (e.g. 28.6139)"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitude (e.g. 77.2090)"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                {geoStatus && (
                  <span className="text-[10px] text-emerald-600 font-medium">{geoStatus}</span>
                )}
                <span className="text-[10px] text-slate-500">
                  Coordinates will be automatically reverse-geocoded to a street address.
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClear}
                disabled={isUploading}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
              >
                Change Video
              </button>

              <button
                type="button"
                onClick={handleStartAnalysis}
                disabled={isUploading}
                className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-xs tracking-wide text-white transition-all shadow-sm flex items-center justify-center gap-2 ${
                  isUploading
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 active:scale-[0.99]"
                }`}
              >
                {isUploading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading &amp; Archiving to Cloudinary...</span>
                  </>
                ) : (
                  <>
                    <ZapIcon className="w-3.5 h-3.5" />
                    <span>Start 1-FPS Video Analysis</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

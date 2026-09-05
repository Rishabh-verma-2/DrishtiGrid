import { useState, useRef, useEffect } from 'react';
import { useThemeStore } from '../../store/themeStore';
import { anprAPI } from '../../api';
import {
  Video, UploadCloud, Clock, MapPin, Sparkles, CheckCircle2,
  AlertTriangle, RefreshCw, X, Play
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function VideoUploadZone({ onAnalysisComplete, activeRecordsCount = 0 }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const [selectedVideo, setSelectedVideo] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [recordedAt, setRecordedAt] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [geoStatus, setGeoStatus] = useState('');
  const [locating, setLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Job status state
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [videoPreviewUrl]);

  // Polling loop for active video job
  useEffect(() => {
    if (!activeJobId) return;

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await anprAPI.getVideoJobStatus(activeJobId);
        const job = res.data?.job;
        if (!job) return;

        setJobStatus(job);

        if (job.status === 'COMPLETED') {
          clearInterval(pollTimerRef.current);
          setIsUploading(false);
          toast.success(`Video surveillance analysis complete! Found ${job.platesDetected || 0} unique vehicle(s).`);
          if (onAnalysisComplete) {
            onAnalysisComplete(activeJobId, activeVideoId, job.sourceVideoUrl || videoPreviewUrl);
          }
        } else if (job.status === 'FAILED') {
          clearInterval(pollTimerRef.current);
          setIsUploading(false);
          toast.error(job.error || 'Video analysis failed');
        }
      } catch (err) {
        console.warn('Poll video job status error:', err);
      }
    }, 1500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeJobId, activeVideoId, onAnalysisComplete]);

  const handleFileChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|avi|webm|mkv)$/i.test(file.name)) {
      return toast.error('Please select a valid video file (MP4, MOV, AVI, WebM, MKV).');
    }
    if (file.size > 150 * 1024 * 1024) {
      return toast.error('Video file size exceeds 150 MB limit.');
    }

    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setSelectedVideo(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleClear = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setSelectedVideo(null);
    setVideoPreviewUrl(null);
    setActiveJobId(null);
    setJobStatus(null);
    setIsUploading(false);
  };

  const handleSetCurrentTime = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setRecordedAt(localIso);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      return toast.error('Geolocation is not supported in this browser.');
    }
    setLocating(true);
    setGeoStatus('Locating CCTV deployment...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGeoStatus('GPS coordinates captured');
        setLocating(false);
      },
      (err) => {
        setGeoStatus('Failed to acquire GPS coordinates');
        setLocating(false);
        toast.error(`Geolocation error: ${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleStartAnalysis = async () => {
    if (!selectedVideo) return toast.error('Please upload a video file first.');

    setIsUploading(true);
    setJobStatus(null);
    const toastId = toast.loading('Uploading video & enqueuing 1-FPS surveillance pipeline...');

    try {
      const formData = new FormData();
      formData.append('video', selectedVideo);
      if (recordedAt) formData.append('recordedAt', recordedAt);
      if (latitude) formData.append('latitude', latitude);
      if (longitude) formData.append('longitude', longitude);

      const res = await anprAPI.uploadVideo(formData);
      const { jobId, videoId } = res.data;

      setActiveJobId(jobId);
      setActiveVideoId(videoId);

      toast.success('Video queued! 1-FPS frame extraction initiated...', { id: toastId });
    } catch (err) {
      setIsUploading(false);
      toast.error(err.response?.data?.message || err.message || 'Video upload failed', {
        id: toastId,
      });
    }
  };

  const processedPct =
    jobStatus?.totalFrames > 0
      ? Math.round(((jobStatus.processedFrames || 0) / jobStatus.totalFrames) * 100)
      : jobStatus?.status === 'PROCESSING'
      ? 20
      : 0;

  return (
    <div className={`rounded-2xl border p-5 lg:p-6 transition-all ${
      isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#141929] border-white/10'
    }`}>
      
      {/* Header ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Video className="w-5 h-5" />
            </span>
            <h3 className={`text-base font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              1-FPS CCTV Video Surveillance Pipeline
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Samples CCTV footage at 1 frame per second, tracks vehicles across frames with 30s temporal deduplication, extracts consensus body color, and enforces post-processing privacy cleanup.
          </p>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${
          isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Active Watchlist: {activeRecordsCount} records</span>
        </div>
      </div>

      {/* Upload Zone / Video Preview */}
      <div className="mt-6">
        {!selectedVideo ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10 scale-[1.005]'
                : isLight
                ? 'border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40'
                : 'border-white/15 hover:border-blue-400/60 bg-white/3 hover:bg-white/5'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/mkv"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
            />

            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <UploadCloud className="w-7 h-7" />
            </div>

            <div>
              <div className={`text-base font-extrabold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                Drag and drop surveillance video here, or <span className="text-blue-500 underline">browse files</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Supports MP4, MOV, AVI, WebM, and MKV (up to 150 MB)
              </div>
            </div>
          </div>
        ) : (
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 rounded-2xl border p-4 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/10'
          }`}>
            {/* Video Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Footage Preview
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {(selectedVideo.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>

              <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-white/10">
                <video src={videoPreviewUrl} controls className="w-full h-full object-contain max-h-64" />
              </div>

              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                {selectedVideo.name}
              </div>
            </div>

            {/* Metadata Inputs */}
            <div className="flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block">
                  CCTV Metadata &amp; Geolocation (Optional)
                </span>

                {/* Timestamp */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className={`text-xs font-bold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                      Recording Start Time
                    </label>
                    <button
                      type="button"
                      onClick={handleSetCurrentTime}
                      className="text-[11px] font-bold text-blue-500 hover:underline"
                    >
                      Set to Now
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={recordedAt}
                    onChange={(e) => setRecordedAt(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
                    }`}
                  />
                  <span className="text-[10px] text-slate-400">
                    Tags wall-clock timestamps onto each 1-second extracted frame.
                  </span>
                </div>

                {/* Coordinates */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className={`text-xs font-bold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                      Deployment Coordinates
                    </label>
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={locating}
                      className="text-[11px] font-bold text-blue-500 hover:underline flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{locating ? 'Acquiring...' : 'Auto-Detect GPS'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="Latitude (e.g. 23.0225)"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
                      }`}
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Longitude (e.g. 72.5714)"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0f1420] border-white/10 text-white'
                      }`}
                    />
                  </div>
                  {geoStatus && (
                    <span className="text-[10px] text-emerald-400 font-medium block">
                      {geoStatus}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    Coordinates will be reverse-geocoded to street address.
                  </span>
                </div>
              </div>

              {/* Progress and Actions */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                {isUploading && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                        <span>
                          {jobStatus?.status === 'PROCESSING'
                            ? `Processing Frame ${jobStatus?.processedFrames || 0} of ${jobStatus?.totalFrames || '...'}`
                            : 'Queued & Extracting 1-FPS Frames...'}
                        </span>
                      </span>
                      <span>{processedPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${processedPct}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={isUploading}
                    className={`px-4 py-2.5 text-xs font-bold rounded-xl border transition-all ${
                      isLight
                        ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                    }`}
                  >
                    Change Video
                  </button>

                  <button
                    type="button"
                    onClick={handleStartAnalysis}
                    disabled={isUploading}
                    className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs text-white transition-all shadow-md flex items-center justify-center gap-2 ${
                      isUploading
                        ? 'bg-slate-600 cursor-not-allowed opacity-80'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99]'
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Analyzing Footage...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" />
                        <span>Start 1-FPS Video Analysis</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

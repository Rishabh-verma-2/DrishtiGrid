import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  UploadCloud,
  FileCheck2,
  Video,
  Camera,
  MapPin,
  Clock,
  Send,
  Eye,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { investigationAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import toast from 'react-hot-toast';

export default function EvidenceSubmitModal({
  isOpen,
  onClose,
  firCase,
  caseItem,
  assignment,
  detectionData = null,
  candidateDetection = null,
  onSubmitted,
}) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  const activeCase = firCase || caseItem;
  const detection = detectionData || candidateDetection;

  const [step, setStep] = useState(1); // 1: Form & Media, 2: Review Preview
  const [cameraId, setCameraId] = useState(detection?.cameraId || 'CAM-VAD-0124');
  const [cameraName, setCameraName] = useState(detection?.cameraName || 'Sayajigunj Station Outer Pole 3');
  const [locationName, setLocationName] = useState(detection?.locationName || 'Sayajigunj Circle Junction, Vadodara');
  const [district, setDistrict] = useState(detection?.district || activeCase?.district || 'Vadodara');
  const [detectionTimestamp, setDetectionTimestamp] = useState(
    detection?.timestamp ? new Date(detection.timestamp).toISOString() : new Date().toISOString()
  );
  const [detectionType, setDetectionType] = useState(
    activeCase?.requestType === 'STOLEN_VEHICLE' ? 'ANPR_MATCH' : 'FACE_MATCH'
  );
  const [aiConfidence, setAiConfidence] = useState(detection?.confidence || 94.6);
  const [headingOrDirection, setHeadingOrDirection] = useState(
    detection?.details?.heading || 'Northbound towards Express Highway'
  );
  const [officerRemarks, setOfficerRemarks] = useState(
    'Clear license plate visibility confirmed on Optical Frame 391. Vehicle matched description and owner identifiers.'
  );

  const [evidenceFiles, setEvidenceFiles] = useState([]); // Array of { file, previewUrl, name, size }

  // Synchronize state when activeCase or detection changes
  useEffect(() => {
    if (activeCase) {
      if (detection?.cameraId) setCameraId(detection.cameraId);
      if (detection?.cameraName) setCameraName(detection.cameraName);
      if (detection?.locationName) setLocationName(detection.locationName);
      if (detection?.district || activeCase.district) setDistrict(detection?.district || activeCase.district);
      if (detection?.confidence) setAiConfidence(detection.confidence);
      if (detection?.details?.heading) setHeadingOrDirection(detection.details.heading);
      if (detection?.timestamp) setDetectionTimestamp(new Date(detection.timestamp).toISOString());
      setDetectionType(activeCase.requestType === 'STOLEN_VEHICLE' ? 'ANPR_MATCH' : 'FACE_MATCH');
      setStep(1);
    }
  }, [activeCase, detection, isOpen]);

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newItems = files.map((file) => ({
      file,
      name: file.name,
      size: file.size,
      previewUrl: file.type.startsWith('image') ? URL.createObjectURL(file) : null,
      type: file.type,
    }));

    setEvidenceFiles((prev) => [...prev, ...newItems]);
  };

  const removeFile = (idx) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitMutation = useMutation({
    mutationFn: (formData) =>
      investigationAPI.submitResult(formData).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['investigation-cases']);
      queryClient.invalidateQueries(['investigation-assignments']);
      queryClient.invalidateQueries(['investigation-results']);
      toast.success('Investigation Result and Evidence submitted to State Admin!');
      if (onSubmitted) onSubmitted(res);
      onClose();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to submit evidence.');
    },
  });

  const handleSubmit = () => {
    if (!officerRemarks.trim()) {
      toast.error('Officer remarks are required.');
      return;
    }

    const formData = new FormData();
    formData.append('caseId', activeCase.caseId);
    const assId = assignment?.assignmentId || activeCase?.assignmentId || activeCase?.assignments?.[0]?.assignmentId;
    if (assId) formData.append('assignmentId', assId);
    formData.append('cameraId', cameraId);
    formData.append('cameraName', cameraName);
    formData.append('locationName', locationName);
    formData.append('district', district);
    formData.append('detectionTimestamp', detectionTimestamp);
    formData.append('detectionType', detectionType);
    formData.append('aiConfidence', String(aiConfidence));
    formData.append('headingOrDirection', headingOrDirection);
    formData.append('officerRemarks', officerRemarks);

    if (detection?.coordinates) {
      formData.append('longitude', String(detection.coordinates[0]));
      formData.append('latitude', String(detection.coordinates[1]));
    }

    evidenceFiles.forEach((f) => {
      formData.append('evidenceFiles', f.file);
    });

    submitMutation.mutate(formData);
  };

  if (!isOpen || !activeCase) return null;

  return (
    <div className="fixed inset-0 z-[3600] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0b101b] border-white/10 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/8'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Submit Investigation Evidence</h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isLight ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-blue-500/20 text-blue-300'
                }`}>
                  Step {step} of 2
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Case ID: <span className={`font-mono font-bold ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>{activeCase.caseId}</span> · {activeCase.requestType?.replace('_', ' ')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
          {step === 1 ? (
            <>
              {/* Auto-populated CCTV detection parameters */}
              <div className={`p-4 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/8'}`}>
                <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Matched Surveillance Camera Details (Auto-Populated)
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Camera ID *</label>
                    <input
                      type="text"
                      required
                      value={cameraId}
                      onChange={(e) => setCameraId(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border font-mono font-bold ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10 text-cyan-400'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Camera Name / Pole</label>
                    <input
                      type="text"
                      value={cameraName}
                      onChange={(e) => setCameraName(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Location / Junction *</label>
                    <input
                      type="text"
                      required
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Detection Timestamp *</label>
                    <input
                      type="text"
                      value={detectionTimestamp}
                      onChange={(e) => setDetectionTimestamp(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border font-mono ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">AI Confidence Score</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={aiConfidence}
                        onChange={(e) => setAiConfidence(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border font-bold ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10 text-amber-400'
                        }`}
                      />
                      <span className="font-bold text-xs">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Direction / Heading</label>
                    <input
                      type="text"
                      value={headingOrDirection}
                      onChange={(e) => setHeadingOrDirection(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Upload Evidence Footage & Frames */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Attach Evidence Files (CCTV Footage Clip, High-Res Snapshot Frame, Plate Crop)
                </label>
                <div className="flex gap-3 items-center">
                  <label
                    className={`px-4 py-3 rounded-xl border border-dashed flex items-center gap-2 cursor-pointer transition-all ${
                      isLight ? 'bg-slate-50 hover:bg-blue-50 border-slate-300' : 'bg-white/3 hover:bg-white/5 border-white/15'
                    }`}
                  >
                    <UploadCloud className="w-5 h-5 text-blue-500" />
                    <span className="text-xs font-bold">Select Footage / Image</span>
                    <input
                      type="file"
                      multiple
                      accept="video/mp4,video/webm,image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                  <span className="text-[11px] text-slate-400">MP4, WebM, JPEG, PNG supported up to 50MB</span>
                </div>

                {/* Evidence items list */}
                {evidenceFiles.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    {evidenceFiles.map((f, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl border flex items-center justify-between ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/8'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {f.type.startsWith('video') ? (
                            <Video className="w-5 h-5 text-purple-400 shrink-0" />
                          ) : (
                            <Camera className="w-5 h-5 text-cyan-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{f.name}</p>
                            <p className="text-[10px] text-slate-400">{(f.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="p-1 text-red-400 hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Officer Remarks */}
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Investigating Officer Remarks & Match Identification Notes *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State how the match was verified, vehicle damage/features, passenger count, direction of travel..."
                  value={officerRemarks}
                  onChange={(e) => setOfficerRemarks(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border ${
                    isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                  }`}
                />
              </div>
            </>
          ) : (
            /* ────────────────── STEP 2: MANDATORY PREVIEW BEFORE SUBMIT ────────────────── */
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm tracking-tight flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Investigation Result Review
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Review the evidence package before forwarding to the State Surveillance Admin.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-black bg-emerald-600 text-white uppercase">
                  READY
                </span>
              </div>

              <div className={`p-4 rounded-2xl border space-y-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/8'}`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Case ID</span>
                    <span className="font-bold text-blue-400 font-mono">{activeCase.caseId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Camera ID</span>
                    <span className="font-bold font-mono text-cyan-400">{cameraId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Location</span>
                    <span className="font-bold">{locationName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">AI Confidence</span>
                    <span className="font-bold text-amber-400">{aiConfidence}%</span>
                  </div>
                </div>

                <div className="text-xs pt-3 border-t border-white/8">
                  <span className="text-slate-400 block text-[10px] uppercase">Officer Remarks</span>
                  <p className="mt-1 leading-relaxed">{officerRemarks}</p>
                </div>

                <div className="pt-2 border-t border-white/8">
                  <span className="text-slate-400 block text-[10px] uppercase mb-1">
                    Attached Evidence ({evidenceFiles.length} file{evidenceFiles.length !== 1 ? 's' : ''})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {evidenceFiles.map((f, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-mono font-bold flex items-center gap-1.5">
                        <FileCheck2 className="w-3.5 h-3.5" /> {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/8'
          }`}
        >
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 ${
                isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <ArrowLeft className="w-4 h-4" /> Edit Details
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          )}

          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center gap-2"
            >
              Review Evidence <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitMutation.isPending}
              onClick={handleSubmit}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
              {submitMutation.isPending ? 'Submitting to Admin...' : 'Submit to State Admin'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

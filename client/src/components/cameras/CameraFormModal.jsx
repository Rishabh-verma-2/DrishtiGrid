import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cameraAPI } from '../../api';
import {
  X, Camera, MapPin, Video, Shield, Settings,
  Radio, Compass, Cpu, Check, AlertTriangle, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

export const GUJARAT_DISTRICTS = [
  { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Surat', lat: 21.1702, lng: 72.8311 },
  { name: 'Vadodara', lat: 22.3072, lng: 73.1812 },
  { name: 'Rajkot', lat: 22.3039, lng: 70.8022 },
  { name: 'Gandhinagar', lat: 23.2156, lng: 72.6369 },
  { name: 'Bhavnagar', lat: 21.7645, lng: 72.1519 },
  { name: 'Jamnagar', lat: 22.4707, lng: 70.0577 },
  { name: 'Junagadh', lat: 21.5222, lng: 70.4579 },
  { name: 'Anand', lat: 22.5645, lng: 72.9289 },
  { name: 'Kheda', lat: 22.7547, lng: 72.6841 },
  { name: 'Bharuch', lat: 21.7051, lng: 72.9959 },
  { name: 'Mehsana', lat: 23.5880, lng: 72.3693 },
  { name: 'Patan', lat: 23.8493, lng: 72.1266 },
  { name: 'Banaskantha', lat: 24.1724, lng: 72.4346 },
  { name: 'Sabarkantha', lat: 23.5977, lng: 72.9698 },
  { name: 'Kutch', lat: 23.2420, lng: 69.6669 },
  { name: 'Surendranagar', lat: 22.7278, lng: 71.6370 },
  { name: 'Morbi', lat: 22.8120, lng: 70.8384 },
  { name: 'Amreli', lat: 21.6032, lng: 71.2221 },
  { name: 'Gir Somnath', lat: 20.9042, lng: 70.3670 },
  { name: 'Porbandar', lat: 21.6417, lng: 69.6293 },
  { name: 'Devbhumi Dwarka', lat: 22.2442, lng: 68.9685 },
  { name: 'Botad', lat: 22.1704, lng: 71.6664 },
  { name: 'Navsari', lat: 20.9500, lng: 72.9300 },
  { name: 'Valsad', lat: 20.5992, lng: 72.9342 },
  { name: 'Dang', lat: 20.8322, lng: 73.6896 },
  { name: 'Narmada', lat: 21.8700, lng: 73.5500 },
  { name: 'Tapi', lat: 21.1167, lng: 73.4000 },
  { name: 'Mahisagar', lat: 23.1667, lng: 73.5833 },
  { name: 'Aravalli', lat: 23.5400, lng: 73.3100 },
  { name: 'Chhota Udaipur', lat: 22.3108, lng: 74.0136 },
];

const CAMERA_TYPES = ['PTZ', 'Fixed', 'Dome', 'Bullet', 'Fisheye', 'Thermal'];
const ZONES = [
  'Traffic', 'Public Space', 'Market', 'School Zone', 'Hospital',
  'Religious Site', 'Border', 'Industrial', 'Residential', 'Other'
];
const STATUS_OPTIONS = ['online', 'offline', 'maintenance', 'fault'];
const RESOLUTIONS = ['720p', '1080p', '2K', '4K', '8K'];

export default function CameraFormModal({ camera = null, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(camera && camera._id);
  const [activeTab, setActiveTab] = useState('basic');

  const [formData, setFormData] = useState({
    cameraId: '',
    name: '',
    type: 'Fixed',
    zone: 'Traffic',
    status: 'online',
    departmentName: 'Gujarat Police Department',
    // Location
    district: 'Ahmedabad',
    city: 'Ahmedabad',
    taluka: '',
    locationName: '',
    landmark: '',
    roadName: '',
    pincode: '380001',
    latitude: 23.0225,
    longitude: 72.5714,
    // Hardware & Stream
    brand: 'Hikvision',
    model: 'HD Network Camera',
    resolution: '1080p',
    streamId: 'cam01',
    streamType: 'HLS',
    fps: 25,
    recording_history_days: 30,
    // AI
    motionDetection: true,
    crowdDetection: false,
    nightVision: true,
    anprEnabled: true,
    faceRecognition: false,
  });

  // Populate form on edit or reset on create
  useEffect(() => {
    if (camera) {
      const lat = camera.latitude ?? camera.location?.coordinates?.[1] ?? 23.0225;
      const lng = camera.longitude ?? camera.location?.coordinates?.[0] ?? 72.5714;
      const dist = camera.district || camera.address?.district || 'Ahmedabad';

      setFormData({
        cameraId: camera.cameraId || '',
        name: camera.name || camera.cameraName || '',
        type: camera.type || 'Fixed',
        zone: camera.zone || 'Traffic',
        status: camera.status || 'online',
        departmentName: camera.departmentName || 'Gujarat Police Department',
        district: dist,
        city: camera.city || camera.address?.city || dist,
        taluka: camera.taluka || camera.address?.taluka || '',
        locationName: camera.locationName || camera.address?.area || '',
        landmark: camera.landmark || '',
        roadName: camera.roadName || camera.address?.street || '',
        pincode: camera.pincode || camera.address?.pincode || '',
        latitude: lat,
        longitude: lng,
        brand: camera.brand || 'Hikvision',
        model: camera.model || camera.camera_model || 'HD Network Camera',
        resolution: camera.resolution || '1080p',
        streamId: camera.streamId || 'cam01',
        streamType: camera.streamType || 'HLS',
        fps: camera.fps || 25,
        recording_history_days: camera.recording_history_days || 30,
        motionDetection: Boolean(camera.alertsEnabled?.motionDetection ?? true),
        crowdDetection: Boolean(camera.alertsEnabled?.crowdDetection ?? false),
        nightVision: Boolean(camera.alertsEnabled?.nightVision ?? false),
        anprEnabled: Boolean(camera.alertsEnabled?.anprEnabled ?? false),
        faceRecognition: Boolean(camera.alertsEnabled?.faceRecognition ?? false),
      });
    } else {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setFormData({
        cameraId: `GJ-CAM-${randomSuffix}`,
        name: '',
        type: 'Fixed',
        zone: 'Traffic',
        status: 'online',
        departmentName: 'Gujarat Police Department',
        district: 'Ahmedabad',
        city: 'Ahmedabad',
        taluka: 'Ahmedabad City',
        locationName: '',
        landmark: '',
        roadName: '',
        pincode: '380001',
        latitude: 23.0225,
        longitude: 72.5714,
        brand: 'Hikvision',
        model: 'DS-2CD2143G2-IU',
        resolution: '1080p',
        streamId: `cam${String(Math.floor(Math.random() * 30 + 1)).padStart(2, '0')}`,
        streamType: 'HLS',
        fps: 25,
        recording_history_days: 30,
        motionDetection: true,
        crowdDetection: false,
        nightVision: true,
        anprEnabled: true,
        faceRecognition: false,
      });
    }
  }, [camera, isOpen]);

  // Handle District change -> optionally auto-set coordinates
  const handleDistrictChange = (distName) => {
    const found = GUJARAT_DISTRICTS.find((d) => d.name === distName);
    setFormData((prev) => ({
      ...prev,
      district: distName,
      city: prev.city === prev.district ? distName : prev.city,
      latitude: found ? found.lat : prev.latitude,
      longitude: found ? found.lng : prev.longitude,
    }));
  };

  const autofillCoordinates = () => {
    const found = GUJARAT_DISTRICTS.find((d) => d.name === formData.district);
    if (found) {
      setFormData((prev) => ({
        ...prev,
        latitude: found.lat,
        longitude: found.lng,
      }));
      toast.success(`Coordinates centered on ${found.name}`);
    }
  };

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: (payload) => cameraAPI.create(payload),
    onSuccess: (res) => {
      toast.success(`Camera ${res.data?.data?.cameraId || ''} registered in DB!`);
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      onClose();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to register camera in DB');
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => cameraAPI.update(id, payload),
    onSuccess: (res) => {
      toast.success(`Camera ${res.data?.data?.cameraId || ''} updated in DB!`);
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      onClose();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update camera in DB');
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Camera name is required');
      setActiveTab('basic');
      return;
    }

    if (!formData.district) {
      toast.error('District is required');
      setActiveTab('location');
      return;
    }

    const payload = {
      cameraId: formData.cameraId.trim().toUpperCase(),
      name: formData.name.trim(),
      cameraName: formData.name.trim(),
      type: formData.type,
      zone: formData.zone,
      status: formData.status,
      departmentName: formData.departmentName,
      district: formData.district,
      city: formData.city || formData.district,
      taluka: formData.taluka,
      locationName: formData.locationName,
      landmark: formData.landmark,
      roadName: formData.roadName,
      pincode: formData.pincode,
      latitude: parseFloat(formData.latitude) || 23.0225,
      longitude: parseFloat(formData.longitude) || 72.5714,
      brand: formData.brand,
      model: formData.model,
      camera_model: formData.model,
      resolution: formData.resolution,
      streamId: formData.streamId,
      streamType: formData.streamType,
      fps: parseInt(formData.fps) || 25,
      recording_history_days: parseInt(formData.recording_history_days) || 30,
      alertsEnabled: {
        motionDetection: formData.motionDetection,
        crowdDetection: formData.crowdDetection,
        nightVision: formData.nightVision,
        anprEnabled: formData.anprEnabled,
        faceRecognition: formData.faceRecognition,
      },
    };

    if (isEdit) {
      updateMutation.mutate({ id: camera._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
      <div className="bg-[#0f1422] border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between bg-[#141929]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                {isEdit ? `Edit Camera: ${camera?.cameraId || 'Details'}` : 'Register New Surveillance Camera'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEdit
                  ? 'Update camera configuration, GIS location, and AI rules in MongoDB'
                  : 'Add a new camera node to the DrishtiGrid surveillance network'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#111625] px-6 gap-2">
          {[
            { id: 'basic', label: '1. Identification & Type', icon: Camera },
            { id: 'location', label: '2. Location & GIS Coordinates', icon: MapPin },
            { id: 'hardware', label: '3. Stream & Specs', icon: Video },
            { id: 'ai', label: '4. AI Triggers', icon: Cpu },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  active
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-500/10'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: BASIC IDENTIFICATION */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Camera ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.cameraId}
                    onChange={(e) => setFormData({ ...formData, cameraId: e.target.value })}
                    placeholder="e.g. GJ-DEMO-CAM-0050"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Unique network identifier</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Camera Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. SG Highway Bridge Cam 02"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Descriptive public name</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Camera Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    {CAMERA_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Surveillance Zone</label>
                  <select
                    value={formData.zone}
                    onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    {ZONES.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Department / Authority</label>
                <input
                  type="text"
                  value={formData.departmentName}
                  onChange={(e) => setFormData({ ...formData, departmentName: e.target.value })}
                  placeholder="e.g. Gujarat Police Department"
                  className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* TAB 2: LOCATION & GIS COORDINATES */}
          {activeTab === 'location' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    District <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formData.district}
                    onChange={(e) => handleDistrictChange(e.target.value)}
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    {GUJARAT_DISTRICTS.map((d) => (
                      <option key={d.name} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">City / Town</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Ahmedabad"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Taluka / Sub-division</label>
                  <input
                    type="text"
                    value={formData.taluka}
                    onChange={(e) => setFormData({ ...formData, taluka: e.target.value })}
                    placeholder="e.g. Ahmedabad City"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Location / Area Name</label>
                  <input
                    type="text"
                    value={formData.locationName}
                    onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                    placeholder="e.g. Maninagar Railway Station Bridge"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Landmark / Road Name</label>
                  <input
                    type="text"
                    value={formData.roadName}
                    onChange={(e) => setFormData({ ...formData, roadName: e.target.value })}
                    placeholder="e.g. Ring Road Junction"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Coordinates Section */}
              <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" /> GIS Coordinates (Leaflet & MongoDB 2dsphere)
                  </span>
                  <button
                    type="button"
                    onClick={autofillCoordinates}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Center on {formData.district}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Latitude <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="23.0225"
                      className="w-full bg-[#161c2e] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Longitude <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="72.5714"
                      className="w-full bg-[#161c2e] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Pincode</label>
                    <input
                      type="text"
                      value={formData.pincode}
                      onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                      placeholder="380001"
                      className="w-full bg-[#161c2e] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STREAM & SPECS */}
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Stream Channel ID</label>
                  <input
                    type="text"
                    value={formData.streamId}
                    onChange={(e) => setFormData({ ...formData, streamId: e.target.value })}
                    placeholder="e.g. cam01, cam02"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">RTSP/HLS feed gateway channel</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Stream Protocol</label>
                  <select
                    value={formData.streamType}
                    onChange={(e) => setFormData({ ...formData, streamType: e.target.value })}
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="HLS">HLS (HTTP Live Streaming)</option>
                    <option value="RTSP">RTSP (Real-Time Streaming Protocol)</option>
                    <option value="WebRTC">WebRTC (Low Latency)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Hardware Brand</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Hikvision, Dahua, CP Plus"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Model</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="DS-2CD2143G2-IU"
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Resolution</label>
                  <select
                    value={formData.resolution}
                    onChange={(e) => setFormData({ ...formData, resolution: e.target.value })}
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    {RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">FPS (Frames per second)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={formData.fps}
                    onChange={(e) => setFormData({ ...formData, fps: e.target.value })}
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Recording Retention (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={formData.recording_history_days}
                    onChange={(e) => setFormData({ ...formData, recording_history_days: e.target.value })}
                    className="w-full bg-[#161c2e] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI & ALERTS */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20 text-xs font-medium text-purple-700 dark:text-purple-300">
                Configure automated edge analytics, computer vision triggers, and automated incident alert generation for this camera.
              </div>

              <div className="space-y-3">
                {[
                  { key: 'motionDetection', label: 'Motion Detection', desc: 'Detect suspicious motion in restricted zones' },
                  { key: 'anprEnabled', label: 'Automatic Number Plate Recognition (ANPR)', desc: 'Scan and log vehicle registration plates' },
                  { key: 'nightVision', label: 'Night Vision / IR Enhanced', desc: 'Auto infrared switching for low-light conditions' },
                  { key: 'crowdDetection', label: 'Crowd Density Monitoring', desc: 'Trigger alerts on excessive crowd gatherings' },
                  { key: 'faceRecognition', label: 'Facial Recognition Filter', desc: 'Cross-reference faces with wanted police databases' },
                ].map((feature) => (
                  <label
                    key={feature.key}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#141929] border border-slate-200 dark:border-white/5 hover:border-blue-400 dark:hover:border-white/15 cursor-pointer transition-all"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{feature.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{feature.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData[feature.key]}
                      onChange={(e) => setFormData({ ...formData, [feature.key]: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Form Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-white/8 flex items-center justify-between">
            <div className="flex gap-2">
              {activeTab !== 'basic' && (
                <button
                  type="button"
                  onClick={() => {
                    const tabs = ['basic', 'location', 'hardware', 'ai'];
                    const idx = tabs.indexOf(activeTab);
                    if (idx > 0) setActiveTab(tabs[idx - 1]);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5 transition-all cursor-pointer"
                >
                  Previous Step
                </button>
              )}
              {activeTab !== 'ai' && (
                <button
                  type="button"
                  onClick={() => {
                    const tabs = ['basic', 'location', 'hardware', 'ai'];
                    const idx = tabs.indexOf(activeTab);
                    if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 border border-slate-200 dark:border-white/5 transition-all cursor-pointer"
                >
                  Next Step
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving to DB...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {isEdit ? 'Save Camera Changes' : 'Register Camera in DB'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

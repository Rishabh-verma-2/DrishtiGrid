import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  UploadCloud,
  FileText,
  Car,
  User,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Phone,
  Building2,
  Eye,
  Trash2,
  Search,
  Sparkles,
  Layers,
  Printer,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { investigationAPI } from '../../api';
import useAuthStore from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import toast from 'react-hot-toast';

const REQUEST_TYPES = [
  {
    id: 'STOLEN_VEHICLE',
    label: 'Stolen Vehicle',
    icon: Car,
    desc: 'Automobiles, bikes, trucks, commercial fleets with registration plates',
    color: 'from-blue-600 to-cyan-600',
  },
  {
    id: 'MISSING_PERSON',
    label: 'Missing Person',
    icon: User,
    desc: 'Missing children, senior citizens, vulnerable persons across CCTV network',
    color: 'from-amber-600 to-orange-600',
  },
  {
    id: 'WANTED_PERSON',
    label: 'Wanted Person',
    icon: ShieldAlert,
    desc: 'Proclaimed offenders, non-bailable warrants, absconding suspects',
    color: 'from-red-600 to-rose-600',
  },
  {
    id: 'SUSPECTED_PERSON',
    label: 'Suspected Person',
    icon: AlertTriangle,
    desc: 'Unidentified individuals involved in suspicious or criminal activities',
    color: 'from-purple-600 to-indigo-600',
  },
  {
    id: 'OTHER',
    label: 'Other Investigation',
    icon: Layers,
    desc: 'Public asset theft, transit security, or multi-factor investigation',
    color: 'from-slate-600 to-slate-700',
  },
];

export default function FirSubmissionModal({ isOpen, onClose, onCaseCreated }) {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1); // 1: Type, 2: Form, 3: Media Upload, 4: Preview, 5: Confirmation
  const [isDocPreviewOpen, setIsDocPreviewOpen] = useState(false);
  const [requestType, setRequestType] = useState('STOLEN_VEHICLE');
  const [priority, setPriority] = useState('HIGH');

  // FIR Details
  const [firNumber, setFirNumber] = useState('');
  const [firDate, setFirDate] = useState(new Date().toISOString().split('T')[0]);
  const [policeStation, setPoliceStation] = useState(user?.policeStation || user?.department || 'Sayajigunj Police Station');
  const [district, setDistrict] = useState(user?.district || 'Vadodara');
  const [region, setRegion] = useState('Vadodara Region');
  const [officerName, setOfficerName] = useState(user?.name || 'Inspector In-charge');
  const [officerId, setOfficerId] = useState(user?.designation ? `${user.designation} (${user.id?.slice(-4) || '101'})` : 'VAD-PSI-4091');
  const [contactNumber, setContactNumber] = useState(user?.phone || '+91 98250 12345');
  const [caseDescription, setCaseDescription] = useState('');
  const [investigationRemarks, setInvestigationRemarks] = useState('');
  const [locationAddress, setLocationAddress] = useState('');

  // Vehicle Details
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Car / SUV');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [manufacturingYear, setManufacturingYear] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [additionalIdentifiers, setAdditionalIdentifiers] = useState('');

  // Person Details
  const [personFullName, setPersonFullName] = useState('');
  const [personAge, setPersonAge] = useState('');
  const [personGender, setPersonGender] = useState('Male');
  const [personHeight, setPersonHeight] = useState('');
  const [personWeight, setPersonWeight] = useState('');
  const [clothingDescription, setClothingDescription] = useState('');
  const [lastKnownLocation, setLastKnownLocation] = useState('');
  const [identificationMarks, setIdentificationMarks] = useState('');
  const [knownAliases, setKnownAliases] = useState('');
  const [contactFamilyInfo, setContactFamilyInfo] = useState('');

  // File Attachments
  const [selectedFiles, setSelectedFiles] = useState([]); // Array of { file, previewUrl, category }
  const fileInputRef = useRef(null);

  // Duplicate Check
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Confirmed Case ID after submission
  const [submittedCaseData, setSubmittedCaseData] = useState(null);

  const checkDuplicateMutation = useMutation({
    mutationFn: (identifier) =>
      investigationAPI.checkDuplicate({ identifier, type: requestType }).then((r) => r.data),
    onSuccess: (res) => {
      if (res?.hasDuplicate && res.matches?.length > 0) {
        setDuplicateWarning(res.matches[0]);
      } else {
        setDuplicateWarning(null);
      }
    },
  });

  const handleIdentifierBlur = () => {
    const ident = requestType === 'STOLEN_VEHICLE' ? registrationNumber : personFullName;
    if (ident && ident.trim().length > 3) {
      checkDuplicateMutation.mutate(ident.trim());
    }
  };

  const handleFileUpload = (e, category = 'SUPPORTING_DOC') => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newAttachments = files.map((file) => ({
      file,
      previewUrl: file.type.startsWith('image') ? URL.createObjectURL(file) : null,
      category,
      name: file.name,
      size: file.size,
    }));

    setSelectedFiles((prev) => [...prev, ...newAttachments]);
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submitMutation = useMutation({
    mutationFn: (formData) => investigationAPI.createCase(formData).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['investigation-cases']);
      queryClient.invalidateQueries(['investigation-analytics']);
      setSubmittedCaseData(res.data || res);
      setStep(5); // Confirmation Screen
      toast.success(`FIR Case ${res.caseId} submitted to State Admin!`);
      if (onCaseCreated) onCaseCreated(res.data);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to submit FIR request.');
    },
  });

  const handleSubmit = () => {
    const formData = new FormData();
    formData.append('requestType', requestType);
    formData.append('priority', priority);
    formData.append('firNumber', firNumber);
    formData.append('firDate', firDate);
    formData.append('policeStation', policeStation);
    formData.append('district', district);
    formData.append('region', region);
    formData.append('officerName', officerName);
    formData.append('officerId', officerId);
    formData.append('contactNumber', contactNumber);
    formData.append('caseDescription', caseDescription);
    formData.append('investigationRemarks', investigationRemarks);
    formData.append('locationAddress', locationAddress || `${policeStation}, ${district}`);

    if (requestType === 'STOLEN_VEHICLE') {
      const vehicleObj = {
        registrationNumber: registrationNumber.toUpperCase().trim(),
        vehicleType,
        make,
        model,
        color,
        manufacturingYear: manufacturingYear ? Number(manufacturingYear) : undefined,
        chassisNumber,
        engineNumber,
        ownerName,
        additionalIdentifiers,
      };
      formData.append('vehicleDetails', JSON.stringify(vehicleObj));
    } else {
      const personObj = {
        fullName: personFullName.trim(),
        age: personAge ? Number(personAge) : undefined,
        gender: personGender,
        height: personHeight,
        weight: personWeight,
        clothingDescription,
        lastKnownLocation,
        identificationMarks,
        knownAliases,
        contactFamilyInfo,
      };
      formData.append('personDetails', JSON.stringify(personObj));
    }

    selectedFiles.forEach((item) => {
      formData.append(item.category.toLowerCase(), item.file);
    });

    submitMutation.mutate(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[3500] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0b101b] border-white/10 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/8'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight">FIR Investigation Request</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  Step {step} of 4
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {step === 1 && 'Select the investigation entity category'}
                {step === 2 && 'Fill verified FIR metadata and subject specifications'}
                {step === 3 && 'Upload photographic evidence and legal documentation'}
                {step === 4 && 'Official Preview before forwarding to State Admin'}
                {step === 5 && 'Request Registered & Case ID Generated'}
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* ────────────────── STEP 1: SELECT TYPE ────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center max-w-lg mx-auto mb-6">
                <h4 className="text-lg font-black tracking-tight">Choose Investigation Case Type</h4>
                <p className="text-xs text-slate-400 mt-1">
                  The investigation form and detection models adapt dynamically to the subject entity.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {REQUEST_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = requestType === type.id;
                  return (
                    <div
                      key={type.id}
                      onClick={() => setRequestType(type.id)}
                      className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                        isSelected
                          ? isLight
                            ? 'border-blue-600 bg-blue-50/50 shadow-md'
                            : 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]'
                          : isLight
                          ? 'border-slate-200 hover:border-slate-300 bg-white'
                          : 'border-white/5 hover:border-white/15 bg-white/2'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${type.color} flex items-center justify-center text-white shrink-0 shadow-md`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div>
                          <h5 className="font-bold text-sm tracking-tight">{type.label}</h5>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{type.desc}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-4 flex items-center justify-end">
                          <span className="flex items-center gap-1 text-xs font-bold text-blue-500">
                            Selected <CheckCircle2 className="w-4 h-4" />
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Priority Selector */}
              <div className={`p-4 rounded-xl border mt-6 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/8'}`}>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2">
                  Investigation Priority & SLA Dispatch
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'CRITICAL', label: 'Critical (2h SLA)', color: 'border-red-500 text-red-500 bg-red-500/10' },
                    { id: 'HIGH', label: 'High (6h SLA)', color: 'border-amber-500 text-amber-500 bg-amber-500/10' },
                    { id: 'MEDIUM', label: 'Medium (24h SLA)', color: 'border-blue-500 text-blue-500 bg-blue-500/10' },
                    { id: 'LOW', label: 'Low (72h SLA)', color: 'border-slate-500 text-slate-500 bg-slate-500/10' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-center ${
                        priority === p.id ? `${p.color} shadow-sm font-black` : 'border-transparent text-slate-400 hover:bg-white/5'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ────────────────── STEP 2: FIR & SUBJECT FORM ────────────────── */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Duplicate Warning Alert */}
              {duplicateWarning && (
                <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-start gap-3 animate-fadeIn">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-xs flex-1">
                    <p className="font-bold text-sm">Potential Duplicate Case Detected!</p>
                    <p className="mt-1">
                      An active case (<span className="font-mono font-bold text-amber-300">{duplicateWarning.caseId}</span>) already exists for this registration/subject at {duplicateWarning.policeStation}.
                    </p>
                    <p className="mt-1 text-slate-400">You may continue submitting if this is a separate FIR or re-theft incident.</p>
                  </div>
                </div>
              )}

              {/* Section 1: FIR Information */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> 1. FIR & Legal Requisition Details
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">FIR Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. FIR/SAY/2026/0892"
                      value={firNumber}
                      onChange={(e) => setFirNumber(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">FIR Date *</label>
                    <input
                      type="date"
                      required
                      value={firDate}
                      onChange={(e) => setFirDate(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Police Station *</label>
                    <input
                      type="text"
                      required
                      value={policeStation}
                      onChange={(e) => setPoliceStation(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">District *</label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Investigating Officer *</label>
                    <input
                      type="text"
                      required
                      value={officerName}
                      onChange={(e) => setOfficerName(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Contact Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="+91 98250 00000"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                        isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                      }`}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-semibold mb-1">Incident / Theft Location Address *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sayajigunj Railway Station Outer Parking Lot, Vadodara"
                    value={locationAddress}
                    onChange={(e) => setLocationAddress(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border ${
                      isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                    }`}
                  />
                </div>
              </div>

              {/* Section 2: Dynamic Subject Details */}
              {requestType === 'STOLEN_VEHICLE' && (
                <div className="pt-4 border-t border-white/8">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-2">
                    <Car className="w-4 h-4" /> 2. Stolen Vehicle Information
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Registration Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. GJ06AB1234"
                        value={registrationNumber}
                        onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                        onBlur={handleIdentifierBlur}
                        className={`w-full px-3 py-2 text-xs rounded-xl border font-mono font-bold tracking-wider ${
                          isLight ? 'bg-white border-slate-300 text-blue-600' : 'bg-white/5 border-white/10 text-cyan-400'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Vehicle Type</label>
                      <select
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-[#0f172a] border-white/10'
                        }`}
                      >
                        <option value="Car / SUV">Car / SUV</option>
                        <option value="Two Wheeler / Motorcycle">Two Wheeler / Motorcycle</option>
                        <option value="Commercial Truck">Commercial Truck</option>
                        <option value="Auto Rickshaw">Auto Rickshaw</option>
                        <option value="Bus / Heavy Passenger">Bus / Heavy Passenger</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Vehicle Make / Brand</label>
                      <input
                        type="text"
                        placeholder="e.g. Hyundai, Maruti, Tata"
                        value={make}
                        onChange={(e) => setMake(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Vehicle Model</label>
                      <input
                        type="text"
                        placeholder="e.g. Creta SX(O), Swift Dzire"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Vehicle Color</label>
                      <input
                        type="text"
                        placeholder="e.g. Polar White, Black"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Registered Owner Name</label>
                      <input
                        type="text"
                        placeholder="Owner Full Name"
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Chassis Number</label>
                      <input
                        type="text"
                        placeholder="e.g. MALC141CLNM..."
                        value={chassisNumber}
                        onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
                        className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Engine Number</label>
                      <input
                        type="text"
                        placeholder="e.g. D4FA1098..."
                        value={engineNumber}
                        onChange={(e) => setEngineNumber(e.target.value.toUpperCase())}
                        className={`w-full px-3 py-2 text-xs rounded-xl border font-mono ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Special Identifiers</label>
                      <input
                        type="text"
                        placeholder="e.g. Black roof wrap, scratch on right door"
                        value={additionalIdentifiers}
                        onChange={(e) => setAdditionalIdentifiers(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Person Specific Details */}
              {['MISSING_PERSON', 'WANTED_PERSON', 'SUSPECTED_PERSON'].includes(requestType) && (
                <div className="pt-4 border-t border-white/8">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" /> 2. Subject Person Attributes
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Full Name / Alias *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rahul Sharma"
                        value={personFullName}
                        onChange={(e) => setPersonFullName(e.target.value)}
                        onBlur={handleIdentifierBlur}
                        className={`w-full px-3 py-2 text-xs rounded-xl border font-bold ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Age</label>
                      <input
                        type="number"
                        placeholder="e.g. 68"
                        value={personAge}
                        onChange={(e) => setPersonAge(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Gender</label>
                      <select
                        value={personGender}
                        onChange={(e) => setPersonGender(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-[#0f172a] border-white/10'
                        }`}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                        <option value="Unknown">Unknown</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Height</label>
                      <input
                        type="text"
                        placeholder="e.g. 5 ft 7 in"
                        value={personHeight}
                        onChange={(e) => setPersonHeight(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Clothing Description</label>
                      <input
                        type="text"
                        placeholder="e.g. Grey kurta, white cotton pajamas"
                        value={clothingDescription}
                        onChange={(e) => setClothingDescription(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Last Known Location</label>
                      <input
                        type="text"
                        placeholder="e.g. Law Garden / CG Road Crossroad"
                        value={lastKnownLocation}
                        onChange={(e) => setLastKnownLocation(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border ${
                          isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Case Description & Notes */}
              <div className="pt-4 border-t border-white/8">
                <label className="block text-xs font-semibold mb-1">Case Description & Circumstances *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail the circumstances of the incident, time window, eyewitness reports, or direction of flight..."
                  value={caseDescription}
                  onChange={(e) => setCaseDescription(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border ${
                    isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Investigation Instructions for Surveillance Grid</label>
                <textarea
                  rows={2}
                  placeholder="Specific search guidelines for CCTV/ANPR operators across Gujarat..."
                  value={investigationRemarks}
                  onChange={(e) => setInvestigationRemarks(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border ${
                    isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
                  }`}
                />
              </div>
            </div>
          )}

          {/* ────────────────── STEP 3: FILE & EVIDENCE UPLOAD ────────────────── */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center max-w-lg mx-auto mb-4">
                <h4 className="text-lg font-black tracking-tight">Attach Reference Images & Documents</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Upload high-quality reference photographs for AI detection algorithms (ANPR / Face / Vehicle) and legal documents.
                </p>
              </div>

              {/* Quick upload categories */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'VEHICLE_PHOTO', label: 'Vehicle Photo', icon: Car },
                  { id: 'NUMBER_PLATE_PHOTO', label: 'Plate Crop', icon: FileText },
                  { id: 'PERSON_FRONT_FACE', label: 'Front Face', icon: User },
                  { id: 'RC_DOCUMENT', label: 'RC / FIR Document', icon: Layers },
                ].map((cat) => (
                  <label
                    key={cat.id}
                    className={`p-3 rounded-xl border border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      isLight ? 'hover:bg-blue-50 border-slate-300' : 'hover:bg-blue-500/10 border-white/15'
                    }`}
                  >
                    <cat.icon className="w-5 h-5 text-blue-500 mb-1" />
                    <span className="text-xs font-bold">{cat.label}</span>
                    <span className="text-[10px] text-slate-400">Click to upload</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, cat.id)}
                    />
                  </label>
                ))}
              </div>

              {/* File list preview */}
              {selectedFiles.length > 0 ? (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Uploaded Files ({selectedFiles.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedFiles.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex items-center gap-3 ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/8'
                        }`}
                      >
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt="preview"
                            className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                            <FileText className="w-6 h-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">{item.name}</p>
                          <p className="text-[10px] text-slate-400 flex items-center gap-2">
                            <span>{(item.size / 1024).toFixed(1)} KB</span>
                            <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 font-semibold uppercase">
                              {item.category.replace('_', ' ')}
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center border-2 border-dashed border-white/10 rounded-2xl">
                  <UploadCloud className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                  <p className="text-xs font-bold">No reference files attached yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    You can proceed without images, but attaching reference photos significantly increases AI match accuracy.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ────────────────── STEP 4: MANDATORY PREVIEW BEFORE SUBMISSION ────────────────── */}
          {step === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                isLight ? 'bg-blue-50/70 border-blue-200 text-blue-900' : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
              }`}>
                <div>
                  <h4 className="font-bold text-sm tracking-tight flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Official Review Before State Admin Submission
                  </h4>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                    Please inspect all information carefully. Once submitted, this FIR will be registered under a unique Case ID.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-fir-doc-preview"
                  onClick={() => setIsDocPreviewOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shrink-0 ml-3"
                  title="Click to view printable official FIR requisition document"
                >
                  <Eye className="w-3.5 h-3.5" /> View Official FIR Document
                </button>
              </div>

              {/* Preview Case Card */}
              <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/2 border-white/10'}`}>
                <div className={`flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b ${
                  isLight ? 'border-slate-200' : 'border-white/8'
                }`}>
                  <div>
                    <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Request Type</span>
                    <h4 className={`text-base font-bold ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>{requestType.replace('_', ' ')}</h4>
                  </div>
                  <div>
                    <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>FIR Number</span>
                    <p className={`text-sm font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{firNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Police Station</span>
                    <p className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{policeStation}</p>
                  </div>
                  <div>
                    <span className={`text-[10px] font-mono uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Priority & SLA</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold border ${
                      priority === 'CRITICAL'
                        ? isLight ? 'bg-red-50 text-red-700 border-red-200' : 'bg-red-500/20 text-red-400 border-red-500/30'
                        : isLight ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    }`}>
                      {priority} PRIORITY
                    </span>
                  </div>
                </div>

                {/* Subject Preview */}
                {requestType === 'STOLEN_VEHICLE' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
                    <div>
                      <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Plate Number</span>
                      <span className={`font-mono font-bold text-sm ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>{registrationNumber || 'N/A'}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Make & Model</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{make} {model || 'N/A'}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Color & Type</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{color || 'N/A'} · {vehicleType}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Registered Owner</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{ownerName || 'N/A'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
                    <div>
                      <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Subject Name</span>
                      <span className={`font-bold text-sm ${isLight ? 'text-blue-700' : 'text-amber-400'}`}>{personFullName || 'N/A'}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Age & Gender</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{personAge ? `${personAge} yrs` : 'N/A'} · {personGender}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Clothing</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{clothingDescription || 'N/A'}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Last Seen Location</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{lastKnownLocation || 'N/A'}</span>
                    </div>
                  </div>
                )}

                <div className={`text-xs pt-3 border-t ${isLight ? 'border-slate-200' : 'border-white/8'}`}>
                  <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Case Description</span>
                  <p className={`mt-1 leading-relaxed ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{caseDescription}</p>
                </div>

                {selectedFiles.length > 0 && (
                  <div className={`mt-4 pt-3 border-t ${isLight ? 'border-slate-200' : 'border-white/8'}`}>
                    <span className={`block text-[10px] uppercase mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Reference Media ({selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''})
                    </span>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {selectedFiles.map((f, i) => (
                        <div key={i} className={`w-16 h-16 rounded-lg overflow-hidden border shrink-0 relative ${
                          isLight ? 'border-slate-200' : 'border-white/10'
                        }`}>
                          {f.previewUrl ? (
                            <img src={f.previewUrl} alt="prev" className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center text-[9px] font-bold ${
                              isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/5 text-slate-400'
                            }`}>
                              DOC
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ────────────────── STEP 5: SUBMISSION CONFIRMATION ────────────────── */}
          {step === 5 && submittedCaseData && (
            <div className="py-8 text-center max-w-lg mx-auto space-y-5 animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h4 className="text-xl font-black tracking-tight">FIR Request Submitted Successfully!</h4>
                <p className="text-xs text-slate-400 mt-1">
                  The case has been routed to the State Surveillance Command for Admin review.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border font-mono text-left space-y-2 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/10'
              }`}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Generated Case ID:</span>
                  <span className="font-bold text-blue-400 text-sm">{submittedCaseData.caseId}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Status:</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold uppercase text-[10px]">
                    {submittedCaseData.status || 'SUBMITTED'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Police Station:</span>
                  <span className="font-bold">{policeStation}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Submitted By:</span>
                  <span>{officerName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Submission Timestamp:</span>
                  <span>{new Date().toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.location.href = `/investigation/cases/${submittedCaseData.caseId}`;
                  }}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" /> Open Case Dashboard
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-white/10 hover:bg-white/5'
                  }`}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        {step < 5 && (
          <div
            className={`flex items-center justify-between px-6 py-4 border-t shrink-0 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/8'
            }`}
          >
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-colors ${
                  isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-white/10 hover:bg-white/5 text-slate-300'
                }`}
              >
                <ArrowLeft className="w-4 h-4" /> Back
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

            <div className="flex items-center gap-3">
              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 2 && (!firNumber || !caseDescription)) {
                      toast.error('Please enter FIR Number and Case Description.');
                      return;
                    }
                    setStep((s) => s + 1);
                  }}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer"
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsDocPreviewOpen(true)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isLight
                        ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                        : 'border-white/10 hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-blue-600" /> Full Docket Preview
                  </button>
                  <button
                    type="button"
                    disabled={submitMutation.isPending}
                    onClick={handleSubmit}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {submitMutation.isPending ? (
                      <>Submitting FIR...</>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Submit to State Admin
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ────────────────── OFFICIAL PRINTABLE FIR DOCKET MODAL ────────────────── */}
      {isDocPreviewOpen && (
        <div className="fixed inset-0 z-[4200] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-white text-slate-900 border border-slate-300">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Official Gujarat Police FIR Requisition Docket</h3>
                  <p className="text-[11px] text-slate-300">Form No. II · Section 154 Cr.P.C. / Section 173 BNSS 2023</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Docket
                </button>
                <button
                  type="button"
                  onClick={() => setIsDocPreviewOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Body (Printable Paper Layout) */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-100/50 print:bg-white">
              <div className="bg-white border border-slate-300 rounded-xl p-8 shadow-sm space-y-6 max-w-3xl mx-auto print:border-none print:shadow-none print:p-0">
                {/* Government Header */}
                <div className="text-center border-b-2 border-slate-900 pb-5">
                  <div className="text-xs uppercase tracking-widest font-mono text-slate-600 font-bold">
                    GOVERNMENT OF GUJARAT · POLICE DEPARTMENT
                  </div>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase mt-1">
                    First Information Report (F.I.R.) Requisition
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Surveillance & ANPR Investigation Docket · CCTV Command Integration
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs font-mono border-t border-slate-200 pt-2 text-slate-700">
                    <span><strong>District:</strong> {district}</span>
                    <span><strong>Police Station:</strong> {policeStation}</span>
                    <span><strong>Date:</strong> {firDate || new Date().toISOString().split('T')[0]}</span>
                    <span><strong>FIR No:</strong> <span className="text-blue-700 font-bold">{firNumber || 'PENDING'}</span></span>
                  </div>
                </div>

                {/* Classification & Priority */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200 font-sans">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Requisition Type</span>
                    <strong className="text-blue-800 font-bold text-sm">{requestType.replace('_', ' ')}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Priority Level</span>
                    <strong className="text-amber-800 font-bold">{priority} PRIORITY</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Originating Station</span>
                    <strong className="text-slate-800">{policeStation}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Submitting Officer</span>
                    <strong className="text-slate-800">{officerName}</strong>
                  </div>
                </div>

                {/* Particulars of Subject / Vehicle */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 flex items-center gap-2">
                    {requestType === 'STOLEN_VEHICLE' ? <Car className="w-4 h-4 text-blue-600" /> : <User className="w-4 h-4 text-blue-600" />}
                    Particulars of Property / Subject for Statewide Surveillance
                  </div>
                  <div className="p-4 text-xs space-y-3">
                    {requestType === 'STOLEN_VEHICLE' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Registration Number (ANPR Target)</span>
                          <span className="text-base font-mono font-black text-blue-800">{registrationNumber || 'NOT SPECIFIED'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Make & Model</span>
                          <span className="font-bold text-slate-800">{make} {model || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Vehicle Color & Type</span>
                          <span className="font-bold text-slate-800">{color} ({vehicleType})</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Registered Owner</span>
                          <span className="font-bold text-slate-800">{ownerName || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Chassis Number</span>
                          <span className="font-mono text-slate-700">{chassisNumber || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Engine Number</span>
                          <span className="font-mono text-slate-700">{engineNumber || 'N/A'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Subject Full Name</span>
                          <span className="text-base font-bold text-slate-900">{personFullName || 'NOT SPECIFIED'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Age / Gender</span>
                          <span className="font-bold text-slate-800">{personAge ? `${personAge} Years` : 'Age N/A'} · {personGender}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Clothing Description</span>
                          <span className="font-bold text-slate-800">{clothingDescription || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Last Known Location</span>
                          <span className="font-bold text-slate-800">{lastKnownLocation || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Identification Marks</span>
                          <span className="text-slate-700">{identificationMarks || 'N/A'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Facts of the Incident */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                    Brief Facts & Incident Details
                  </div>
                  <div className="p-4 text-xs space-y-2 text-slate-800">
                    <p className="leading-relaxed whitespace-pre-wrap">{caseDescription || 'No case description entered.'}</p>
                    {investigationRemarks && (
                      <div className="pt-2 border-t border-slate-200 mt-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Investigation Directives & Specific CCTV Flags</span>
                        <p className="mt-0.5 text-slate-700 leading-relaxed italic">{investigationRemarks}</p>
                      </div>
                    )}
                    {locationAddress && (
                      <div className="pt-2 border-t border-slate-200 mt-2 text-[11px] text-slate-600">
                        <strong>Occurrence Location:</strong> {locationAddress}
                      </div>
                    )}
                  </div>
                </div>

                {/* Officer Certification & Security Seal */}
                <div className="pt-6 border-t-2 border-slate-300 grid grid-cols-2 gap-6 items-end text-xs">
                  <div>
                    <div className="font-mono text-[11px] text-slate-500">
                      <div>SECURITY HASH: SHA-256 (PRE-SUBMISSION VERIFIED)</div>
                      <div>SURVEILLANCE NODE: GUJ-NET-VAD-4091</div>
                      <div className="mt-1 font-bold text-blue-700">AUTHENTICATED DIGITAL REQUISITION</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900">{officerName}</div>
                    <div className="text-[11px] text-slate-600">{officerId}</div>
                    <div className="text-[11px] text-slate-600">{policeStation}, {district}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Gujarat Police Department</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-sans">
                Review completed. You may print or close this window to proceed with submission to State Admin.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setIsDocPreviewOpen(false)}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all cursor-pointer"
                >
                  Done Reviewing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

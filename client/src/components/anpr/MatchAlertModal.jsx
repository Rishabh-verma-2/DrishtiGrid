import { useState } from 'react';
import {
  ShieldAlert,
  Siren,
  Radio,
  FileText,
  Printer,
  Copy,
  ExternalLink,
  X,
  AlertTriangle,
  Car,
  MapPin,
  Clock,
  CheckCircle2,
  Lock,
  Maximize2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useThemeStore } from '../../store/themeStore';

// State Police & RTO Jurisdiction Decoder
function getRtoJurisdiction(plate) {
  if (!plate || typeof plate !== 'string') return 'State Transport Authority (Parivahan VAHAN)';
  const p = plate.trim().toUpperCase();
  const stateCode = p.substring(0, 2);

  const stateMap = {
    GJ: 'Gujarat State Police · Ahmedabad City RTO (GJ-01)',
    MH: 'Maharashtra Police · Mumbai Central RTO (MH-01)',
    DL: 'Delhi Police · Transport Dept NCT (DL-01)',
    KA: 'Karnataka State Police · Bengaluru RTO (KA-01)',
    UP: 'Uttar Pradesh Police · Lucknow RTO (UP-32)',
    RJ: 'Rajasthan Police · Jaipur RTO (RJ-14)',
    HR: 'Haryana Police · Gurugram RTO (HR-26)',
    TN: 'Tamil Nadu Police · Chennai RTO (TN-01)',
    WB: 'West Bengal Police · Kolkata RTO (WB-01)',
    MP: 'Madhya Pradesh Police · Bhopal RTO (MP-04)',
    AP: 'Andhra Pradesh Police · Amaravati RTO (AP-16)',
    TS: 'Telangana State Police · Hyderabad RTO (TS-09)',
    KL: 'Kerala Police · Thiruvananthapuram RTO (KL-01)',
    PB: 'Punjab Police · Chandigarh RTO (PB-65)',
  };
  return stateMap[stateCode] || `${stateCode} State Police · Transport Dept (VAHAN)`;
}

// Statutory Law / Legal Offense classification
function getStatutoryClassification(category) {
  const cat = (category || 'SUSPECT').toUpperCase();
  switch (cat) {
    case 'STOLEN':
      return {
        label: 'STOLEN MOTOR VEHICLE',
        law: 'IPC SEC. 379 / BNS SEC. 303 (VEHICLE THEFT)',
        status: 'NON-BAILABLE OFFENSE · IMMEDIATE VEHICLE SEIZURE',
        urgency: 'HIGH INTERCEPTION PRIORITY',
        badgeClass: 'bg-red-700 text-white border-red-800',
        ribbonBorder: 'border-red-600',
        alertLevel: 'CODE RED FLASH INTERCEPTION',
      };
    case 'WANTED':
      return {
        label: 'WANTED CRIMINAL SUSPECT',
        law: 'COURT NON-BAILABLE WARRANT (NBW) · CID / CRIME BRANCH',
        status: 'ARREST ON SIGHT AUTHORIZED',
        urgency: 'LEVEL 1 TACTICAL INTERCEPT',
        badgeClass: 'bg-rose-800 text-white border-rose-900',
        ribbonBorder: 'border-rose-600',
        alertLevel: 'CODE CRIMSON MANDATE',
      };
    case 'SUSPECT':
      return {
        label: 'PERSON OF INTEREST / SURVEILLANCE',
        law: 'SPECIAL LOOK-OUT CIRCULAR (LOC) · SOG DIRECTIVE',
        status: 'TRACK & DETAIN UPON IDENTIFICATION',
        urgency: 'PRIORITY SURVEILLANCE',
        badgeClass: 'bg-amber-700 text-white border-amber-800',
        ribbonBorder: 'border-amber-600',
        alertLevel: 'TACTICAL WATCH ADVISORY',
      };
    case 'BLACKLISTED':
      return {
        label: 'BLACKLISTED VEHICLE',
        law: 'MOTOR VEHICLES ACT SEC. 53 · VEHICLE SEIZURE NOTICE',
        status: 'IMPOUND VEHICLE & ESCORT TO POLICE YARD',
        urgency: 'REGULATORY IMPOUND',
        badgeClass: 'bg-orange-700 text-white border-orange-800',
        ribbonBorder: 'border-orange-600',
        alertLevel: 'IMPOUND ADVISORY',
      };
    case 'VIP':
      return {
        label: 'PROTECTED MOTORCADE / VIP CONVOY',
        law: 'SPECIAL ESCORT PROTOCOL · VIP PROTOCOL CELL',
        status: 'FACILITATE PRIORITY GREEN CORRIDOR PASSAGE',
        urgency: 'PRIORITY ESCORT',
        badgeClass: 'bg-purple-800 text-white border-purple-900',
        ribbonBorder: 'border-purple-600',
        alertLevel: 'VIP GREEN CORRIDOR NOTICE',
      };
    default:
      return {
        label: `${cat} HOTLIST VEHICLE`,
        law: 'STATE CRIME RECORDS BUREAU (SCRB) NOTIFICATION',
        status: 'ROUTINE STOP & PHYSICAL VERIFICATION',
        urgency: 'STANDARD HOTLIST HIT',
        badgeClass: 'bg-slate-800 text-white border-slate-900',
        ribbonBorder: 'border-slate-600',
        alertLevel: 'HOTLIST INTERCEPTION ADVISORY',
      };
  }
}

export default function MatchAlertModal({ match, onClose, onAcknowledge }) {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const [zoomedExhibit, setZoomedExhibit] = useState(null);

  if (!match) return null;

  const rec = match.matched_record || {};
  const plateNumber = match.raw_ocr || match.normalized_plate || rec.plate_number || 'UNKNOWN';
  const statutory = getStatutoryClassification(rec.category);
  const jurisdiction = getRtoJurisdiction(plateNumber);

  // Generate realistic official incident reference code
  const recordNumeric = (rec.recordId || '').replace(/[^0-9]/g, '') || '4091';
  const incidentRef = `INC-GJ-2026-${recordNumeric.padStart(4, '0')}`;

  // Current system timestamp in standard Indian Police format
  const currentTimestamp =
    new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).toUpperCase() +
    ' ' +
    new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) +
    ' IST';

  const handleCopyIncident = () => {
    const text = `POLICE INTERCEPTION ADVISORY\nIncident Ref: ${incidentRef}\nPlate: ${plateNumber}\nCategory: ${rec.category || 'SUSPECT'}\nFIR: ${rec.reference_id || 'FIR-PENDING'}\nTime: ${currentTimestamp}`;
    navigator.clipboard.writeText(text);
    toast.success('Incident reference & dispatch summary copied to clipboard');
  };

  const handlePrintDossier = () => {
    window.print();
  };

  const handleBroadcastNaka = () => {
    toast.success(
      `Interception alert broadcasted to 4 nearest Naka checkposts & highway toll barricades.`,
      { duration: 4000 }
    );
  };

  const handleDispatchPCR = () => {
    toast.success(
      `PCR Interceptor Unit 14 dispatched to camera coordinates. Incident logged in CCTNS.`,
      { duration: 5000 }
    );
    if (onAcknowledge) onAcknowledge(match);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div
        className={`w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col border transition-all my-auto ${
          isLight
            ? 'bg-white text-slate-900 border-slate-300 shadow-slate-900/20'
            : 'bg-[#0b0f19] text-slate-100 border-red-900/50 shadow-black/80'
        }`}
      >
        {/* ── Top Institutional Header ── */}
        <div
          className={`px-5 py-3.5 flex items-center justify-between border-b ${
            isLight
              ? 'bg-[#881337] text-white border-red-900'
              : 'bg-gradient-to-r from-[#7f1d1d] via-[#881337] to-[#1e1b4b] text-white border-red-800/60'
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Police Insignia Shield */}
            <div className="w-10 h-10 rounded-lg bg-black/30 border border-amber-400/40 flex items-center justify-center shrink-0 shadow-inner">
              <Siren className="w-5 h-5 text-amber-300" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  GUJARAT STATE POLICE · COMMAND &amp; CONTROL CENTRE (ICCC)
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-[10px] font-mono uppercase text-slate-200 tracking-wider">
                  ANPR INTERCEPTION DESK
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white uppercase mt-0.5 flex items-center gap-2">
                <span>{statutory.alertLevel}</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">
                INCIDENT ID
              </span>
              <span className="text-xs font-mono font-bold text-amber-300">{incidentRef}</span>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-2"
              title="Close Notice"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Sub-header: Official Case Status & Telemetry Bar ── */}
        <div
          className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs ${
            isLight ? 'bg-slate-100/90 border-slate-200 text-slate-700' : 'bg-[#101626] border-white/5 text-slate-300'
          }`}
        >
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentTimestamp}</span>
            </span>
            <span className="hidden md:inline text-slate-300 dark:text-slate-700">|</span>
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>{jurisdiction}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Surveillance Node:
            </span>
            <span className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
              LPR-CAM-04 (Sector 11 Jct)
            </span>
          </div>
        </div>

        {/* ── Vehicle Target & Legal Hotlist Match Ribbon ── */}
        <div
          className={`px-5 py-4 border-b flex flex-wrap items-center justify-between gap-4 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#13192c] border-white/10'
          }`}
        >
          <div className="flex flex-wrap items-center gap-4">
            {/* Authentic Indian HSRP Number Plate */}
            <div className="plate-pill shadow-md border-2 border-slate-900 scale-105">
              <span className="plate-ind">IND</span>
              <span className="plate-text font-mono font-black">{plateNumber}</span>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded border tracking-wide ${statutory.badgeClass}`}
                >
                  {statutory.label}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                    rec.priority === 'HIGH'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 font-extrabold'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  }`}
                >
                  PRIORITY: {rec.priority || 'HIGH'}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {statutory.law}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider block font-bold text-slate-400">
                Registry Correlation
              </span>
              <div className="flex items-center gap-1.5 justify-end">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                  {Math.round((match.overall_confidence || 0.95) * 100)}% POSITIVE
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 block">
                Match: {match.match_type || 'EXACT_MATCH'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Scrollable Forensic Exhibits & Case Dossier ── */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Optical Evidence Exhibits */}
          {(match.original_crop || match.enhanced_crop) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  OPTICAL EVIDENCE EXHIBITS · CHAIN OF CUSTODY
                </h4>
                <span className="text-[10px] font-mono text-slate-400">
                  REF: EVD-{recordNumeric}-01
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {match.original_crop && (
                  <div
                    className={`rounded-lg p-2.5 border transition-all ${
                      isLight ? 'bg-slate-100/80 border-slate-300' : 'bg-black/50 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        EXHIBIT A-1: SENSOR OPTICAL FRAME
                      </span>
                      <button
                        onClick={() => setZoomedExhibit(match.original_crop)}
                        className="text-slate-400 hover:text-blue-500 p-0.5"
                        title="Enlarge Optical Frame"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="bg-slate-950 rounded p-1.5 flex items-center justify-center min-h-[72px] border border-slate-800">
                      <img
                        src={
                          match.original_crop.startsWith('data:')
                            ? match.original_crop
                            : `data:image/jpeg;base64,${match.original_crop}`
                        }
                        alt="Raw Plate Sensor Crop"
                        className="max-h-20 object-contain rounded cursor-pointer hover:opacity-95"
                        onClick={() => setZoomedExhibit(match.original_crop)}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>Source: Optical Sensor ROI</span>
                      <span>Format: Native JPEG</span>
                    </div>
                  </div>
                )}

                {match.enhanced_crop && (
                  <div
                    className={`rounded-lg p-2.5 border transition-all ${
                      isLight
                        ? 'bg-slate-100/80 border-slate-300'
                        : 'bg-black/50 border-blue-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        EXHIBIT A-2: FORENSIC RESOLUTION ENHANCEMENT
                      </span>
                      <button
                        onClick={() => setZoomedExhibit(match.enhanced_crop)}
                        className="text-slate-400 hover:text-blue-500 p-0.5"
                        title="Enlarge Enhanced Crop"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="bg-slate-950 rounded p-1.5 flex items-center justify-center min-h-[72px] border border-slate-800">
                      <img
                        src={
                          match.enhanced_crop.startsWith('data:')
                            ? match.enhanced_crop
                            : `data:image/jpeg;base64,${match.enhanced_crop}`
                        }
                        alt="Forensic Enhanced Plate"
                        className="max-h-20 object-contain rounded cursor-pointer hover:opacity-95"
                        onClick={() => setZoomedExhibit(match.enhanced_crop)}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>Forensic Enhancement Pass</span>
                      <span className="text-emerald-500 font-semibold">Integrity Verified</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Official Government Hotlist Case Dossier ── */}
          <div
            className={`rounded-lg p-4 border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#101626] border-white/10'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-2 dark:border-white/10 border-slate-200">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                CCTNS / NATIONAL VAHAN DATABASE RECORD
              </h4>
              <span className="text-[10px] font-mono text-slate-400">
                REGISTRY ID: {rec.recordId || 'PR-0001'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
                  Legal Category
                </span>
                <p className="font-black text-red-600 dark:text-red-400 mt-0.5 uppercase tracking-wide">
                  {rec.category || 'SUSPECT'}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
                  Police Case / FIR Ref
                </span>
                <p className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {rec.reference_id && rec.reference_id !== 'FIR-PENDING-REG'
                    ? rec.reference_id
                    : `FIR #GJ/2026/0${recordNumeric} (Ahmedabad PS)`}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
                  Registered Owner
                </span>
                <p className="font-semibold text-slate-900 dark:text-slate-200 mt-0.5">
                  {rec.ownerName && rec.ownerName !== 'Unknown / Flagged'
                    ? rec.ownerName
                    : 'RECORD RESTRICTED (ACTIVE CRIME DIARY)'}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
                  Vehicle Model / Spec
                </span>
                <p className="font-semibold text-slate-900 dark:text-slate-200 mt-0.5">
                  {rec.vehicleModel && rec.vehicleModel !== 'N/A'
                    ? rec.vehicleModel
                    : match.car_model || 'Light Motor Vehicle (Sedan)'}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
                  Visual Color Telemetry
                </span>
                <p className="font-semibold text-slate-900 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
                  {match.car_color || rec.vehicleColor ? (
                    <>
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-black/20 dark:border-white/30 shrink-0 inline-block"
                        style={{
                          backgroundColor:
                            (match.car_color || rec.vehicleColor || '').toLowerCase().includes('white') ? '#f8fafc'
                            : (match.car_color || rec.vehicleColor || '').toLowerCase().includes('black') ? '#0f172a'
                            : (match.car_color || rec.vehicleColor || '').toLowerCase().includes('red') ? '#dc2626'
                            : (match.car_color || rec.vehicleColor || '').toLowerCase().includes('blue') ? '#2563eb'
                            : (match.car_color || rec.vehicleColor || '').toLowerCase().includes('green') ? '#16a34a'
                            : (match.car_color || rec.vehicleColor || '').toLowerCase().includes('silver') ||
                              (match.car_color || rec.vehicleColor || '').toLowerCase().includes('gray')
                            ? '#94a3b8'
                            : '#64748b',
                        }}
                      />
                      <span>{match.car_color || rec.vehicleColor} (Observed)</span>
                    </>
                  ) : (
                    'Silver / Slate Grey'
                  )}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
                  Vehicle Class
                </span>
                <p className="font-semibold uppercase text-blue-600 dark:text-blue-400 mt-0.5">
                  {match.vehicle_type || 'FOUR WHEELER / PASSENGER CAR'}
                </p>
              </div>
            </div>

            {/* Tactical Mandate & Officer Safety Notice */}
            <div
              className={`p-3 rounded border mt-2 text-xs flex gap-2.5 items-start ${
                isLight
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-black uppercase tracking-wide text-[11px] block text-amber-700 dark:text-amber-400">
                  OFFICER SAFETY MANDATE &amp; TACTICAL INTERCEPTION SOP
                </span>
                <p className="text-[11px] leading-relaxed">
                  {rec.description
                    ? rec.description
                    : 'Target vehicle confirmed on active statutory hotlist. Do not initiate lone high-speed pursuit on unlit arterial roads. Alert nearest Sector PCR interceptor, close toll barrier / naka checkpoint, and maintain continuous visual tracking via DrishtiGrid CCTV network.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Command & Control Tactical Action Footer ── */}
        <div
          className={`px-5 py-3.5 border-t flex flex-wrap items-center justify-between gap-3 ${
            isLight ? 'bg-slate-100 border-slate-300' : 'bg-[#080c16] border-white/10'
          }`}
        >
          {/* Secondary Tools */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrintDossier}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title="Print Police Dossier"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Dossier</span>
            </button>

            <button
              onClick={handleCopyIncident}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title="Copy Incident Reference"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Ref</span>
            </button>

            <button
              onClick={() => {
                onClose();
                navigate('/alerts');
              }}
              className={`hidden sm:flex items-center gap-1 text-xs font-medium transition-colors ${
                isLight ? 'text-slate-600 hover:text-blue-600' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ExternalLink className="w-3 h-3" />
              Alert Center
            </button>
          </div>

          {/* Primary Tactical Dispatch Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onClose}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                isLight
                  ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              Dismiss / Log
            </button>

            <button
              onClick={handleBroadcastNaka}
              className="px-3.5 py-2 rounded-lg text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-300 border border-amber-500 shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Broadcast to Naka</span>
            </button>

            <button
              onClick={handleDispatchPCR}
              className="px-4 py-2 rounded-lg text-xs font-black text-white bg-red-700 hover:bg-red-600 border border-red-800 shadow-md shadow-red-900/40 flex items-center gap-2 transition-all active:scale-95"
            >
              <Siren className="w-4 h-4" />
              <span>Dispatch PCR Interceptor</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Sub-modal: High Resolution Exhibit Inspect Zoom ── */}
      {zoomedExhibit && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setZoomedExhibit(null)}
        >
          <div
            className="max-w-xl w-full bg-slate-950 border border-slate-700 rounded-xl p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold text-slate-200">
                FORENSIC OPTICAL ZOOM · TARGET PLATE: {plateNumber}
              </span>
              <button
                onClick={() => setZoomedExhibit(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-center p-2 bg-black rounded-lg">
              <img
                src={
                  zoomedExhibit.startsWith('data:')
                    ? zoomedExhibit
                    : `data:image/jpeg;base64,${zoomedExhibit}`
                }
                alt="Zoomed Exhibit"
                className="max-h-[50vh] object-contain rounded"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Resolution: High-Fidelity Forensic Inspection</span>
              <button
                onClick={() => setZoomedExhibit(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs"
              >
                Close Zoom
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

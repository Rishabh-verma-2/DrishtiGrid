import React from 'react';
import {
  X, Shield, ShieldCheck, FileText, Building2, Search, Camera,
  CheckCircle2, Send, Clock, AlertCircle, Car, User, MapPin, Calendar, Check
} from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';

/**
 * 8-Stage Legal Surveillance Workflow Stages
 */
export const STAGES = [
  {
    id: 1,
    key: 'SUBMISSION',
    title: '1. Station FIR Submission',
    desc: 'Formal FIR filing & surveillance requisition docket generation',
    dept: 'Submitting Police Station',
    icon: FileText,
  },
  {
    id: 2,
    key: 'ADMIN_REVIEW',
    title: '2. CCC Admin Verification',
    desc: 'Statutory scrutiny, penal section validation & legal compliance',
    dept: 'State Command Admin',
    icon: Shield,
  },
  {
    id: 3,
    key: 'WATCHLIST_ACTIVE',
    title: '3. Master Watchlist Activation',
    desc: 'Registration into statewide high-priority ANPR & surveillance triggers',
    dept: 'State CCC Surveillance',
    icon: ShieldCheck,
  },
  {
    id: 4,
    key: 'DISPATCH',
    title: '4. Department Dispatch',
    desc: 'Direct investigation routing to field interceptors & specialized units',
    dept: 'Traffic / Crime / Patrols',
    icon: Building2,
  },
  {
    id: 5,
    key: 'AI_SCAN',
    title: '5. AI & CCTV Continuous Scan',
    desc: 'Real-time neural optical tracking across Gujarat CCTV junction grid',
    dept: 'Statewide AI Neural Grid',
    icon: Search,
  },
  {
    id: 6,
    key: 'EVIDENCE_MATCH',
    title: '6. Sighting & Evidence Captured',
    desc: 'Candidate optical detection, license plate match or suspect sighting',
    dept: 'Field Interceptors / AI Feed',
    icon: Camera,
  },
  {
    id: 7,
    key: 'ADMIN_VALIDATION',
    title: '7. Admin Evidence Validation',
    desc: 'Supervisory verification, cryptographic integrity & timestamp signoff',
    dept: 'CCC Supervisory Officer',
    icon: CheckCircle2,
  },
  {
    id: 8,
    key: 'RESOLUTION',
    title: '8. Station Receipt & Closure',
    desc: 'Evidentiary docket transmitted back to originating station for prosecution',
    dept: 'Investigating Officer / Court',
    icon: Send,
  },
];

/**
 * Computes status of each stage (completed, current, upcoming) based on actual case status
 */
export function computeStageStatus(caseItem, stageId) {
  const status = String(caseItem?.status || 'SUBMITTED').toUpperCase();

  let currentStageNumber = 1;

  if (['CLOSED', 'RESOLVED', 'ACKNOWLEDGED'].includes(status)) {
    currentStageNumber = 8;
  } else if (['FORWARDED_TO_ORIGIN', 'ADMIN_VALIDATION'].includes(status)) {
    currentStageNumber = 7;
  } else if (['RESULT_SUBMITTED', 'MATCH_FOUND'].includes(status)) {
    currentStageNumber = 6;
  } else if (['SEARCHING'].includes(status)) {
    currentStageNumber = 5;
  } else if (['ASSIGNED_TO_DEPARTMENTS'].includes(status)) {
    currentStageNumber = 4;
  } else if (['WATCHLIST_ACTIVE', 'APPROVED'].includes(status)) {
    currentStageNumber = 3;
  } else if (['ADMIN_REVIEW'].includes(status)) {
    currentStageNumber = 2;
  } else {
    // SUBMITTED or DRAFT
    currentStageNumber = 1;
  }

  // If case is closed or resolved, all stages up to 8 are completed
  const isFullyClosed = ['CLOSED', 'RESOLVED'].includes(status);

  if (isFullyClosed || stageId < currentStageNumber) {
    return 'completed';
  }
  if (stageId === currentStageNumber) {
    return isFullyClosed ? 'completed' : 'current';
  }
  return 'upcoming';
}

/**
 * Reusable Horizontal / Grid Timeline Component
 */
export function FirStatusTimeline({ caseItem, isCompact = false }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STAGES.map((st) => {
          const state = computeStageStatus(caseItem, st.id);
          const Icon = st.icon;

          const isCompleted = state === 'completed';
          const isCurrent = state === 'current';

          return (
            <div
              key={st.id}
              className={`p-3.5 rounded-xl border relative transition-all flex flex-col justify-between ${
                isCurrent
                  ? isLight
                    ? 'bg-blue-50/80 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                    : 'bg-blue-950/30 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/40'
                  : isCompleted
                  ? isLight
                    ? 'bg-emerald-50/60 border-emerald-300'
                    : 'bg-emerald-950/20 border-emerald-500/30'
                  : isLight
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : 'bg-white/2 border-white/5 opacity-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span
                    className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      isCurrent
                        ? 'bg-blue-600 text-white'
                        : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isLight
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    Stage {st.id}
                  </span>

                  <span className="text-[10px] font-bold flex items-center gap-1">
                    {isCompleted && (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                        <Check className="w-3 h-3 stroke-[3]" /> Done
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                        In Action
                      </span>
                    )}
                    {!isCompleted && !isCurrent && (
                      <span className="text-slate-400">Pending</span>
                    )}
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      isCurrent
                        ? 'bg-blue-600 text-white'
                        : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isLight
                        ? 'bg-slate-200 text-slate-500'
                        : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h5
                      className={`text-xs font-bold leading-tight ${
                        isCurrent
                          ? isLight
                            ? 'text-blue-900 font-black'
                            : 'text-blue-200 font-black'
                          : isCompleted
                          ? isLight
                            ? 'text-emerald-950 font-bold'
                            : 'text-emerald-300 font-bold'
                          : isLight
                          ? 'text-slate-600'
                          : 'text-slate-400'
                      }`}
                    >
                      {st.title}
                    </h5>
                    <p className={`text-[10px] mt-1 leading-snug line-clamp-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {st.desc}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`mt-2.5 pt-2 border-t text-[9px] font-mono truncate ${
                  isLight ? 'border-slate-200/80 text-slate-500' : 'border-white/5 text-slate-500'
                }`}
              >
                Actor: <span className="font-semibold text-slate-700 dark:text-slate-300">{st.dept}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Full Case Docket & Status Timeline Modal
 */
export default function FirStatusTimelineModal({ caseItem, isOpen, onClose }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  if (!isOpen || !caseItem) return null;

  const isVehicle = caseItem.requestType === 'STOLEN_VEHICLE';
  const targetIdentifier = isVehicle
    ? caseItem.vehicleDetails?.registrationNumber || 'VEHICLE'
    : caseItem.personDetails?.fullName || 'PERSON';

  return (
    <div className="fixed inset-0 z-[4000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0c121e] border-white/10 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#080d16] border-white/8'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight uppercase">
                  FIR Case Lifecycle &amp; Status Timeline
                </h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  {caseItem.caseId}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Government of Gujarat · Home Department · State Command &amp; Control Centre
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isLight ? 'border-slate-200 text-slate-500 hover:bg-slate-100' : 'border-white/10 text-slate-400 hover:bg-white/10'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-sidebar-scrollbar">
          
          {/* Target Quick Brief */}
          <div
            className={`p-4 rounded-xl border grid grid-cols-1 md:grid-cols-3 gap-4 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/8'
            }`}
          >
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                FIR Information
              </span>
              <p className="text-sm font-black font-mono mt-0.5 text-blue-600 dark:text-blue-400">
                FIR #{caseItem.firNumber}
              </p>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                Station: <strong>{caseItem.policeStation}</strong>
              </p>
            </div>

            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Target Subject
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isVehicle ? (
                  <Car className="w-4 h-4 text-cyan-500" />
                ) : (
                  <User className="w-4 h-4 text-purple-500" />
                )}
                <span className="text-sm font-mono font-bold">{targetIdentifier}</span>
              </div>
              <p className={`text-xs mt-0.5 truncate ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                {isVehicle
                  ? `${caseItem.vehicleDetails?.make || ''} ${caseItem.vehicleDetails?.model || ''} (${caseItem.vehicleDetails?.color || 'Color N/A'})`
                  : `Age: ${caseItem.personDetails?.age || 'N/A'} · Gender: ${caseItem.personDetails?.gender || 'N/A'}`}
              </p>
            </div>

            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Current Case Status
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2.5 py-0.5 rounded-full font-mono text-xs font-black bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  {String(caseItem.status || 'SUBMITTED').replace(/_/g, ' ')}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Priority: {caseItem.priority || 'MEDIUM'}
                </span>
              </div>
              <p className={`text-[10px] mt-1 text-slate-500 flex items-center gap-1`}>
                <Calendar className="w-3 h-3" />
                Filed: {caseItem.firDate ? new Date(caseItem.firDate).toLocaleDateString() : 'Active'}
              </p>
            </div>
          </div>

          {/* Dynamic 8-Stage Legal Surveillance Workflow */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Clock className="w-4 h-4 text-blue-500" />
                Live Action Status Timeline (Updated Automatically)
              </h4>
              <span className="text-[10px] font-semibold text-slate-500">
                Statutory Tracking Engine
              </span>
            </div>

            <FirStatusTimeline caseItem={caseItem} />
          </div>

          {/* Description & Location */}
          <div
            className={`p-4 rounded-xl border space-y-2 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              <span>Incident Location &amp; Summary</span>
            </div>
            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              {caseItem.caseDescription || 'No detailed narrative provided.'}
            </p>
            {caseItem.locationAddress && (
              <p className="text-[11px] text-slate-500 font-mono">
                Jurisdiction: {caseItem.locationAddress} · Sector: {caseItem.district || 'Gujarat State'}
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className={`px-5 py-3.5 border-t flex items-center justify-between shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#080d16] border-white/8'
          }`}
        >
          <div className="text-[11px] text-slate-500">
            Certified Record · Electronic Case Requisition No: <strong>{caseItem.caseId}</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all cursor-pointer shadow-xs"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}

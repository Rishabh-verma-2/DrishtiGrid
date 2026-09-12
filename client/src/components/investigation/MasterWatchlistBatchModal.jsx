import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Layers,
  Send,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Car,
  User,
  Building2,
  FileText,
  Eye,
  CheckSquare,
  Square,
  MapPin,
  Calendar,
} from 'lucide-react';
import { investigationAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import toast from 'react-hot-toast';

const AVAILABLE_DEPARTMENTS = [
  {
    code: 'TRAFFIC',
    name: 'Gujarat Traffic Police',
    roleDesc: 'ANPR camera grids, traffic junctions & expressway intersections',
    icon: Car,
    badge: 'ANPR & Junctions',
  },
  {
    code: 'CRIME_BRANCH',
    name: 'Crime Branch Vadodara',
    roleDesc: 'Field forensics, tactical investigation & rapid interception',
    icon: Shield,
    badge: 'Field & Forensics',
  },
  {
    code: 'AHMEDABAD_CITY',
    name: 'Ahmedabad City Police Interceptor Unit',
    roleDesc: 'Urban perimeter gates, ring roads & metro area surveillance',
    icon: Building2,
    badge: 'Perimeter & Gates',
  },
  {
    code: 'HIGHWAY_PATROL',
    name: 'Highway Patrol Command',
    roleDesc: 'State/National expressways, toll plazas & inter-district corridors',
    icon: Car,
    badge: 'Toll & Expressways',
  },
  {
    code: 'SOG',
    name: 'Special Operations Group (SOG)',
    roleDesc: 'High-risk tactical tracking & specialized reconnaissance',
    icon: Shield,
    badge: 'Tactical Recon',
  },
];

export default function MasterWatchlistBatchModal({ isOpen, onClose, onSuccess }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const [selectedDepartments, setSelectedDepartments] = useState([
    'TRAFFIC',
    'CRIME_BRANCH',
    'AHMEDABAD_CITY',
    'HIGHWAY_PATROL',
  ]);
  const [priority, setPriority] = useState('CRITICAL');
  const [instructions, setInstructions] = useState(
    'Activate statewide camera grid sweep and automated ANPR triggers. Report all positive detections and candidate matches directly through Garud Evidence Console.'
  );
  const [viewMode, setViewMode] = useState('FORM'); // 'FORM' or 'CIRCULAR_PREVIEW'
  const [includeAllCases, setIncludeAllCases] = useState(false);

  // 1. Fetch pending cases for Watchlist creation
  const { data: casesData, isLoading: casesLoading } = useQuery({
    queryKey: ['pending-fir-cases-for-watchlist', includeAllCases],
    queryFn: () =>
      investigationAPI
        .getCases({
          status: includeAllCases ? 'ALL' : 'SUBMITTED',
          limit: 20,
        })
        .then((r) => r.data),
    enabled: isOpen,
  });

  const availableCases = useMemo(() => {
    const list = casesData?.data || [];
    if (!includeAllCases) {
      const pending = list.filter(
        (c) =>
          c.status === 'SUBMITTED' ||
          c.status === 'ADMIN_REVIEW' ||
          c.status === 'APPROVED' ||
          !c.isWatchlistActive
      );
      return pending.length > 0 ? pending : list;
    }
    return list;
  }, [casesData, includeAllCases]);

  // Pre-select all available cases when loaded
  useMemo(() => {
    if (availableCases.length > 0 && selectedCaseIds.length === 0) {
      setSelectedCaseIds(availableCases.map((c) => c.caseId));
    }
  }, [availableCases]);

  const toggleCase = (caseId) => {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId) ? prev.filter((id) => id !== caseId) : [...prev, caseId]
    );
  };

  const toggleDepartment = (deptCode) => {
    setSelectedDepartments((prev) =>
      prev.includes(deptCode) ? prev.filter((code) => code !== deptCode) : [...prev, deptCode]
    );
  };

  const selectAllDepartments = () => {
    setSelectedDepartments(AVAILABLE_DEPARTMENTS.map((d) => d.code));
  };

  const clearAllDepartments = () => {
    setSelectedDepartments([]);
  };

  const selectAllCases = () => {
    setSelectedCaseIds(availableCases.map((c) => c.caseId));
  };

  const clearAllCases = () => {
    setSelectedCaseIds([]);
  };

  // 2. Batch Create & Distribute Mutation
  const batchMutation = useMutation({
    mutationFn: (payload) => investigationAPI.batchCreateAndDistributeWatchlist(payload),
    onSuccess: (res) => {
      toast.success(
        res.data?.message || 'Master Watchlist compiled and distributed to all departments!'
      );
      queryClient.invalidateQueries(['admin-watchlist']);
      queryClient.invalidateQueries(['admin-fir-cases']);
      queryClient.invalidateQueries(['investigation-analytics']);
      queryClient.invalidateQueries(['department-cases']);
      queryClient.invalidateQueries(['department-assignments']);
      if (onSuccess) onSuccess(res.data);
      onClose();
    },
    onError: (err) => {
      toast.error(
        err.response?.data?.message || 'Failed to compile and distribute Master Watchlist'
      );
    },
  });

  const handleConfirmAndBroadcast = () => {
    if (selectedCaseIds.length === 0) {
      toast.error('Please select at least one FIR case to compile into the Master Watchlist.');
      return;
    }
    if (selectedDepartments.length === 0) {
      toast.error('Please select at least one department for watchlist distribution.');
      return;
    }

    const payloadDepartments = AVAILABLE_DEPARTMENTS.filter((d) =>
      selectedDepartments.includes(d.code)
    ).map((d) => ({
      code: d.code,
      name: d.name,
    }));

    batchMutation.mutate({
      caseIds: selectedCaseIds,
      departments: payloadDepartments,
      instructions,
      priority,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-[#0f172a] border-slate-800 text-slate-100'
        }`}
      >
        {/* ─── MODAL HEADER ─── */}
        <div
          className={`px-6 py-4.5 border-b flex items-center justify-between ${
            isLight
              ? 'bg-slate-50 border-slate-200 text-slate-900'
              : 'bg-slate-900/80 border-slate-800 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isLight
                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                  : 'bg-blue-900/30 border-blue-800 text-blue-400'
              }`}
            >
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Compile Master Watchlist & Distribute
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    isLight
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-blue-950/50 text-blue-300 border-blue-800'
                  }`}
                >
                  STATEWIDE DIRECTIVE
                </span>
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Converts pending police FIR cases into Master Watchlist entries and broadcasts immediately to investigation departments.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Switcher */}
            <div
              className={`hidden sm:flex items-center p-1 rounded-lg border text-xs ${
                isLight
                  ? 'bg-slate-100 border-slate-200'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              <button
                onClick={() => setViewMode('FORM')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'FORM'
                    ? isLight
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'bg-slate-700 text-white'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Watchlist Form
              </button>
              <button
                onClick={() => setViewMode('CIRCULAR_PREVIEW')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'CIRCULAR_PREVIEW'
                    ? isLight
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'bg-slate-700 text-white'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Circular Preview
              </button>
            </div>

            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLight
                  ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ─── MODAL BODY (SCROLLABLE) ─── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {viewMode === 'FORM' ? (
            <>
              {/* SECTION 1: PENDING CASES COMPILATION */}
              <div
                className={`p-5 rounded-xl border ${
                  isLight
                    ? 'bg-slate-50/60 border-slate-200'
                    : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3
                      className={`text-xs font-bold tracking-wider uppercase ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      1. Select Pending FIR Cases to Include ({selectedCaseIds.length} of {availableCases.length} Selected)
                    </h3>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      Review target identifiers and verify case details before Master Watchlist compilation.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={selectAllCases}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-400">•</span>
                    <button
                      onClick={clearAllCases}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {casesLoading ? (
                  <div className="py-8 text-center text-slate-400 text-xs animate-pulse">
                    Loading pending FIR cases...
                  </div>
                ) : availableCases.length === 0 ? (
                  <div className="py-8 text-center space-y-3">
                    <p
                      className={`text-sm ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      No pending FIR cases awaiting watchlist conversion.
                    </p>
                    <button
                      onClick={() => setIncludeAllCases(true)}
                      className="px-4 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 text-xs font-medium hover:bg-blue-100 transition-colors"
                    >
                      Include Active Cases for Watchlist Compilation
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableCases.map((c) => {
                      const isSelected = selectedCaseIds.includes(c.caseId);
                      const isVehicle = c.requestType === 'STOLEN_VEHICLE';
                      const targetId = isVehicle
                        ? c.vehicleDetails?.registrationNumber || 'REGISTRATION PENDING'
                        : c.personDetails?.fullName || 'SUBJECT';

                      return (
                        <div
                          key={c.caseId}
                          onClick={() => toggleCase(c.caseId)}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                            isSelected
                              ? isLight
                                ? 'bg-white border-blue-500 ring-1 ring-blue-500/20 shadow-sm'
                                : 'bg-blue-950/30 border-blue-500/40'
                              : isLight
                              ? 'bg-white border-slate-200 hover:border-slate-300'
                              : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start gap-3.5">
                            <div className="mt-1">
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              ) : (
                                <Square
                                  className={`w-5 h-5 ${
                                    isLight ? 'text-slate-400' : 'text-slate-600'
                                  }`}
                                />
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`font-mono font-bold text-sm ${
                                    isLight ? 'text-slate-900' : 'text-white'
                                  }`}
                                >
                                  {c.caseId}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${
                                    isLight
                                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                                      : 'bg-slate-800 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  FIR #{c.firNumber}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border uppercase ${
                                    c.priority === 'CRITICAL'
                                      ? isLight
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : 'bg-red-950/40 text-red-400 border-red-800'
                                      : isLight
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-amber-950/40 text-amber-400 border-amber-800'
                                  }`}
                                >
                                  {c.priority}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-xs">
                                {isVehicle ? (
                                  <span
                                    className={`inline-flex items-center gap-1.5 font-mono font-bold px-2 py-0.5 rounded border ${
                                      isLight
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : 'bg-cyan-950/40 text-cyan-300 border-cyan-800'
                                    }`}
                                  >
                                    <Car className="w-3.5 h-3.5" />
                                    {targetId}
                                  </span>
                                ) : (
                                  <span
                                    className={`inline-flex items-center gap-1.5 font-bold px-2 py-0.5 rounded border ${
                                      isLight
                                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                                        : 'bg-purple-950/40 text-purple-300 border-purple-800'
                                    }`}
                                  >
                                    <User className="w-3.5 h-3.5" />
                                    {targetId}
                                  </span>
                                )}
                                <span
                                  className={`text-xs ${
                                    isLight ? 'text-slate-600' : 'text-slate-400'
                                  }`}
                                >
                                  {isVehicle
                                    ? `${c.vehicleDetails?.make || ''} ${c.vehicleDetails?.model || ''} (${c.vehicleDetails?.color || ''})`
                                    : `Age: ${c.personDetails?.age || 'N/A'}, Gender: ${c.personDetails?.gender || 'N/A'}`}
                                </span>
                              </div>

                              <p
                                className={`text-[11px] line-clamp-1 ${
                                  isLight ? 'text-slate-500' : 'text-slate-400'
                                }`}
                              >
                                {c.caseDescription}
                              </p>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between text-right text-xs">
                            <span
                              className={`font-medium flex items-center gap-1.5 ${
                                isLight ? 'text-slate-700' : 'text-slate-300'
                              }`}
                            >
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {c.policeStation}
                            </span>
                            <span
                              className={`text-[11px] mt-0.5 ${
                                isLight ? 'text-slate-500' : 'text-slate-500'
                              }`}
                            >
                              Filed: {new Date(c.firDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION 2: TARGET DEPARTMENTS DISTRIBUTION */}
              <div
                className={`p-5 rounded-xl border ${
                  isLight
                    ? 'bg-slate-50/60 border-slate-200'
                    : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3
                      className={`text-xs font-bold tracking-wider uppercase ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      2. Broadcast to Investigation Departments ({selectedDepartments.length} of {AVAILABLE_DEPARTMENTS.length} Selected)
                    </h3>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      Select which agencies will receive this watchlist directive with immediate camera sweep mandates.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={selectAllDepartments}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-400">•</span>
                    <button
                      onClick={clearAllDepartments}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {AVAILABLE_DEPARTMENTS.map((dept) => {
                    const isSelected = selectedDepartments.includes(dept.code);
                    const IconComp = dept.icon;

                    return (
                      <div
                        key={dept.code}
                        onClick={() => toggleDepartment(dept.code)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                          isSelected
                            ? isLight
                              ? 'bg-white border-blue-500 ring-1 ring-blue-500/20 shadow-sm'
                              : 'bg-blue-950/30 border-blue-500/40'
                            : isLight
                            ? 'bg-white border-slate-200 hover:border-slate-300'
                            : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="mt-0.5">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square
                              className={`w-4 h-4 ${
                                isLight ? 'text-slate-400' : 'text-slate-600'
                              }`}
                            />
                          )}
                        </div>

                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-semibold text-xs flex items-center gap-1.5 ${
                                isLight ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              <IconComp
                                className={`w-3.5 h-3.5 ${
                                  isLight ? 'text-blue-600' : 'text-blue-400'
                                }`}
                              />
                              {dept.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                                isLight
                                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {dept.badge}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] leading-snug ${
                              isLight ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {dept.roleDesc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 3: BROADCAST DIRECTIVES & SLA PRIORITY */}
              <div
                className={`p-5 rounded-xl border ${
                  isLight
                    ? 'bg-slate-50/60 border-slate-200'
                    : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3
                      className={`text-xs font-bold tracking-wider uppercase ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      3. Surveillance Directives & Priority Level
                    </h3>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      Specify camera search urgency and field investigation orders.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      className={`text-xs font-semibold block mb-2 ${
                        isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      Broadcast Priority Tier
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          id: 'CRITICAL',
                          label: 'Critical Priority',
                          desc: 'Immediate Alert (2 Hr SLA)',
                        },
                        {
                          id: 'HIGH',
                          label: 'High Priority',
                          desc: 'Priority Grid (6 Hr SLA)',
                        },
                        {
                          id: 'MEDIUM',
                          label: 'Standard Priority',
                          desc: 'Routine Sweep (24 Hr SLA)',
                        },
                      ].map((tier) => {
                        const isSelected = priority === tier.id;
                        return (
                          <div
                            key={tier.id}
                            onClick={() => setPriority(tier.id)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer text-center ${
                              isSelected
                                ? isLight
                                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/20 text-blue-900'
                                  : 'bg-blue-950/40 border-blue-500 text-blue-200'
                                : isLight
                                ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                : 'bg-slate-800/30 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="font-semibold text-xs">{tier.label}</div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLight ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              {tier.desc}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label
                      className={`text-xs font-semibold block mb-2 ${
                        isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      Investigation Directives for Field & Surveillance Units
                    </label>
                    <textarea
                      rows={2}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Enter specific instructions for surveillance teams..."
                      className={`w-full p-3 rounded-lg text-xs outline-none border transition-colors ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                          : 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-400'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* CIRCULAR PREVIEW MODE */
            <div
              className={`p-8 rounded-xl border ${
                isLight
                  ? 'bg-white border-slate-200 shadow-sm text-slate-900'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              <div className="text-center border-b pb-6 mb-6 border-slate-200 dark:border-slate-800 space-y-1">
                <div
                  className={`inline-block p-2 rounded-xl mb-2 ${
                    isLight
                      ? 'bg-blue-50 text-blue-600 border border-blue-200'
                      : 'bg-blue-900/30 text-blue-400 border border-blue-800'
                  }`}
                >
                  <Shield className="w-8 h-8 mx-auto" />
                </div>
                <h2 className="text-base font-bold tracking-widest uppercase">
                  Government of Gujarat • Home Department
                </h2>
                <h3
                  className={`text-xs font-semibold tracking-wider ${
                    isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  POLICE MODERNIZATION & STATEWIDE SURVEILLANCE COMMAND
                </h3>
                <div className="pt-2 flex items-center justify-center gap-4 text-[11px] font-mono text-slate-500">
                  <span>CIRCULAR REF: MWL-{new Date().getFullYear()}-DIR</span>
                  <span>•</span>
                  <span>DATE: {new Date().toLocaleDateString()}</span>
                  <span>•</span>
                  <span className="text-red-600 dark:text-red-400 font-bold uppercase">
                    {priority} PRIORITY
                  </span>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="font-bold uppercase text-slate-500">Subject: </span>
                  <span className="font-semibold">
                    Consolidated Master Watchlist Directive for Immediate CCTV & ANPR Grid Surveillance
                  </span>
                </div>

                <div>
                  <span className="font-bold uppercase text-slate-500">Target Distribution: </span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {selectedDepartments
                      .map((c) => AVAILABLE_DEPARTMENTS.find((d) => d.code === c)?.name)
                      .join(', ')}
                  </span>
                </div>

                <div className="pt-2">
                  <span className="font-bold uppercase text-slate-500 block mb-2">
                    Active Watchlist Targets ({selectedCaseIds.length} Cases):
                  </span>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                      <thead
                        className={`text-[11px] uppercase font-semibold ${
                          isLight
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        <tr>
                          <th className="p-2.5">Case ID</th>
                          <th className="p-2.5">Target Identifier</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Originating Station</th>
                          <th className="p-2.5">Priority</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-[11px]">
                        {availableCases
                          .filter((c) => selectedCaseIds.includes(c.caseId))
                          .map((c) => (
                            <tr key={c.caseId}>
                              <td className="p-2.5 font-mono font-semibold">{c.caseId}</td>
                              <td className="p-2.5 font-bold text-blue-600 dark:text-blue-400 font-mono">
                                {c.requestType === 'STOLEN_VEHICLE'
                                  ? c.vehicleDetails?.registrationNumber
                                  : c.personDetails?.fullName}
                              </td>
                              <td className="p-2.5">{c.requestType.replace('_', ' ')}</td>
                              <td className="p-2.5">{c.policeStation}</td>
                              <td className="p-2.5 font-semibold text-amber-600 dark:text-amber-400">
                                {c.priority}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="font-bold uppercase text-slate-500 block mb-1">
                    Operational Orders:
                  </span>
                  <p
                    className={`p-3 rounded-lg font-mono text-[11px] leading-relaxed border ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    {instructions}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── MODAL FOOTER ─── */}
        <div
          className={`px-6 py-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? 'bg-slate-50 border-slate-200'
              : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div
            className={`text-xs flex items-center gap-2 ${
              isLight ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            <CheckCircle2
              className={`w-4 h-4 ${
                isLight ? 'text-blue-600' : 'text-blue-400'
              }`}
            />
            <span>
              Ready to broadcast <strong>{selectedCaseIds.length} case(s)</strong> to{' '}
              <strong>{selectedDepartments.length} department(s)</strong>.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={batchMutation.isPending}
              className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              Cancel
            </button>

            <button
              onClick={handleConfirmAndBroadcast}
              disabled={
                batchMutation.isPending ||
                selectedCaseIds.length === 0 ||
                selectedDepartments.length === 0
              }
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {batchMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Broadcasting Watchlist...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Confirm & Broadcast to All Departments
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

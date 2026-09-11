import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Share2,
  Building2,
  CheckSquare,
  Square,
  Send,
  AlertCircle,
  Shield,
  Clock,
  Sparkles,
} from 'lucide-react';
import { investigationAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import toast from 'react-hot-toast';

const AVAILABLE_DEPARTMENTS = [
  { code: 'POLICE', name: 'Gujarat Police Department', desc: 'Jurisdiction-wide field units and police stations', icon: Shield },
  { code: 'TRAFFIC', name: 'Gujarat Traffic Police', desc: 'ANPR highway corridors, circles and toll barriers', icon: Building2 },
  { code: 'CRIME_BRANCH', name: 'Crime Branch Ahmedabad', desc: 'Specialized investigative wing and surveillance team', icon: Shield },
  { code: 'VADODARA_CRIME', name: 'Vadodara Crime Branch', desc: 'Central Gujarat crime analysis & tracking unit', icon: Shield },
  { code: 'SURAT_POLICE', name: 'Surat City Police Command', desc: 'South Gujarat transit and coastal surveillance', icon: Building2 },
  { code: 'TRANSPORT', name: 'Gujarat Transport Department (RTO)', desc: 'Vehicle ownership, fastag and regional RTO checkpoints', icon: Building2 },
];

export default function WatchlistDistributionModal({ isOpen, onClose, watchlistEntry, caseItem, onDistributed }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  const activeEntry = watchlistEntry || caseItem;

  const [selectedDepts, setSelectedDepts] = useState(['POLICE', 'TRAFFIC']);
  const [instructions, setInstructions] = useState(
    'Initiate urgent CCTV/ANPR surveillance scans across jurisdiction. Report any high confidence matches.'
  );

  const toggleDept = (code) => {
    setSelectedDepts((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const selectAll = () => {
    if (selectedDepts.length === AVAILABLE_DEPARTMENTS.length) {
      setSelectedDepts([]);
    } else {
      setSelectedDepts(AVAILABLE_DEPARTMENTS.map((d) => d.code));
    }
  };

  const assignMutation = useMutation({
    mutationFn: ({ id, departments, instructions }) =>
      investigationAPI.assignDepartments(id, { departments, instructions }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['investigation-watchlist']);
      queryClient.invalidateQueries(['admin-watchlist']);
      queryClient.invalidateQueries(['investigation-cases']);
      queryClient.invalidateQueries(['investigation-assignments']);
      toast.success(res.message || 'Investigation assigned to departments!');
      onDistributed?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to distribute investigation.');
    },
  });

  const handleDispatch = () => {
    if (selectedDepts.length === 0) {
      toast.error('Please select at least one department.');
      return;
    }

    const payload = selectedDepts.map((code) => {
      const d = AVAILABLE_DEPARTMENTS.find((x) => x.code === code);
      return { departmentCode: d.code, departmentName: d.name };
    });

    assignMutation.mutate({
      id: activeEntry?.watchlistId || activeEntry?.caseId,
      departments: payload,
      instructions,
    });
  };

  if (!isOpen || !activeEntry) return null;

  const identifier = activeEntry.subjectIdentifier || activeEntry.targetIdentifier || activeEntry.normalizedIdentifier || 'Target Entity';
  const caseId = activeEntry.caseId || activeEntry.case?.caseId || 'CASE';
  const station = activeEntry.originatingStation || activeEntry.policeStation || 'Gujarat Police';
  const priority = (activeEntry.priority || 'HIGH').toUpperCase();
  const subjectType = activeEntry.subjectType ? String(activeEntry.subjectType).replace(/_/g, ' ') : 'VEHICLE';

  return (
    <div className="fixed inset-0 z-[3600] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0b101b] border-white/10 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/8'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">Forward to Departments</h3>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Case ID: <span className="font-mono font-bold text-blue-500">{caseId}</span> · {identifier}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/8'
          }`}>
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400">Originating Police Station</span>
              <p className="font-bold text-sm">{station}</p>
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400">Priority Level</span>
              <p className="font-bold text-sm text-red-500">{priority} PRIORITY</p>
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400">Subject Type</span>
              <p className="font-bold text-sm">{subjectType}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Target Investigation Departments
              </label>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-bold text-blue-500 hover:text-blue-400"
              >
                {selectedDepts.length === AVAILABLE_DEPARTMENTS.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AVAILABLE_DEPARTMENTS.map((dept) => {
                const isSelected = selectedDepts.includes(dept.code);
                return (
                  <div
                    key={dept.code}
                    onClick={() => toggleDept(dept.code)}
                    className={`p-3.5 rounded-xl border cursor-pointer flex items-start gap-3 transition-all ${
                      isSelected
                        ? isLight
                          ? 'bg-blue-50/70 border-blue-500 shadow-xs'
                          : 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                        : isLight
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-white/2 border-white/8 hover:border-white/15'
                    }`}
                  >
                    <div className="mt-0.5 text-blue-500">
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold leading-tight">{dept.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{dept.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Investigation Directives & Search Remarks</label>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border ${
                isLight ? 'bg-white border-slate-300' : 'bg-white/5 border-white/10'
              }`}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/8'
          }`}
        >
          <span className="text-xs text-slate-400">
            {selectedDepts.length} department{selectedDepts.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-xs font-bold rounded-xl border ${
                isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-white/10 hover:bg-white/5'
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={assignMutation.isPending || selectedDepts.length === 0}
              onClick={handleDispatch}
              className="px-5 py-2 text-xs font-black rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/30 flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {assignMutation.isPending ? 'Distributing...' : 'Forward to Selected Departments'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

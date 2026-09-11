import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Search,
  Camera,
  Calendar,
  Clock,
  MapPin,
  Car,
  User,
  ShieldCheck,
  AlertCircle,
  FileCheck2,
  Sliders,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Compass,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import { investigationAPI, cameraAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import toast from 'react-hot-toast';

export default function InvestigationSearchConsole({
  firCase,
  selectedCase,
  casesList = [],
  onSelectCaseForSearch,
  assignment,
  onResultSelect,
  onSubmitEvidence,
}) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const activeCase = selectedCase || firCase;

  // Search Parameters
  const [searchType, setSearchType] = useState(
    activeCase?.requestType === 'STOLEN_VEHICLE' ? 'ANPR' : 'FACE'
  );
  const [targetPlate, setTargetPlate] = useState(
    activeCase?.vehicleDetails?.registrationNumber || ''
  );
  const [targetPersonName, setTargetPersonName] = useState(
    activeCase?.personDetails?.fullName || ''
  );
  const [district, setDistrict] = useState(activeCase?.district || 'Vadodara');
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(80);
  const [searchResults, setSearchResults] = useState(null);

  // Sync state if activeCase changes
  useEffect(() => {
    if (activeCase) {
      if (activeCase.requestType === 'STOLEN_VEHICLE') {
        setSearchType('ANPR');
        setTargetPlate(activeCase.vehicleDetails?.registrationNumber || '');
      } else {
        setSearchType('FACE');
        setTargetPersonName(activeCase.personDetails?.fullName || '');
      }
      if (activeCase.district) setDistrict(activeCase.district);
    }
  }, [activeCase]);

  // Fetch candidate cameras for the district
  const { data: cameraData } = useQuery({
    queryKey: ['district-cameras-search', district],
    queryFn: () => cameraAPI.getAll({ district, limit: 20 }).then((r) => r.data),
    staleTime: 60000,
  });

  const availableCameras = cameraData?.data || [];

  const searchMutation = useMutation({
    mutationFn: (payload) =>
      investigationAPI.runSearch(payload).then((r) => r.data),
    onSuccess: (res) => {
      setSearchResults(res);
      toast.success(
        res.matchesFound > 0
          ? `Search complete: ${res.matchesFound} potential match candidates found!`
          : 'Search complete: No detections found for the specified criteria.'
      );
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Investigation search failed.');
    },
  });

  const handleRunSearch = () => {
    if (!activeCase && !targetPlate.trim() && !targetPersonName.trim()) {
      toast.error('Please enter a plate number or select an active case to search.');
      return;
    }

    const payload = {
      caseId: activeCase?.caseId || 'STATEWIDE-SCAN',
      assignmentId: assignment?.assignmentId,
      searchType,
      targetPlate: targetPlate.trim(),
      targetPersonName: targetPersonName.trim(),
      district,
      dateFrom,
      dateTo,
      confidenceThreshold: Number(confidenceThreshold),
    };
    searchMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      {/* Subject Context Card */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm text-slate-900' : 'bg-slate-900/60 border-slate-800 text-white'
        }`}
      >
        {activeCase ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                {activeCase.requestType === 'STOLEN_VEHICLE' ? (
                  <Car className="w-6 h-6" />
                ) : (
                  <User className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Active Case Target
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    isLight ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {activeCase.requestType?.replace('_', ' ')}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300'
                  }`}>
                    FIR #{activeCase.firNumber}
                  </span>
                </div>
                <h3 className={`text-base font-bold tracking-tight mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {activeCase.requestType === 'STOLEN_VEHICLE'
                    ? activeCase.vehicleDetails?.registrationNumber || 'Vehicle'
                    : activeCase.personDetails?.fullName || 'Person'}
                </h3>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {activeCase.requestType === 'STOLEN_VEHICLE'
                    ? `${activeCase.vehicleDetails?.color || ''} ${activeCase.vehicleDetails?.make || ''} ${activeCase.vehicleDetails?.model || ''}`.trim() || 'Vehicle details on record'
                    : `${activeCase.personDetails?.age ? `${activeCase.personDetails.age} yrs · ` : ''}${activeCase.personDetails?.gender || ''} · ${activeCase.personDetails?.clothingDescription || 'Description on file'}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700'}`}>
                <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Case ID</span>
                <span className={`font-bold font-mono ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>{activeCase.caseId}</span>
              </div>
              <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700'}`}>
                <span className={`block text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Origin Station</span>
                <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{activeCase.policeStation}</span>
              </div>
              {onSelectCaseForSearch && (
                <button
                  type="button"
                  onClick={() => onSelectCaseForSearch(null)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-sans ${
                    isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-600' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Search className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Surveillance Grid Mode
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300'
                  }`}>
                    Manual / Direct Query
                  </span>
                </div>
                <h3 className={`text-base font-bold tracking-tight mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Direct Camera Infrastructure Search
                </h3>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Query optical feeds directly by license plate or select an assigned FIR investigation case below.
                </p>
              </div>
            </div>

            {casesList && casesList.length > 0 && onSelectCaseForSearch && (
              <div className="flex items-center gap-2">
                <FolderOpen className={`w-4 h-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                <select
                  onChange={(e) => {
                    const found = casesList.find((c) => c.caseId === e.target.value);
                    if (found) onSelectCaseForSearch(found);
                  }}
                  defaultValue=""
                  className={`text-xs px-3 py-2 rounded-xl border font-medium ${
                    isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <option value="" disabled>
                    Select Active FIR Case...
                  </option>
                  {casesList.map((c) => (
                    <option key={c.caseId} value={c.caseId}>
                      {c.caseId} · {c.requestType === 'STOLEN_VEHICLE' ? c.vehicleDetails?.registrationNumber : c.personDetails?.fullName} ({c.policeStation})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search Configuration Console */}
      <div
        className={`p-6 rounded-2xl border ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <h4 className={`text-sm font-bold tracking-tight mb-4 flex items-center gap-2 ${
          isLight ? 'text-slate-900' : 'text-white'
        }`}>
          <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Surveillance Grid Search Configuration
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Search Type</label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            >
              <option value="ANPR">ANPR Number Plate Recognition</option>
              <option value="VEHICLE_COLOR_TYPE">Vehicle Make / Model / Color</option>
              <option value="FACE">Facial Biometrics & Appearance</option>
              <option value="MULTI_FACTOR">Multi-Factor Surveillance</option>
            </select>
          </div>

          {searchType === 'ANPR' || activeCase?.requestType === 'STOLEN_VEHICLE' ? (
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Plate Number</label>
              <input
                type="text"
                placeholder="e.g. GJ06AB1234"
                value={targetPlate}
                onChange={(e) => setTargetPlate(e.target.value.toUpperCase())}
                className={`w-full px-3 py-2 text-xs rounded-xl border font-mono font-bold tracking-wider ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              />
            </div>
          ) : (
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Subject Name</label>
              <input
                type="text"
                placeholder="Person Name"
                value={targetPersonName}
                onChange={(e) => setTargetPersonName(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border font-bold ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}
              />
            </div>
          )}

          <div>
            <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>District / Region</label>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            >
              <option value="Vadodara">Vadodara</option>
              <option value="Ahmedabad">Ahmedabad</option>
              <option value="Surat">Surat</option>
              <option value="Gandhinagar">Gandhinagar</option>
              <option value="Rajkot">Rajkot</option>
              <option value="ALL">Statewide (All Districts)</option>
            </select>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Confidence Threshold ({confidenceThreshold}%)
            </label>
            <input
              type="range"
              min="50"
              max="99"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(e.target.value)}
              className="w-full mt-2 accent-blue-600"
            />
          </div>
        </div>

        {/* Date Time Range */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div>
            <label className={`block text-xs font-semibold mb-1 flex items-center gap-1.5 ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Scan Date From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            />
          </div>
          <div>
            <label className={`block text-xs font-semibold mb-1 flex items-center gap-1.5 ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Scan Date To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className={`text-xs flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            <Camera className="w-4 h-4 text-blue-600" />
            Scanning across <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>{availableCameras.length || 15}</strong> active CCTV nodes in {district}
          </span>
          <button
            type="button"
            disabled={searchMutation.isPending}
            onClick={handleRunSearch}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            {searchMutation.isPending ? (
              <>Running AI Optical Scan...</>
            ) : (
              <>
                <Search className="w-4 h-4" /> Start AI Surveillance Search
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search Results Gallery */}
      {searchResults && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <h4 className={`text-sm font-bold tracking-tight flex items-center gap-2 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Investigation Search Results ({searchResults.matchesFound || 0} Detections)
            </h4>
            <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Search ID: {searchResults.searchId}</span>
          </div>

          {searchResults.matchesFound > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchResults.results.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-5 rounded-2xl border transition-all ${
                    isLight ? 'bg-white border-slate-200 shadow-sm text-slate-900' : 'bg-slate-900/80 border-slate-800 text-white'
                  }`}
                >
                  {/* Result Header & AI Safety Badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        isLight
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      }`}>
                        AI POTENTIAL MATCH · {item.confidence}% CONFIDENCE
                      </span>
                      <h5 className={`font-bold text-sm mt-1.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>{item.matchType}</h5>
                    </div>
                    <span className={`text-[11px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Optical Media & Frame Snapshot */}
                  <div className="flex gap-4 mb-4">
                    {item.snapshotUrl ? (
                      <img
                        src={item.snapshotUrl}
                        alt="Detection"
                        className="w-28 h-24 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shrink-0"
                      />
                    ) : (
                      <div className="w-28 h-24 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center text-blue-600 shrink-0">
                        <Camera className="w-8 h-8" />
                      </div>
                    )}

                    <div className="text-xs space-y-1 min-w-0 flex-1">
                      <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        <Camera className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                        <span className={`font-mono font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{item.cameraId}</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-red-500" />
                        <span className={`truncate ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{item.locationName} ({item.district})</span>
                      </div>
                      {item.details?.heading && (
                        <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          <Compass className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                          <span className={`truncate ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{item.details.heading}</span>
                        </div>
                      )}
                      {item.details?.plate && (
                        <div className="pt-1">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs border ${
                            isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          }`}>
                            {item.details.plate}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button: Attach as Evidence */}
                  <div className={`pt-3 border-t flex items-center justify-between ${
                    isLight ? 'border-slate-200' : 'border-slate-800'
                  }`}>
                    <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Coordinates: {item.coordinates?.map((c) => c.toFixed(4)).join(', ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (onSubmitEvidence) onSubmitEvidence(activeCase, item);
                        else if (onResultSelect) onResultSelect(item);
                      }}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Submit as Evidence
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={`p-8 text-center rounded-2xl border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'border-slate-800 bg-slate-900/50 text-slate-300'
            }`}>
              <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-bold">No Match Found in Selected Range</p>
              <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Try expanding the date range, reducing confidence threshold, or scanning adjacent highway districts.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

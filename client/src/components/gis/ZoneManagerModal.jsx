import React, { useState } from 'react';
import { gisAPI } from '../../api';
import {
  Shield,
  ShieldAlert,
  X,
  Compass,
  MapPin,
  Clock,
  AlertTriangle,
  Check,
  Calendar,
  Users,
  Car,
  Trash2,
  Edit3,
  Plus,
  Power,
  Layers,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeDropdown from '../common/ThemeDropdown';

const SEVERITY_CONFIG = {
  NORMAL: { label: 'Normal / Monitored', color: '#10b981', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  MONITORED: { label: 'Monitored Area', color: '#3b82f6', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  RESTRICTED: { label: 'Restricted Access', color: '#f59e0b', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  HIGH_SECURITY: { label: 'High Security Zone', color: '#ef4444', bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
};

export default function ZoneManagerModal({
  isOpen,
  onClose,
  zones = [],
  onRefreshZones,
  onFlyToZone,
  userRole = 'ADMIN',
  district = 'Ahmedabad',
  isLight = false,
}) {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'create' | 'edit'
  const [editingZone, setEditingZone] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  // Form State for Create / Edit
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [zoneType, setZoneType] = useState('POLYGON'); // 'POLYGON' | 'CIRCLE'
  const [severity, setSeverity] = useState('MONITORED');
  const [crowdThreshold, setCrowdThreshold] = useState(250);
  const [speedLimit, setSpeedLimit] = useState(40);
  const [alertRestricted, setAlertRestricted] = useState(true);
  const [isAlwaysActive, setIsAlwaysActive] = useState(true);
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [radiusMeters, setRadiusMeters] = useState(500);
  const [coordsInput, setCoordsInput] = useState('72.535, 23.038');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);
  const canManage = ['ADMIN', 'SUPER_ADMIN', 'POLICE'].includes(userRole);

  const startCreate = () => {
    setEditingZone(null);
    setName('');
    setDescription('');
    setZoneType('CIRCLE');
    setSeverity('MONITORED');
    setCrowdThreshold(250);
    setSpeedLimit(40);
    setAlertRestricted(true);
    setIsAlwaysActive(true);
    setRadiusMeters(500);
    setCoordsInput('72.535, 23.038');
    setActiveTab('form');
  };

  const startEdit = (zone) => {
    setEditingZone(zone);
    setName(zone.name || '');
    setDescription(zone.description || '');
    setZoneType(zone.type === 'CIRCLE' ? 'CIRCLE' : 'POLYGON');
    setSeverity(zone.severity || 'MONITORED');
    setCrowdThreshold(zone.rules?.crowdThreshold || 250);
    setSpeedLimit(zone.rules?.speedLimitKmh || 40);
    setAlertRestricted(zone.rules?.alertOnRestrictedEntry ?? true);
    setIsAlwaysActive(zone.rules?.activeSchedule?.allDay ?? true);
    setStartTime(zone.rules?.activeSchedule?.startTime || '00:00');
    setEndTime(zone.rules?.activeSchedule?.endTime || '23:59');
    setRadiusMeters(zone.radiusMeters || 500);

    if (zone.geometry?.coordinates) {
      if (zone.type === 'CIRCLE') {
        setCoordsInput(`${zone.geometry.coordinates[0]}, ${zone.geometry.coordinates[1]}`);
      } else {
        setCoordsInput(JSON.stringify(zone.geometry.coordinates));
      }
    }
    setActiveTab('form');
  };

  const handleToggleActive = async (zone) => {
    try {
      const newStatus = !zone.isActive;
      await gisAPI.updateZone(zone._id, { isActive: newStatus });
      toast.success(`Zone "${zone.name}" is now ${newStatus ? 'ACTIVE' : 'INACTIVE'}`);
      if (onRefreshZones) onRefreshZones();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to toggle zone status');
    }
  };

  const handleDeleteZone = async (zone) => {
    if (!window.confirm(`Are you sure you want to delete the operational zone "${zone.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await gisAPI.deleteZone(zone._id);
      toast.success(`Zone "${zone.name}" successfully removed`);
      if (onRefreshZones) onRefreshZones();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete operational zone');
    }
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please provide a valid zone name');
      return;
    }

    try {
      setIsSubmitting(true);

      let geometry;
      if (zoneType === 'CIRCLE') {
        const parts = coordsInput.split(',').map((p) => parseFloat(p.trim()));
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
          toast.error('Coordinates must be in format: longitude, latitude (e.g. 72.535, 23.038)');
          setIsSubmitting(false);
          return;
        }
        geometry = {
          type: 'Point',
          coordinates: [parts[0], parts[1]],
        };
      } else {
        try {
          const parsed = JSON.parse(coordsInput);
          geometry = {
            type: 'Polygon',
            coordinates: parsed,
          };
        } catch (_) {
          // Default rectangular polygon around Ahmedabad coordinate
          const parts = coordsInput.split(',').map((p) => parseFloat(p.trim()));
          const lng = isNaN(parts[0]) ? 72.535 : parts[0];
          const lat = isNaN(parts[1]) ? 23.038 : parts[1];
          const delta = 0.005;
          geometry = {
            type: 'Polygon',
            coordinates: [[
              [lng - delta, lat - delta],
              [lng + delta, lat - delta],
              [lng + delta, lat + delta],
              [lng - delta, lat + delta],
              [lng - delta, lat - delta],
            ]],
          };
        }
      }

      const payload = {
        name: name.trim(),
        description: description.trim(),
        type: zoneType,
        severity,
        geometry,
        radiusMeters: zoneType === 'CIRCLE' ? Number(radiusMeters) : 0,
        district: district !== 'all' ? district : 'Ahmedabad',
        color: SEVERITY_CONFIG[severity]?.color || '#3b82f6',
        rules: {
          alertOnRestrictedEntry: alertRestricted,
          crowdThreshold: Number(crowdThreshold),
          speedLimitKmh: Number(speedLimit),
          activeSchedule: {
            allDay: isAlwaysActive,
            startTime,
            endTime,
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          },
        },
      };

      if (editingZone) {
        await gisAPI.updateZone(editingZone._id, payload);
        toast.success(`Zone "${name}" updated successfully`);
      } else {
        await gisAPI.createZone(payload);
        toast.success(`Operational Zone "${name}" established`);
      }

      if (onRefreshZones) onRefreshZones();
      setActiveTab('list');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save operational zone');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredZones = zones.filter((z) => {
    const matchQuery = !searchQuery || (z.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchSeverity = filterSeverity === 'ALL' || z.severity === filterSeverity;
    return matchQuery && matchSeverity;
  });

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border flex flex-col overflow-hidden transition-all ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-[#0f1423] border-white/10 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#151c30] border-white/5'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-wide">
                  Operational Geofence Zones Hub
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                  {zones.length} ZONES
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Configure AI perimeter surveillance rules, crowd limits, speed controls, and entry enforcement
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'list' && canManage && (
              <button
                onClick={startCreate}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Geofence</span>
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-slate-400'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs if in Form */}
        {activeTab === 'form' && (
          <div className={`px-6 py-2 border-b flex items-center justify-between text-xs ${
            isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-white/3 border-white/5'
          }`}>
            <span className="font-semibold text-slate-400">
              {editingZone ? `Editing: ${editingZone.name}` : 'Create New Operational Geofence'}
            </span>
            <button
              onClick={() => setActiveTab('list')}
              className="text-indigo-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
            >
              ← Back to All Zones
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'list' ? (
            <div className="space-y-4">
              {/* Search & Severity Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Search zones by name or landmark..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`flex-1 min-w-[200px] px-3.5 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                      : 'bg-white/5 border-white/10 text-white placeholder:text-slate-500'
                  }`}
                />

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400 text-[11px] font-mono">Severity:</span>
                  {['ALL', 'HIGH_SECURITY', 'RESTRICTED', 'MONITORED'].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setFilterSeverity(sev)}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                        filterSeverity === sev
                          ? 'bg-indigo-600 text-white'
                          : isLight
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {sev === 'ALL' ? 'All' : sev.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Zones Grid */}
              {filteredZones.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-2xl border-white/10">
                  <Compass className="w-10 h-10 mx-auto text-slate-500 mb-2 opacity-60" />
                  <p className="text-sm font-semibold text-slate-300">No operational zones found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {searchQuery ? 'Try adjusting your search criteria' : 'Click "New Geofence" to configure your first perimeter'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredZones.map((zone) => {
                    const sev = SEVERITY_CONFIG[zone.severity] || SEVERITY_CONFIG.MONITORED;
                    return (
                      <div
                        key={zone._id}
                        className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                          isLight
                            ? 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                            : 'bg-white/3 hover:bg-white/5 border-white/8'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: sev.color }}
                                />
                                <h3 className="font-bold text-sm tracking-wide line-clamp-1">
                                  {zone.name}
                                </h3>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 ml-4">
                                {zone.district || 'Gujarat'} · {zone.type || 'POLYGON'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sev.bg} ${sev.text} ${sev.border}`}>
                                {sev.label}
                              </span>
                              <button
                                onClick={() => handleToggleActive(zone)}
                                title={zone.isActive ? 'Active - Click to Deactivate' : 'Disabled - Click to Activate'}
                                className={`p-1 rounded-md transition-colors cursor-pointer ${
                                  zone.isActive
                                    ? 'text-emerald-400 hover:bg-emerald-500/20'
                                    : 'text-slate-500 hover:bg-slate-500/20'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {zone.description && (
                            <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                              {zone.description}
                            </p>
                          )}

                          {/* Rule Badges */}
                          <div className="grid grid-cols-2 gap-1.5 mt-3 text-[11px]">
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Users className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span>Crowd Limit: <b>{zone.rules?.crowdThreshold || 'N/A'} ppl</b></span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Car className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>Speed: <b>{zone.rules?.speedLimitKmh || '40'} km/h</b></span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>
                                {zone.rules?.activeSchedule?.allDay
                                  ? '24/7 Monitored'
                                  : `${zone.rules?.activeSchedule?.startTime || '00:00'} - ${zone.rules?.activeSchedule?.endTime || '23:59'}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <ShieldAlert className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>
                                {zone.rules?.alertOnRestrictedEntry ? 'Entry Alert ON' : 'Standard Watch'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Actions */}
                        <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/5">
                          <button
                            onClick={() => {
                              if (onFlyToZone) onFlyToZone(zone);
                              onClose();
                            }}
                            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Maximize2 className="w-3 h-3" />
                            <span>Fly to on Map</span>
                          </button>

                          {canManage && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startEdit(zone)}
                                className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                                  isLight
                                    ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                                }`}
                                title="Edit Rules"
                              >
                                <Edit3 className="w-3 h-3 text-indigo-400" />
                                <span>Edit</span>
                              </button>

                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteZone(zone)}
                                  className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-all cursor-pointer"
                                  title="Delete Zone"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Create / Edit Form */
            <form onSubmit={handleSaveForm} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Zone Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sola Science City High Security Perimeter"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/5 border-white/10 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Threat / Security Severity *
                  </label>
                  <ThemeDropdown
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    options={[
                      { value: 'NORMAL', label: 'Normal / Green' },
                      { value: 'MONITORED', label: 'Monitored / Blue' },
                      { value: 'RESTRICTED', label: 'Restricted Entry / Amber' },
                      { value: 'HIGH_SECURITY', label: 'High Security / Red' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Description / Operational Directive
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain operational directives, VIP movement restrictions, or curfew conditions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/5 border-white/10 text-white'
                  }`}
                />
              </div>

              {/* Geometry Shape Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Geofence Shape
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setZoneType('CIRCLE')}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        zoneType === 'CIRCLE'
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                          : isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Circular Buffer</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setZoneType('POLYGON')}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        zoneType === 'POLYGON'
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                          : isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Polygon Perimeter</span>
                    </button>
                  </div>
                </div>

                {zoneType === 'CIRCLE' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Radius: <span className="text-indigo-400 font-mono">{radiusMeters} meters</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="3000"
                      step="50"
                      value={radiusMeters}
                      onChange={(e) => setRadiusMeters(Number(e.target.value))}
                      className="w-full accent-indigo-500 mt-2"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Center Coordinates (Longitude, Latitude)
                    </label>
                    <input
                      type="text"
                      value={coordsInput}
                      onChange={(e) => setCoordsInput(e.target.value)}
                      placeholder="72.535, 23.038"
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono outline-none ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-white/5 border-white/10 text-white'
                      }`}
                    />
                  </div>
                )}
              </div>

              {/* AI Rules & Thresholds */}
              <div className={`p-4 rounded-xl border space-y-3 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/5'
              }`}>
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>AI Automated Detection Rules & Thresholds</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Crowd Alert Threshold (Persons)
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="5000"
                      value={crowdThreshold}
                      onChange={(e) => setCrowdThreshold(e.target.value)}
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono outline-none ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/5 border-white/10 text-white'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Speed Limit Enforcement (km/h)
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="150"
                      value={speedLimit}
                      onChange={(e) => setSpeedLimit(e.target.value)}
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono outline-none ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/5 border-white/10 text-white'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={alertRestricted}
                      onChange={(e) => setAlertRestricted(e.target.checked)}
                      className="accent-indigo-500 rounded"
                    />
                    <span>Raise high-priority alert on unauthorized vehicle / pedestrian entry</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-white/10 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Saving Zone...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{editingZone ? 'Update Zone' : 'Create Operational Zone'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

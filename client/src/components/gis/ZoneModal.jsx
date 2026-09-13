import React, { useState } from 'react';
import { gisAPI } from '../../api';
import {
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeDropdown from '../common/ThemeDropdown';

export default function ZoneModal({
  isOpen,
  onClose,
  onZoneCreated,
  initialCoordinates = null,
  district = 'Ahmedabad',
  isLight = false,
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('EVENT');
  const [severity, setSeverity] = useState('high');
  const [crowdThreshold, setCrowdThreshold] = useState(250);
  const [speedLimit, setSpeedLimit] = useState(40);
  const [alertRestricted, setAlertRestricted] = useState(true);
  const [watchlistAlert, setWatchlistAlert] = useState(true);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('01:00');
  const [isAlwaysActive, setIsAlwaysActive] = useState(false);
  const [shapeType, setShapeType] = useState('circle'); // 'circle' | 'polygon'
  const [radiusMeters, setRadiusMeters] = useState(600);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const centerCoords = initialCoordinates || [72.535, 23.038]; // [lng, lat]

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a zone name');
      return;
    }

    try {
      setIsSubmitting(true);

      let geometry;
      if (shapeType === 'circle') {
        // Point geometry with radius
        geometry = {
          type: 'Point',
          coordinates: centerCoords,
        };
      } else {
        // Approximate 5-point polygon around center
        const [cLng, cLat] = centerCoords;
        const d = (radiusMeters / 111000) * 0.8;
        geometry = {
          type: 'Polygon',
          coordinates: [
            [
              [cLng - d, cLat - d],
              [cLng + d, cLat - d],
              [cLng + d * 1.2, cLat + d],
              [cLng - d * 0.8, cLat + d * 1.2],
              [cLng - d, cLat - d],
            ],
          ],
        };
      }

      const payload = {
        name: name.trim(),
        type,
        severity,
        district,
        geometry,
        radiusMeters,
        rules: {
          crowdThreshold: Number(crowdThreshold),
          speedLimitKmh: Number(speedLimit),
          alertOnRestrictedEntry: alertRestricted,
          watchlistVehicleAlert: watchlistAlert,
        },
        schedule: {
          startTime,
          endTime,
          isAlwaysActive,
        },
      };

      const res = await gisAPI.createZone(payload);
      toast.success(`Operational Zone "${name}" created successfully!`);
      if (onZoneCreated) onZoneCreated(res.data.data);
      onClose();
    } catch (err) {
      console.error('Failed to create zone:', err);
      toast.error(err.response?.data?.message || 'Failed to create operational zone');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-[#0d121f] border-white/10 text-slate-100'
        }`}
      >
        <div className="p-4 border-b border-inherit flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 flex items-center justify-center">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide">Create Operational Geofence Zone</h3>
              <p className="text-[11px] text-slate-400">
                Configure security cordon, dynamic crowd limits & alert rules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          {/* Name & Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 mb-1 block">
                Zone Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Navratri Event Perimeter"
                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition-colors ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 focus:border-indigo-500'
                    : 'bg-black/30 border-white/10 focus:border-indigo-500'
                }`}
              />
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 mb-1 block">
                Zone Classification *
              </label>
              <ThemeDropdown
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[
                  { value: 'EVENT', label: 'EVENT (Cultural / Festival)' },
                  { value: 'RESTRICTED', label: 'RESTRICTED (High Security)' },
                  { value: 'VIP', label: 'VIP CORRIDOR (Movement)' },
                  { value: 'EMERGENCY', label: 'EMERGENCY (Disaster / Riot)' },
                  { value: 'SURVEILLANCE', label: 'SURVEILLANCE (Active ANPR)' },
                  { value: 'OPERATIONAL', label: 'OPERATIONAL (General)' },
                ]}
              />
            </div>
          </div>

          {/* Severity & Geometry Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 mb-1 block">
                Threat / Severity Level
              </label>
              <ThemeDropdown
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                options={[
                  { value: 'low', label: 'LOW' },
                  { value: 'medium', label: 'MEDIUM' },
                  { value: 'high', label: 'HIGH' },
                  { value: 'critical', label: 'CRITICAL' },
                ]}
              />
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 mb-1 block">
                Zone Geometry Buffer
              </label>
              <div className="flex items-center gap-2">
                <ThemeDropdown
                  value={shapeType}
                  onChange={(e) => setShapeType(e.target.value)}
                  options={[
                    { value: 'circle', label: 'Circular Radial' },
                    { value: 'polygon', label: 'Polygon Envelope' },
                  ]}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={radiusMeters}
                  onChange={(e) => setRadiusMeters(Number(e.target.value))}
                  placeholder="Meters"
                  className={`w-24 px-2.5 py-2 rounded-xl border text-xs font-mono outline-none ${
                    isLight ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Zone-specific Configurable Thresholds */}
          <div
            className={`p-3 rounded-xl border space-y-2.5 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
            }`}
          >
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              Zone Behavioral Rules & Automated Triggers:
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block flex items-center gap-1">
                  <Users className="w-3 h-3 text-amber-400" /> Crowd Threshold
                </label>
                <input
                  type="number"
                  value={crowdThreshold}
                  onChange={(e) => setCrowdThreshold(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                    isLight ? 'bg-white border-slate-300' : 'bg-black/40 border-white/10'
                  }`}
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 mb-1 block flex items-center gap-1">
                  <Car className="w-3 h-3 text-cyan-400" /> Speed Limit (km/h)
                </label>
                <input
                  type="number"
                  value={speedLimit}
                  onChange={(e) => setSpeedLimit(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                    isLight ? 'bg-white border-slate-300' : 'bg-black/40 border-white/10'
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={alertRestricted}
                  onChange={(e) => setAlertRestricted(e.target.checked)}
                  className="rounded accent-indigo-600"
                />
                <span>Alert on Restricted Entry</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={watchlistAlert}
                  onChange={(e) => setWatchlistAlert(e.target.checked)}
                  className="rounded accent-indigo-600"
                />
                <span>Watchlist ANPR Auto-Escalate</span>
              </label>
            </div>
          </div>

          {/* Schedule */}
          <div className="p-3 rounded-xl border border-inherit space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-400" /> Operational Schedule
              </span>
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer text-slate-400">
                <input
                  type="checkbox"
                  checked={isAlwaysActive}
                  onChange={(e) => setIsAlwaysActive(e.target.checked)}
                  className="rounded accent-indigo-600"
                />
                <span>Always Active (24/7)</span>
              </label>
            </div>

            {!isAlwaysActive && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">Start Time</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10'
                    }`}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">End Time</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-indigo-500/25"
            >
              {isSubmitting ? 'Creating Zone...' : 'Activate Zone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

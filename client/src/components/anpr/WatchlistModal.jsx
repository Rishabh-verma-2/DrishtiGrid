import { useState, useEffect } from 'react';
import { X, ShieldPlus, Save } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import toast from 'react-hot-toast';
import ThemeDropdown from '../common/ThemeDropdown';

const CATEGORIES = ['STOLEN', 'WANTED', 'SUSPECT', 'VIP', 'BLACKLISTED', 'FLEET', 'RESTRICTED', 'OTHER'];
const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];

export default function WatchlistModal({ record, isOpen, onClose, onSave }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const [form, setForm] = useState({
    plate_number: '',
    category: 'SUSPECT',
    priority: 'HIGH',
    status: 'ACTIVE',
    reference_id: '',
    ownerName: '',
    vehicleModel: '',
    vehicleColor: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (record) {
      setForm({
        plate_number: record.plate_number || '',
        category: record.category || 'SUSPECT',
        priority: record.priority || 'HIGH',
        status: record.status || 'ACTIVE',
        reference_id: record.reference_id || '',
        ownerName: record.ownerName || '',
        vehicleModel: record.vehicleModel || '',
        vehicleColor: record.vehicleColor || '',
        description: record.description || '',
      });
    } else {
      setForm({
        plate_number: '',
        category: 'SUSPECT',
        priority: 'HIGH',
        status: 'ACTIVE',
        reference_id: '',
        ownerName: '',
        vehicleModel: '',
        vehicleColor: '',
        description: '',
      });
    }
  }, [record, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.plate_number.trim()) {
      return toast.error('Vehicle plate number is required.');
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col border transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.2)]'
            : 'bg-[#0f1422] border-white/10 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.8)]'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-6 py-4 flex items-center justify-between border-b ${
            isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-[#141929] border-white/8'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isLight
                  ? 'bg-blue-50 border border-blue-200 text-blue-600 shadow-xs'
                  : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
              }`}
            >
              <ShieldPlus className="w-5 h-5" />
            </div>
            <div>
              <h3
                className={`text-sm font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-slate-100'
                }`}
              >
                {record ? 'Edit Monitored Vehicle' : 'Register Hotlist Vehicle Plate'}
              </h3>
              <p className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Automatic License Plate Recognition Target Registry
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              Registration Plate Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.plate_number}
              onChange={(e) => setForm({ ...form, plate_number: e.target.value.toUpperCase() })}
              placeholder="e.g. GJ01AB1234 or DL1CAB1234"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-mono uppercase tracking-wider font-bold outline-none transition-all ${
                isLight
                  ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/15'
                  : 'bg-[#161c2e] border border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500'
              }`}
            />
            <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Supports standard Indian formats, Bharat Series (BH), and commercial series.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Threat Category
              </label>
              <ThemeDropdown
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>

            <div>
              <label
                className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Priority
              </label>
              <ThemeDropdown
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Case / FIR Reference
              </label>
              <input
                type="text"
                value={form.reference_id}
                onChange={(e) => setForm({ ...form, reference_id: e.target.value })}
                placeholder="FIR-2026-XXXX"
                className={`w-full px-3 py-2.5 rounded-xl font-mono text-xs outline-none transition-all ${
                  isLight
                    ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500'
                }`}
              />
            </div>

            <div>
              <label
                className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Status
              </label>
              <ThemeDropdown
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                options={[
                  { value: 'ACTIVE', label: 'ACTIVE (Monitored)' },
                  { value: 'INACTIVE', label: 'INACTIVE (Dormant)' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Registered Owner
              </label>
              <input
                type="text"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                placeholder="Owner / Suspect Name"
                className={`w-full px-3 py-2 rounded-xl text-xs outline-none transition-all ${
                  isLight
                    ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500'
                }`}
              />
            </div>
            <div>
              <label
                className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Vehicle Model / Color
              </label>
              <input
                type="text"
                value={form.vehicleModel}
                onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
                placeholder="e.g. White Mahindra Scorpio"
                className={`w-full px-3 py-2 rounded-xl text-xs outline-none transition-all ${
                  isLight
                    ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500'
                }`}
              />
            </div>
          </div>

          <div>
            <label
              className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              Case Brief &amp; Interception Instructions
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Stolen vehicle involved in incident. If detected, notify local PCR immediately."
              className={`w-full px-3 py-2 rounded-xl text-xs outline-none resize-none transition-all ${
                isLight
                  ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600'
                  : 'bg-[#161c2e] border border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500'
              }`}
            />
          </div>

          {/* Actions */}
          <div
            className={`pt-4 border-t flex items-center justify-end gap-2.5 ${
              isLight ? 'border-slate-200' : 'border-white/10'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isLight
                  ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition-all disabled:opacity-50 active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : record ? 'Update Watchlist' : 'Register Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

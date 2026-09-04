import { useState } from "react";
import { XIcon } from "./Icons";

const CATEGORIES = ["STOLEN", "SUSPECT", "VIP", "WANTED", "BLACKLISTED", "FLEET", "OTHER"];
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];

export default function RecordModal({ onClose, onSave, existingRecord = null }) {
  const isEdit = !!existingRecord;
  const [form, setForm] = useState({
    plate_number: existingRecord?.plate_number || "",
    category: existingRecord?.category || "OTHER",
    priority: existingRecord?.priority || "MEDIUM",
    status: existingRecord?.status || "ACTIVE",
    description: existingRecord?.description || "",
    reference_id: existingRecord?.reference_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.plate_number.trim()) {
      setError("Plate number is required.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to save record.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full bg-white border border-slate-300 text-slate-900 text-sm font-medium rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors placeholder-slate-400";
  const labelClass = "block text-xs font-extrabold text-slate-600 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 px-5 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-white tracking-wider uppercase">
              {isEdit ? "EDIT PLATE RECORD" : "ADD PLATE RECORD"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? `Editing: ${existingRecord?.plate_number}` : "Create a new monitored plate record"}
            </p>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-white p-1 transition-colors rounded"
            onClick={onClose}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-800 text-xs font-semibold px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="plate_number" className={labelClass}>
              License Plate Number *
            </label>
            <input
              id="plate_number"
              name="plate_number"
              type="text"
              required
              maxLength={20}
              placeholder="e.g. GJ01AB1234 or RJ14CD5678"
              value={form.plate_number}
              onChange={handleChange}
              className={`${inputClass} font-mono uppercase placeholder:font-sans placeholder:normal-case`}
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">
              Enter raw plate text — the system will auto-normalize for matching.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="category" className={labelClass}>
                Category
              </label>
              <select
                id="category"
                name="category"
                value={form.category}
                onChange={handleChange}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="priority" className={labelClass}>
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className={inputClass}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="status" className={labelClass}>
                Status
              </label>
              <select
                id="status"
                name="status"
                value={form.status}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
            <div>
              <label htmlFor="reference_id" className={labelClass}>
                Reference ID
              </label>
              <input
                id="reference_id"
                name="reference_id"
                type="text"
                placeholder="FIR-XXXX or REF-XXXX"
                value={form.reference_id}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className={labelClass}>
              Description / Notes
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Brief notes about this record..."
              value={form.description}
              onChange={handleChange}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            >
              {saving ? "Saving..." : isEdit ? "Update Record" : "Create Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

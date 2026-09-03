import { useState, useEffect, useCallback } from "react";
import { getPlateRecords as getRecords, createPlateRecord as createRecord, updatePlateRecord as updateRecord, deletePlateRecord as deleteRecord } from "../api/recordsApi";
import RecordModal from "../components/RecordModal";
import RecordDetailModal from "../components/RecordDetailModal";

const PRIORITY_CLASSES = {
  HIGH: "bg-red-100 text-red-800 border border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border border-amber-200",
  LOW: "bg-slate-100 text-slate-700 border border-slate-200",
};

const STATUS_CLASSES = {
  ACTIVE: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  INACTIVE: "bg-slate-200 text-slate-600 border border-slate-300",
};

export default function PlateRecordsPage({ onRecordsChanged }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getRecords();
      const list = Array.isArray(data) ? data : (data?.records || []);
      setRecords(list);
    } catch (err) {
      setError("Failed to load plate records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleSave = async (form) => {
    if (editRecord) {
      const id = editRecord.recordId || editRecord.id || editRecord._id;
      await updateRecord(id, form);
    } else {
      await createRecord(form);
    }
    await fetchRecords();
    if (onRecordsChanged) onRecordsChanged();
  };

  const handleDelete = async (record) => {
    const id = record.recordId || record.id || record._id;
    await deleteRecord(id, true);
    setConfirmDelete(null);
    await fetchRecords();
    if (onRecordsChanged) onRecordsChanged();
  };

  const categories = ["ALL", ...new Set(records.map((r) => r.category).filter(Boolean))];

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.plate_number?.toLowerCase().includes(q) ||
      r.normalized_plate_number?.toLowerCase().includes(q) ||
      r.reference_id?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q);
    const matchCat = filterCategory === "ALL" || r.category === filterCategory;
    const matchStatus = filterStatus === "ALL" || r.status === filterStatus;
    return matchSearch && matchCat && matchStatus;
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          <input
            type="text"
            placeholder="Search plate, ref ID, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56 placeholder-slate-400"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "ALL" ? "All Categories" : c}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </div>
        <button
          type="button"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold rounded-lg shadow-sm transition-colors flex items-center gap-2"
          onClick={() => {
            setEditRecord(null);
            setShowAddModal(true);
          }}
        >
          <span className="text-base">+</span> Add Record
        </button>
      </div>

      {/* Stats Pills */}
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <span className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1 rounded-full">
          Total: {records.length}
        </span>
        <span className="bg-emerald-100 border border-emerald-200 text-emerald-800 px-3 py-1 rounded-full">
          Active: {records.filter((r) => r.status === "ACTIVE").length}
        </span>
        <span className="bg-slate-200 border border-slate-300 text-slate-600 px-3 py-1 rounded-full">
          Inactive: {records.filter((r) => r.status === "INACTIVE").length}
        </span>
        <span className="bg-red-100 border border-red-200 text-red-800 px-3 py-1 rounded-full">
          High Priority: {records.filter((r) => r.priority === "HIGH").length}
        </span>
        {search || filterCategory !== "ALL" || filterStatus !== "ALL" ? (
          <span className="bg-blue-100 border border-blue-200 text-blue-800 px-3 py-1 rounded-full">
            Showing {filtered.length} filtered
          </span>
        ) : null}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm font-semibold px-4 py-2.5 rounded-lg">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 text-white text-left">
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Plate Number</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Normalized</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Category</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Priority</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Ref ID</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Alerts</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Added</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500 font-semibold">
                    Loading records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    {records.length === 0
                      ? "No records yet. Add your first monitored plate using the button above."
                      : "No records match your current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((record) => (
                  <tr
                    key={record.recordId}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    onClick={() => setViewRecord(record)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono font-extrabold text-slate-900 tracking-wider">
                        {record.plate_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-600">
                        {record.normalized_plate_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
                        {record.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${PRIORITY_CLASSES[record.priority] || ""}`}>
                        {record.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_CLASSES[record.status] || ""}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                      {record.reference_id || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700 text-center">
                      {record.alert_count ?? record.total_alerts ?? 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {(record.created_at || record.createdAt) ? new Date(record.created_at || record.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
                          onClick={() => {
                            setEditRecord(record);
                            setShowAddModal(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
                          onClick={() => setConfirmDelete(record)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {(showAddModal || editRecord) && (
        <RecordModal
          existingRecord={editRecord}
          onClose={() => {
            setShowAddModal(false);
            setEditRecord(null);
          }}
          onSave={handleSave}
        />
      )}
      {viewRecord && (
        <RecordDetailModal
          record={viewRecord}
          onClose={() => setViewRecord(null)}
          onEdit={(r) => {
            setViewRecord(null);
            setEditRecord(r);
            setShowAddModal(true);
          }}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm flex flex-col gap-4">
            <h3 className="text-base font-extrabold text-slate-900">Delete Record?</h3>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete the record for plate{" "}
              <strong className="font-mono">{confirmDelete.plate_number}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-extrabold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

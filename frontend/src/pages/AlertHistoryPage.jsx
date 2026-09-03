import { useState, useEffect, useCallback } from "react";
import { getPlateAlerts as getAlerts, updateAlertStatus } from "../api/alertsApi";
import AlertDetailModal from "../components/AlertDetailModal";

const PRIORITY_CLASSES = {
  HIGH: "bg-red-100 text-red-800 border border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border border-amber-200",
  LOW: "bg-slate-100 text-slate-700 border border-slate-200",
};

const STATUS_CLASSES = {
  NEW: "bg-red-600 text-white",
  ACKNOWLEDGED: "bg-amber-500 text-white",
  RESOLVED: "bg-emerald-600 text-white",
};

export default function AlertHistoryPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [viewAlert, setViewAlert] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAlerts();
      const list = Array.isArray(data) ? data : (data?.alerts || []);
      setAlerts(list);
    } catch (err) {
      setError("Failed to load alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleUpdateStatus = async (alertId, newStatus) => {
    try {
      await updateAlertStatus(alertId, newStatus);
      await fetchAlerts();
      setViewAlert(null);
    } catch (err) {
      setError("Failed to update alert status.");
    }
  };

  const filtered = alerts.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      a.detected_plate?.toLowerCase().includes(q) ||
      a.normalized_detected?.toLowerCase().includes(q) ||
      a.alertId?.toLowerCase().includes(q) ||
      a.matched_record_id?.toLowerCase().includes(q);
    const matchStatus = filterStatus === "ALL" || a.status === filterStatus;
    const matchPriority = filterPriority === "ALL" || a.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          <input
            type="text"
            placeholder="Search plate, alert ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52 placeholder-slate-400"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">NEW</option>
            <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </div>
        <button
          type="button"
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg transition-colors"
          onClick={fetchAlerts}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stats Pills */}
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <span className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1 rounded-full">
          Total: {alerts.length}
        </span>
        <span className="bg-red-100 border border-red-200 text-red-800 px-3 py-1 rounded-full">
          New: {alerts.filter((a) => a.status === "NEW").length}
        </span>
        <span className="bg-amber-100 border border-amber-200 text-amber-800 px-3 py-1 rounded-full">
          Acknowledged: {alerts.filter((a) => a.status === "ACKNOWLEDGED").length}
        </span>
        <span className="bg-emerald-100 border border-emerald-200 text-emerald-800 px-3 py-1 rounded-full">
          Resolved: {alerts.filter((a) => a.status === "RESOLVED").length}
        </span>
        {(search || filterStatus !== "ALL" || filterPriority !== "ALL") && (
          <span className="bg-blue-100 border border-blue-200 text-blue-800 px-3 py-1 rounded-full">
            Showing {filtered.length} filtered
          </span>
        )}
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
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Alert ID</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Detected Plate</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Matched Record</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Category</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Priority</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Source Image</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Detected At</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500 font-semibold">
                    Loading alerts...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    {alerts.length === 0
                      ? "No alerts yet. Run image analysis to detect matches."
                      : "No alerts match your current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((alert) => (
                  <tr
                    key={alert.alertId}
                    className={`transition-colors cursor-pointer ${
                      alert.status === "NEW"
                        ? "bg-red-50/40 hover:bg-red-50/70"
                        : "hover:bg-slate-50/70"
                    }`}
                    onClick={() => setViewAlert(alert)}
                  >
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">
                      {alert.alertId?.slice(-8) || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-extrabold text-slate-900 tracking-wider">
                        {alert.detected_plate}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-700">
                      {alert.matched_record_id || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
                        {alert.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${PRIORITY_CLASSES[alert.priority] || ""}`}>
                        {alert.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-extrabold px-2 py-0.5 rounded ${STATUS_CLASSES[alert.status] || "bg-slate-200 text-slate-700"}`}>
                        {alert.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[150px] truncate" title={alert.source_image_name}>
                      {alert.source_image_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {alert.detected_at ? new Date(alert.detected_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {alert.status === "NEW" && (
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded transition-colors"
                            onClick={() => handleUpdateStatus(alert.alertId, "ACKNOWLEDGED")}
                          >
                            Ack
                          </button>
                        )}
                        {(alert.status === "NEW" || alert.status === "ACKNOWLEDGED") && (
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded transition-colors"
                            onClick={() => handleUpdateStatus(alert.alertId, "RESOLVED")}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewAlert && (
        <AlertDetailModal
          alert={viewAlert}
          onClose={() => setViewAlert(null)}
          onUpdateStatus={handleUpdateStatus}
        />
      )}
    </div>
  );
}

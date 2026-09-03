import { useState, useEffect, useCallback } from "react";
import { getAuditLogs } from "../api/dashboardApi";

const ACTION_COLORS = {
  RECORD_CREATED: "bg-blue-100 text-blue-800 border-blue-200",
  RECORD_UPDATED: "bg-amber-100 text-amber-800 border-amber-200",
  RECORD_DELETED: "bg-red-100 text-red-800 border-red-200",
  ALERT_CREATED: "bg-red-100 text-red-800 border-red-200",
  ALERT_ACKNOWLEDGED: "bg-amber-100 text-amber-800 border-amber-200",
  ALERT_RESOLVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  BATCH_ANALYSIS: "bg-purple-100 text-purple-800 border-purple-200",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAuditLogs();
      const list = Array.isArray(data) ? data : (data?.logs || []);
      setLogs(list);
    } catch (err) {
      setError("Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const actionTypes = ["ALL", ...new Set(logs.map((l) => l.action).filter(Boolean))];

  const filtered = logs.filter((log) => {
    const q = search.toLowerCase();
    const detailsStr = typeof log.details === "object" ? JSON.stringify(log.details) : (log.details || "");
    const matchSearch =
      !q ||
      log.action?.toLowerCase().includes(q) ||
      log.target_id?.toLowerCase().includes(q) ||
      detailsStr.toLowerCase().includes(q) ||
      JSON.stringify(log.metadata || {}).toLowerCase().includes(q);
    const matchAction = filterAction === "ALL" || log.action === filterAction;
    return matchSearch && matchAction;
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          <input
            type="text"
            placeholder="Search logs, actions, IDs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56 placeholder-slate-400"
          />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {a === "ALL" ? "All Actions" : a.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg transition-colors"
          onClick={fetchLogs}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <span className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1 rounded-full">
          Total Entries: {logs.length}
        </span>
        {(search || filterAction !== "ALL") && (
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
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Timestamp</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Action</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Target ID</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Details</th>
                <th className="px-4 py-3 text-xs font-extrabold tracking-wider">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500 font-semibold">
                    Loading audit logs...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    {logs.length === 0
                      ? "No audit log entries yet. Actions will be logged here."
                      : "No logs match your current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((log, idx) => (
                  <tr key={log._id || log.id || idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-extrabold px-2 py-0.5 rounded border ${
                          ACTION_COLORS[log.action] || "bg-slate-100 text-slate-700 border-slate-300"
                        }`}
                      >
                        {log.action?.replace(/_/g, " ") || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">
                      {log.target_id || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-xs truncate">
                      {typeof log.details === "object" ? JSON.stringify(log.details) : (log.details || "—")}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 max-w-[200px]">
                      {(log.metadata || (typeof log.details === "object" && Object.keys(log.details || {}).length > 0)) ? (
                        <details className="cursor-pointer">
                          <summary className="text-blue-600 font-bold hover:text-blue-800">
                            View JSON
                          </summary>
                          <pre className="mt-1 bg-slate-100 p-1.5 rounded text-[10px] overflow-auto max-h-24">
                            {JSON.stringify(log.metadata || log.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

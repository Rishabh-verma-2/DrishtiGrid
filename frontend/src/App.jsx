import { useState, useEffect } from "react";
import Analyzer from "./pages/Analyzer";
import PlateRecordsPage from "./pages/PlateRecordsPage";
import AlertHistoryPage from "./pages/AlertHistoryPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import { getDashboardStats } from "./api/dashboardApi";

export default function App() {
  const [activeTab, setActiveTab] = useState("VERIFY");
  const [stats, setStats] = useState({
    activeRecords: 0,
    totalRecords: 0,
    totalAlerts: 0,
    newAlerts: 0,
    alertsToday: 0,
  });

  const fetchStats = () => {
    getDashboardStats()
      .then((res) => {
        // API returns data directly (not wrapped in res.data)
        const d = res?.data || res;
        if (d && typeof d === "object") {
          setStats({
            activeRecords: d.activeRecords ?? 0,
            totalRecords: d.totalRecords ?? 0,
            totalAlerts: d.totalAlerts ?? 0,
            newAlerts: d.newAlerts ?? 0,
            alertsToday: d.alertsToday ?? 0,
          });
        }
      })
      .catch((err) => console.warn("Failed to fetch dashboard stats:", err));
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 font-sans">
      {/* Top Institutional Header */}
      <header className="bg-slate-950 text-white border-b-4 border-red-700 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-xl shadow-inner">
              🛡️
            </div>
            <div>
              <div className="text-base sm:text-lg font-extrabold tracking-wide text-white leading-tight">
                ANPR · AUTOMATED NUMBER PLATE RECOGNITION SYSTEM
              </div>
              <div className="text-xs font-semibold text-slate-400 tracking-wider">
                SURVEILLANCE, WATCHLIST MATCHING &amp; ALERT ADMINISTRATION
              </div>
            </div>
          </div>

          {/* Quick Metrics Ribbon */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-slate-900 border border-slate-700/80 rounded px-3 py-1.5 flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                MONITORED RECORDS
              </span>
              <span className="text-sm font-extrabold text-emerald-400">
                {stats.activeRecords} ACTIVE
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-700/80 rounded px-3 py-1.5 flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                NEW ALERTS
              </span>
              <span
                className={`text-sm font-extrabold ${
                  stats.newAlerts > 0 ? "text-red-400 animate-pulse" : "text-slate-200"
                }`}
              >
                {stats.newAlerts} NEW
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-700/80 rounded px-3 py-1.5 flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                TOTAL INCIDENTS
              </span>
              <span className="text-sm font-extrabold text-white">
                {stats.totalAlerts}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <nav className="bg-slate-900 border-b border-slate-800 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 sm:space-x-2 overflow-x-auto">
            <button
              type="button"
              className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "VERIFY"
                  ? "text-sky-400 border-sky-400 bg-slate-800/60"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30"
              }`}
              onClick={() => setActiveTab("VERIFY")}
            >
              <span>🔍</span>
              <span>Plate Verification</span>
            </button>

            <button
              type="button"
              className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "RECORDS"
                  ? "text-sky-400 border-sky-400 bg-slate-800/60"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30"
              }`}
              onClick={() => setActiveTab("RECORDS")}
            >
              <span>📑</span>
              <span>Plate Records</span>
              <span className="ml-1 bg-slate-800 text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full border border-slate-700">
                {stats.totalRecords}
              </span>
            </button>

            <button
              type="button"
              className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "ALERTS"
                  ? "text-red-400 border-red-400 bg-slate-800/60"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30"
              }`}
              onClick={() => setActiveTab("ALERTS")}
            >
              <span>🚨</span>
              <span>Alert History</span>
              {stats.newAlerts > 0 && (
                <span className="ml-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                  {stats.newAlerts}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "AUDIT"
                  ? "text-sky-400 border-sky-400 bg-slate-800/60"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30"
              }`}
              onClick={() => setActiveTab("AUDIT")}
            >
              <span>📜</span>
              <span>Audit Trail</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "VERIFY" && (
          <Analyzer
            onViewAlert={(alertId) => setActiveTab("ALERTS")}
            onNavigateToRecords={() => setActiveTab("RECORDS")}
          />
        )}

        {activeTab === "RECORDS" && (
          <PlateRecordsPage onRecordsChanged={fetchStats} />
        )}

        {activeTab === "ALERTS" && (
          <AlertHistoryPage />
        )}

        {activeTab === "AUDIT" && <AuditLogsPage />}
      </main>

      {/* Institutional Footer */}
      <footer className="bg-slate-950 text-slate-400 text-xs py-4 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>
            <strong className="text-slate-200">ANPR Operational Intelligence Platform</strong> · YOLOv8 · Zero-DCE · Real-ESRGAN · PaddleOCR
          </div>
          <div className="text-slate-400">
            Official Surveillance &amp; Watchlist Console · Authorized Personnel Only
          </div>
        </div>
      </footer>
    </div>
  );
}

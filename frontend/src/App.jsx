import { useState, useEffect } from "react";
import Analyzer from "./pages/Analyzer";
import PlateRecordsPage from "./pages/PlateRecordsPage";
import AlertHistoryPage from "./pages/AlertHistoryPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import DetectionsGridPage from "./pages/DetectionsGridPage";
import { getDashboardStats } from "./api/dashboardApi";
import {
  ShieldIcon,
  SearchIcon,
  CarIcon,
  DatabaseIcon,
  AlertTriangleIcon,
  ClipboardListIcon,
} from "./components/Icons";

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
      <header className="bg-slate-950 text-white border-b-2 border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <ShieldIcon className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-2">
                <span>DRISHTIGRID</span>
                <span className="text-slate-500 font-normal">|</span>
                <span className="text-xs font-semibold text-slate-300 tracking-wider">
                  INTELLIGENT ANPR SYSTEM
                </span>
              </div>
              <div className="text-[11px] font-medium text-slate-400">
                Surveillance Telemetry, Automated Matching &amp; Alert Administration
              </div>
            </div>
          </div>

          {/* Quick Metrics Ribbon */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">
                MONITORED RECORDS
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {stats.activeRecords} ACTIVE
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">
                NEW ALERTS
              </span>
              <span
                className={`text-xs font-mono font-bold ${
                  stats.newAlerts > 0 ? "text-red-400" : "text-slate-200"
                }`}
              >
                {stats.newAlerts} UNREVIEWED
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">
                TOTAL INCIDENTS
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {stats.totalAlerts}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <nav className="bg-slate-950/90 border-b border-slate-800 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 sm:space-x-2 overflow-x-auto">
            <button
              type="button"
              className={`px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "VERIFY"
                  ? "text-blue-400 border-blue-400 bg-slate-900/80"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
              onClick={() => setActiveTab("VERIFY")}
            >
              <SearchIcon className="w-3.5 h-3.5" />
              <span>Plate Verification</span>
            </button>

            <button
              type="button"
              className={`px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "DETECTIONS"
                  ? "text-blue-400 border-blue-400 bg-slate-900/80"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
              onClick={() => setActiveTab("DETECTIONS")}
            >
              <CarIcon className="w-3.5 h-3.5" />
              <span>Plate Detections</span>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                DB
              </span>
            </button>

            <button
              type="button"
              className={`px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "RECORDS"
                  ? "text-blue-400 border-blue-400 bg-slate-900/80"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
              onClick={() => setActiveTab("RECORDS")}
            >
              <DatabaseIcon className="w-3.5 h-3.5" />
              <span>Watchlist Records</span>
              <span className="ml-1 bg-slate-800 text-slate-300 text-[10px] font-mono px-1.5 py-0.2 rounded border border-slate-700">
                {stats.totalRecords}
              </span>
            </button>

            <button
              type="button"
              className={`px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "ALERTS"
                  ? "text-red-400 border-red-400 bg-slate-900/80"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
              onClick={() => setActiveTab("ALERTS")}
            >
              <AlertTriangleIcon className="w-3.5 h-3.5" />
              <span>Alert History</span>
              {stats.newAlerts > 0 && (
                <span className="ml-1 bg-red-600/90 text-white text-[10px] font-mono font-bold px-1.5 py-0.2 rounded">
                  {stats.newAlerts}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                activeTab === "AUDIT"
                  ? "text-blue-400 border-blue-400 bg-slate-900/80"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
              onClick={() => setActiveTab("AUDIT")}
            >
              <ClipboardListIcon className="w-3.5 h-3.5" />
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

        {activeTab === "DETECTIONS" && (
          <DetectionsGridPage onViewAlert={() => setActiveTab("ALERTS")} />
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

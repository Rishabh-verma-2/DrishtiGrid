import { Settings, User, Shield, Bell, Database, Globe, Lock } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';

function SettingCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-[#141929] border border-white/7 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-white/5">
        <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-blue-400" />
        </div>
        <h2 className="font-bold text-slate-200">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/4 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-300">{label}</p>
        {desc && <p className="text-xs text-slate-600 mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0 ml-4">{children}</div>
    </div>
  );
}

function Toggle({ defaultChecked = false }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" defaultChecked={defaultChecked} />
      <div className="w-10 h-5 bg-white/10 peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-5 peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
    </label>
  );
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">System configuration and preferences</p>
      </div>

      {/* Profile */}
      <SettingCard icon={User} title="Admin Profile">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-700 to-blue-500 rounded-xl flex items-center justify-center text-xl font-black text-white">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div>
            <p className="font-bold text-slate-200">{user?.name}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <p className="text-xs text-blue-400 mt-1 capitalize font-semibold">{user?.role}</p>
          </div>
        </div>
        <SettingRow label="Department" desc={user?.department || '—'} />
        <SettingRow label="Designation" desc={user?.designation || '—'} />
        <SettingRow label="District" desc={user?.district || '—'} />
      </SettingCard>

      {/* Notifications */}
      <SettingCard icon={Bell} title="Alert Notifications">
        <SettingRow label="Critical Alerts" desc="Show popup for critical severity alerts"><Toggle defaultChecked /></SettingRow>
        <SettingRow label="Camera Offline Alerts" desc="Notify when a camera goes offline"><Toggle defaultChecked /></SettingRow>
        <SettingRow label="New Incident Alerts" desc="Notify when a new incident is created"><Toggle /></SettingRow>
        <SettingRow label="Sound Notifications" desc="Play audio for high-priority alerts"><Toggle /></SettingRow>
      </SettingCard>

      {/* System */}
      <SettingCard icon={Globe} title="Map & Display">
        <SettingRow label="Map Provider" desc="OpenStreetMap (free, open source)">
          <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">Active</span>
        </SettingRow>
        <SettingRow label="Theme Appearance" desc="Switch between Light Mode (Gov Portal) and Dark Mode (Tactical Command)">
          <button
            type="button"
            onClick={toggleTheme}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              theme === 'dark' ? 'bg-blue-600 text-white shadow-md' : 'bg-amber-500 text-slate-900 shadow-sm'
            }`}
          >
            {theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
        </SettingRow>
        <SettingRow label="Auto-refresh Dashboard" desc="Refresh stats every 30 seconds"><Toggle defaultChecked /></SettingRow>
      </SettingCard>

      {/* Security */}
      <SettingCard icon={Lock} title="Security">
        <SettingRow label="Session Timeout" desc="Auto-logout after 8 hours of inactivity" />
        <SettingRow label="Two-Factor Auth" desc="Coming in next release">
          <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded-lg">Soon</span>
        </SettingRow>
        <SettingRow label="API Version" desc="REST API v1 · WebSocket active">
          <span className="text-xs font-mono text-blue-400">v1.0.0</span>
        </SettingRow>
      </SettingCard>
    </div>
  );
}

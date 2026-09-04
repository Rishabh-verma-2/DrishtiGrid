import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Lock, Home } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import useAuthStore from '../store/authStore';

export default function UnauthorizedPage() {
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isLight = theme === 'light';

  return (
    <div className={`min-h-[80vh] flex items-center justify-center p-6 ${
      isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#0a0d14] text-slate-100'
    }`}>
      <div className={`max-w-md w-full p-8 rounded-3xl border shadow-2xl text-center space-y-6 transition-colors ${
        isLight
          ? 'bg-white border-slate-200 shadow-slate-200/50'
          : 'bg-[#0e1322] border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)]'
      }`}>
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-rose-500/10 border border-rose-500/25 text-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Status & Title */}
        <div className="space-y-2">
          <span className="font-mono text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/30">
            HTTP 403 · FORBIDDEN
          </span>
          <h1 className={`text-2xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            Access Restricted
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            Your current security credentials ({user?.role || 'User'} · {user?.department || 'Department'}) do not have authorization to view this section.
          </p>
        </div>

        {/* Security Notice */}
        <div className={`p-3.5 rounded-2xl border text-left text-xs flex items-start gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-white/4 border-white/8 text-slate-400'
        }`}>
          <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-snug">
            All unauthorized navigation attempts are logged in the state security audit trail under Gujarat State Surveillance Policy.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

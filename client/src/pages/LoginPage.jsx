import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, Loader2, Lock, Mail, Users, Sun, Moon } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import GovernmentLogo from '../components/common/GovernmentLogo';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const isLight = theme === 'light';

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.email) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    return errs;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    setFieldErrors((p) => ({ ...p, [name]: '' }));
    if (error) clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    const result = await login({ email: form.email.trim().toLowerCase(), password: form.password });
    if (result.success) navigate('/dashboard');
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center relative overflow-hidden transition-colors duration-200 ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#080c16] text-slate-100'
      }`}
    >
      {/* Subtle national tricolor bar at very top */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#ff9933] via-white to-[#138808] z-30" />

      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-30">
        <button
          type="button"
          onClick={toggleTheme}
          className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all shadow-xs cursor-pointer ${
            isLight
              ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
          }`}
          title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {isLight ? <Moon className="w-4 h-4 text-slate-700" /> : <Sun className="w-4 h-4 text-amber-300" />}
          <span className="hidden sm:inline font-mono">{isLight ? 'Dark Mode' : 'Light Mode'}</span>
        </button>
      </div>

      {/* Subtle geometric background grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] opacity-20 [background-size:16px_16px] pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[440px] mx-4 my-8">
        <div
          className={`border rounded-2xl p-8 md:p-10 transition-all duration-200 ${
            isLight
              ? 'bg-white border-slate-200 shadow-xl shadow-slate-200/60'
              : 'bg-[#0b101d] border-slate-800 shadow-2xl'
          }`}
        >
          {/* Official Government Logo */}
          <div className="mb-6">
            <GovernmentLogo
              size="lg"
              department="Gujarat Home Department · Secure Portal"
              forceTheme={isLight ? 'light' : 'dark'}
            />
          </div>

          {/* Heading */}
          <h2 className={`text-xl font-black tracking-tight mb-1 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            Sign In
          </h2>
          <p className={`text-sm mb-7 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Enter your credentials to access the command center
          </p>

          {/* Server error */}
          {error && (
            <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="mb-4">
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                Email Address
              </label>
              <div className="relative">
                <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
                  isLight ? 'text-slate-400' : 'text-slate-500'
                }`} />
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="adminuser@gov.in"
                  autoComplete="email"
                  className={`w-full border rounded-xl text-sm pl-10 pr-4 py-3 outline-none transition-all ${
                    isLight
                      ? 'bg-slate-50/70 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15'
                      : 'bg-white/5 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                  } ${fieldErrors.email ? 'border-red-500! focus:ring-red-500/20!' : ''}`}
                />
              </div>
              {fieldErrors.email && (
                <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="mb-6">
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                Password
              </label>
              <div className="relative">
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
                  isLight ? 'text-slate-400' : 'text-slate-500'
                }`} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full border rounded-xl text-sm pl-10 pr-11 py-3 outline-none transition-all ${
                    isLight
                      ? 'bg-slate-50/70 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15'
                      : 'bg-white/5 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                  } ${fieldErrors.password ? 'border-red-500! focus:ring-red-500/20!' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 transition-colors cursor-pointer ${
                    isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{fieldErrors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-xl py-3.5 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin text-white" />Authenticating…</>
              ) : (
                <><Shield className="w-4 h-4 text-white" />Access Command Center</>
              )}
            </button>
          </form>

          {/* Prototype RBAC Quick-Fill Buttons */}
          <div
            className={`mt-6 p-4 rounded-2xl border transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <p className={`text-[10px] font-mono font-bold uppercase tracking-widest ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Prototype RBAC Test Accounts
              </p>
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                1-CLICK FILL
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setForm({ email: 'admin@drishtigrid.gov.in', password: 'adminpass@123' });
                  setFieldErrors({});
                  if (error) clearError();
                }}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all cursor-pointer ${
                  isLight
                    ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800 shadow-xs'
                    : 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-300'
                }`}
              >
                Admin
              </button>

              <button
                type="button"
                onClick={() => {
                  setForm({ email: 'police@drishtigrid.gov.in', password: 'policepass@123' });
                  setFieldErrors({});
                  if (error) clearError();
                }}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 shadow-xs'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                Police
              </button>

              <button
                type="button"
                onClick={() => {
                  setForm({ email: 'traffic@drishtigrid.gov.in', password: 'trafficpass@123' });
                  setFieldErrors({});
                  if (error) clearError();
                }}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 shadow-xs'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                Traffic
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className={`text-center text-[11px] mt-6 leading-relaxed ${
            isLight ? 'text-slate-500' : 'text-slate-500'
          }`}>
            Unauthorized access is prohibited under<br />
            <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
              IT Act 2000 · Government of Gujarat
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

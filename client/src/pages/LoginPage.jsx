import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Shield, AlertCircle, Loader2, Lock, Mail } from 'lucide-react';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();

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
    <div className="min-h-screen bg-[#050810] flex items-center justify-center relative overflow-hidden">

      {/* Animated grid background */}
      <div className="absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_0%,transparent_100%)]" />

      {/* Glow orbs */}
      <div className="absolute -top-48 -left-24 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute -bottom-40 -right-20 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[80px] animate-pulse [animation-delay:4s]" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[440px] mx-4">
        <div className="bg-[#0e1220]/90 border border-blue-500/15 rounded-2xl p-10 shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_40px_rgba(59,130,246,0.07)] backdrop-blur-xl">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)] shrink-0">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-[22px] font-black gradient-text leading-tight tracking-tight">DrishtiGrid</h1>
              <p className="text-[11px] text-slate-500 font-medium tracking-wide uppercase mt-0.5">Gujarat Surveillance Platform</p>
            </div>
          </div>

          {/* Gov badge */}
          <div className="inline-flex items-center gap-2 bg-blue-500/8 border border-blue-500/20 rounded-full px-3 py-1 mt-4 mb-7">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_6px_#34d399] animate-pulse-dot" />
            <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">Gujarat Home Department · Secure Portal</span>
          </div>

          {/* Heading */}
          <h2 className="text-xl font-bold text-slate-100 mb-1">Admin Sign In</h2>
          <p className="text-sm text-slate-500 mb-7">Enter your credentials to access the command center</p>

          {/* Server error */}
          {error && (
            <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="adminuser@gov.in"
                  autoComplete="email"
                  className={`w-full bg-white/4 border rounded-xl text-slate-100 text-sm pl-10 pr-4 py-3 outline-none transition-all placeholder:text-slate-600
                    ${fieldErrors.email
                      ? 'border-red-500/60 focus:ring-2 focus:ring-red-500/20'
                      : 'border-white/8 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/15 focus:bg-blue-500/5'
                    }`}
                />
              </div>
              {fieldErrors.email && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="mb-6">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full bg-white/4 border rounded-xl text-slate-100 text-sm pl-10 pr-11 py-3 outline-none transition-all placeholder:text-slate-600
                    ${fieldErrors.password
                      ? 'border-red-500/60 focus:ring-2 focus:ring-red-500/20'
                      : 'border-white/8 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/15 focus:bg-blue-500/5'
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{fieldErrors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm rounded-xl py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(59,130,246,0.5)] disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Authenticating…</>
              ) : (
                <><Shield className="w-4 h-4" />Access Command Center</>
              )}
            </button>
          </form>

          {/* Prototype RBAC Quick-Fill Buttons */}
          <div className="mt-6 p-4 bg-white/3 border border-white/8 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                Prototype RBAC Test Accounts
              </p>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
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
                className="py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-300"
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
                className="py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-300"
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
                className="py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300"
              >
                Traffic
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-slate-600 mt-5 leading-relaxed">
            Unauthorized access is prohibited under<br />
            <span className="text-slate-500 font-medium">IT Act 2000 · Government of Gujarat</span>
          </p>
        </div>
      </div>
    </div>
  );
}

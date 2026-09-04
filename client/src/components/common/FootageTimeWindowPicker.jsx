import { useState, useEffect } from 'react';
import { Clock, Calendar, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format, subHours, subDays, startOfDay, addHours } from 'date-fns';
import { useThemeStore } from '../../store/themeStore';

// Helper to format Date object into YYYY-MM-DDTHH:mm string for state
const toDateTimeLocal = (date) => {
  if (!date || isNaN(new Date(date).getTime())) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Helper to extract date and time components
const splitDateTime = (dtString) => {
  if (!dtString) {
    const now = new Date();
    return {
      date: format(now, 'yyyy-MM-dd'),
      hour: format(now, 'HH'),
      minute: '00',
    };
  }
  const d = new Date(dtString);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return {
      date: format(now, 'yyyy-MM-dd'),
      hour: format(now, 'HH'),
      minute: '00',
    };
  }
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: pad(d.getHours()),
    minute: pad(Math.floor(d.getMinutes() / 5) * 5),
  };
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export default function FootageTimeWindowPicker({ startTime, endTime, onChange }) {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  // Internal state for structured controls
  const [startState, setStartState] = useState(() => splitDateTime(startTime));
  const [endState, setEndState] = useState(() => splitDateTime(endTime));

  // Sync with prop changes if passed from outside
  useEffect(() => {
    if (startTime) setStartState(splitDateTime(startTime));
  }, [startTime]);

  useEffect(() => {
    if (endTime) setEndState(splitDateTime(endTime));
  }, [endTime]);

  // Update parent whenever state changes
  const notifyParent = (newStart, newEnd) => {
    const startIso = `${newStart.date}T${newStart.hour}:${newStart.minute}`;
    const endIso = `${newEnd.date}T${newEnd.hour}:${newEnd.minute}`;
    onChange({ startTime: startIso, endTime: endIso });
  };

  const handleStartChange = (field, val) => {
    const updated = { ...startState, [field]: val };
    setStartState(updated);
    notifyParent(updated, endState);
  };

  const handleEndChange = (field, val) => {
    const updated = { ...endState, [field]: val };
    setEndState(updated);
    notifyParent(startState, updated);
  };

  // Quick Preset Handlers
  const applyPreset = (hoursBack) => {
    const now = new Date();
    const start = subHours(now, hoursBack);
    const startVal = splitDateTime(start);
    const endVal = splitDateTime(now);
    setStartState(startVal);
    setEndState(endVal);
    notifyParent(startVal, endVal);
  };

  const applyTodayShift = (startH, endH) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const startVal = { date: today, hour: String(startH).padStart(2, '0'), minute: '00' };
    const endVal = { date: today, hour: String(endH).padStart(2, '0'), minute: '00' };
    setStartState(startVal);
    setEndState(endVal);
    notifyParent(startVal, endVal);
  };

  // Compute duration and validation
  const startDt = new Date(`${startState.date}T${startState.hour}:${startState.minute}`);
  const endDt = new Date(`${endState.date}T${endState.hour}:${endState.minute}`);
  const isValidDates = !isNaN(startDt.getTime()) && !isNaN(endDt.getTime());
  const diffMs = isValidDates ? endDt.getTime() - startDt.getTime() : 0;
  const isPositive = diffMs > 0;

  const totalMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(totalMinutes / 60);
  const diffMins = totalMinutes % 60;

  const durationString =
    diffHours > 0
      ? `${diffHours} hr${diffHours > 1 ? 's' : ''} ${diffMins > 0 ? `${diffMins} min` : ''}`
      : `${diffMins} minutes`;

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 space-y-4 transition-colors ${
        isLight ? 'bg-slate-50 border-slate-200 shadow-xs' : 'bg-[#121727] border-white/8'
      }`}
    >
      {/* ─── Top Presets Bar ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className={`text-[11px] font-black uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            Quick CCTV Range Presets:
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'Past 1h', action: () => applyPreset(1) },
            { label: 'Past 3h', action: () => applyPreset(3) },
            { label: 'Past 6h', action: () => applyPreset(6) },
            { label: 'Past 24h', action: () => applyPreset(24) },
            { label: 'Morning Shift', action: () => applyTodayShift(8, 14) },
            { label: 'Evening Shift', action: () => applyTodayShift(16, 22) },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.action}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all active:scale-95 ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-600 shadow-2xs'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Side-by-Side Start & End Controls ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* START TIME PANEL */}
        <div
          className={`p-3.5 rounded-xl border space-y-2.5 ${
            isLight ? 'bg-white border-slate-200 shadow-2xs' : 'bg-black/20 border-white/7'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]" />
              <span className={`text-xs font-black uppercase tracking-wide ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                Footage Start Time *
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
              {startState.hour}:{startState.minute} hrs
            </span>
          </div>

          {/* Date Selector */}
          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Incident Date
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={startState.date}
                onChange={(e) => handleStartChange('date', e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-semibold cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border-white/10 text-white focus:border-blue-500'
                }`}
              />
            </div>
          </div>

          {/* Time Selector (Hour & Minute) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Hour (24h)
              </label>
              <select
                value={startState.hour}
                onChange={(e) => handleStartChange('hour', e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-none cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border-white/10 text-white focus:border-blue-500'
                }`}
              >
                {HOURS.map((h) => {
                  const hourNum = parseInt(h);
                  const period = hourNum >= 12 ? 'PM' : 'AM';
                  const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
                  return (
                    <option key={h} value={h}>
                      {h}:00 ({hour12} {period})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Minute
              </label>
              <select
                value={startState.minute}
                onChange={(e) => handleStartChange('minute', e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-none cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border-white/10 text-white focus:border-blue-500'
                }`}
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    :{m} mins
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className={`text-[10px] font-medium pt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Segment begins: <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>
              {isValidDates ? format(startDt, 'dd MMM yyyy, hh:mm a') : '—'}
            </strong>
          </p>
        </div>

        {/* END TIME PANEL */}
        <div
          className={`p-3.5 rounded-xl border space-y-2.5 ${
            isLight ? 'bg-white border-slate-200 shadow-2xs' : 'bg-black/20 border-white/7'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_6px_#f43f5e]" />
              <span className={`text-xs font-black uppercase tracking-wide ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                Footage End Time *
              </span>
            </div>
            <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded">
              {endState.hour}:{endState.minute} hrs
            </span>
          </div>

          {/* Date Selector */}
          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Incident Date
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={endState.date}
                onChange={(e) => handleEndChange('date', e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-semibold cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border-white/10 text-white focus:border-blue-500'
                }`}
              />
            </div>
          </div>

          {/* Time Selector (Hour & Minute) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Hour (24h)
              </label>
              <select
                value={endState.hour}
                onChange={(e) => handleEndChange('hour', e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-none cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border-white/10 text-white focus:border-blue-500'
                }`}
              >
                {HOURS.map((h) => {
                  const hourNum = parseInt(h);
                  const period = hourNum >= 12 ? 'PM' : 'AM';
                  const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
                  return (
                    <option key={h} value={h}>
                      {h}:00 ({hour12} {period})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Minute
              </label>
              <select
                value={endState.minute}
                onChange={(e) => handleEndChange('minute', e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-none cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600'
                    : 'bg-[#161c2e] border-white/10 text-white focus:border-blue-500'
                }`}
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    :{m} mins
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className={`text-[10px] font-medium pt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Segment concludes: <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>
              {isValidDates ? format(endDt, 'dd MMM yyyy, hh:mm a') : '—'}
            </strong>
          </p>
        </div>

      </div>

      {/* ─── Duration & Verification Ribbon ─── */}
      <div
        className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between flex-wrap gap-2 text-xs font-bold ${
          !isPositive
            ? 'bg-red-500/10 border-red-500/25 text-red-500'
            : isLight
            ? 'bg-blue-50/70 border-blue-200 text-blue-900'
            : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
        }`}
      >
        <div className="flex items-center gap-2">
          {!isPositive ? (
            <>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>Footage End Time must be strictly after Footage Start Time</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                Requested Video Duration Window: <strong className="font-extrabold">{durationString}</strong>
              </span>
            </>
          )}
        </div>

        {isPositive && (
          <span className="text-[10px] font-mono opacity-80">
            Total Minutes: {totalMinutes}m
          </span>
        )}
      </div>

    </div>
  );
}

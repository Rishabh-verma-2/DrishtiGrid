import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Premium custom dropdown using React Portal so the panel escapes any
 * parent stacking context (backdrop-blur, overflow:hidden, etc.)
 */
export default function FilterDropdown({
  value,
  onChange,
  options = [],
  groups = [],
  placeholder = 'Select…',
  icon = null,
  isLight = false,
  className = '',
  maxHeight = '260px',
  width = 'min-w-[140px]',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [panelStyle, setPanelStyle] = useState({});
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  // Position the panel relative to the trigger button
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;

    setPanelStyle({
      position: 'fixed',
      left: rect.left,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? viewportHeight - rect.top + 6 : undefined,
      minWidth: rect.width,
      zIndex: 99999,
    });
  }, []);

  // Open/close
  const toggle = () => {
    if (!open) updatePosition();
    setOpen((o) => !o);
    setSearch('');
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        panelRef.current?.contains(e.target)
      ) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Re-position on scroll/resize
  useEffect(() => {
    if (!open) return;
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, updatePosition]);

  // Focus search when opening
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [open]);

  // All options (flat or from groups)
  const allOptions = groups.length ? groups.flatMap((g) => g.options) : options;
  const selected = allOptions.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder;

  const filterOpts = useCallback(
    (opts) =>
      search ? opts.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : opts,
    [search]
  );

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setSearch('');
  };

  /* ── styles ── */
  const triggerBase = `relative flex items-center gap-1.5 px-2.5 py-[7px] rounded-lg border text-xs font-medium cursor-pointer select-none outline-none transition-all duration-150`;
  const triggerLight = `bg-white border-slate-200 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 ${open ? 'border-blue-400 ring-2 ring-blue-100' : ''}`;
  const triggerDark  = `bg-white/5 border-white/10 text-slate-300 hover:bg-white/8 hover:border-white/20 ${open ? 'border-cyan-500/60 ring-2 ring-cyan-500/15 bg-white/8' : ''}`;
  const panelLight   = `bg-white border border-slate-200 shadow-2xl shadow-slate-300/50`;
  const panelDark    = `bg-[#0f1628] border border-white/12 shadow-2xl shadow-black/70`;
  const optBase      = `flex items-center gap-2 px-3 py-[7px] rounded-lg mx-1 text-xs cursor-pointer transition-colors duration-100`;
  const optLight     = `hover:bg-blue-50 text-slate-700 hover:text-blue-700`;
  const optDark      = `hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-300`;
  const activeLight  = `bg-blue-50 text-blue-700 font-semibold`;
  const activeDark   = `bg-cyan-500/15 text-cyan-300 font-semibold`;
  const groupHdrLight = `text-slate-400 text-[10px] font-bold uppercase tracking-widest`;
  const groupHdrDark  = `text-slate-500 text-[10px] font-bold uppercase tracking-widest`;

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className={`rounded-xl overflow-hidden ${isLight ? panelLight : panelDark}`}
        >
          {/* Search */}
          {allOptions.length > 6 && (
            <div className={`px-2 py-2 border-b ${isLight ? 'border-slate-100' : 'border-white/8'}`}>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className={`w-full text-xs px-2.5 py-1.5 rounded-md outline-none ${
                  isLight
                    ? 'bg-slate-50 border border-slate-200 text-slate-700 placeholder:text-slate-400 focus:border-blue-400'
                    : 'bg-white/6 border border-white/10 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50'
                }`}
              />
            </div>
          )}

          {/* Options list */}
          <div className="py-1 overflow-y-auto" style={{ maxHeight }}>
            {groups.length > 0
              ? groups.map((g) => {
                  const filtered = filterOpts(g.options);
                  if (!filtered.length) return null;
                  return (
                    <div key={g.label}>
                      <div className={`px-3 pt-2.5 pb-1 ${isLight ? groupHdrLight : groupHdrDark}`}>
                        {g.label}
                      </div>
                      {filtered.map((o) => (
                        <OptionRow
                          key={o.value}
                          opt={o}
                          selected={value === o.value}
                          isLight={isLight}
                          onSelect={handleSelect}
                          optBase={optBase}
                          optCls={isLight ? optLight : optDark}
                          activeCls={isLight ? activeLight : activeDark}
                        />
                      ))}
                    </div>
                  );
                })
              : filterOpts(options).map((o) => (
                  <OptionRow
                    key={o.value}
                    opt={o}
                    selected={value === o.value}
                    isLight={isLight}
                    onSelect={handleSelect}
                    optBase={optBase}
                    optCls={isLight ? optLight : optDark}
                    activeCls={isLight ? activeLight : activeDark}
                  />
                ))}

            {search && !filterOpts(allOptions).length && (
              <p className={`text-center text-xs py-4 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                No results for &quot;{search}&quot;
              </p>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className={`relative ${width} ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={`${triggerBase} w-full ${isLight ? triggerLight : triggerDark}`}
      >
        {icon && (
          <span className={`shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            {icon}
          </span>
        )}
        {selected?.dot && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selected.dot }} />
        )}
        <span className="flex-1 truncate text-left">{displayLabel}</span>
        {selected?.badge != null && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              isLight ? 'bg-blue-100 text-blue-600' : 'bg-cyan-500/20 text-cyan-400'
            }`}
          >
            {selected.badge}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          } ${isLight ? 'text-slate-400' : 'text-slate-500'}`}
        />
      </button>

      {/* Portal panel */}
      {panel}
    </div>
  );
}

function OptionRow({ opt, selected, isLight, onSelect, optBase, optCls, activeCls }) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(opt.value)}
      className={`${optBase} ${selected ? activeCls : optCls}`}
    >
      {opt.dot && (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.dot }} />
      )}
      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
      <span className="flex-1 truncate">{opt.label}</span>
      {opt.badge != null && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
            selected
              ? isLight ? 'bg-blue-200 text-blue-700' : 'bg-cyan-500/30 text-cyan-300'
              : isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/8 text-slate-400'
          }`}
        >
          {opt.badge}
        </span>
      )}
      {selected && (
        <Check className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-blue-500' : 'text-cyan-400'}`} />
      )}
    </div>
  );
}

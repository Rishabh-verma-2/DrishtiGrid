import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';

/**
 * Premium Custom Dropdown / Select Component for Garud Surveillance
 * Replaces native HTML <select> with a sleek, accessible, theme-styled menu.
 *
 * @param {Array<string | { value: string, label: string, icon?: any }>} options
 * @param {string} value - Selected value
 * @param {Function} onChange - (value) => void or event handler
 * @param {string} placeholder - Display text when nothing selected
 * @param {React.ReactNode} icon - Leading icon
 * @param {string} className - Additional trigger container styling
 * @param {boolean} disabled - Disabled state
 * @param {string} size - 'sm' | 'md'
 */
export default function ThemeDropdown({
  options = [],
  value,
  onChange,
  placeholder = 'Select option...',
  icon: LeadingIcon,
  className = '',
  dropdownClassName = '',
  disabled = false,
  size = 'md',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  // Normalize options to [{ value, label, icon }]
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt.value,
        label: opt.label ?? opt.value,
        icon: opt.icon,
      };
    }
    return {
      value: String(opt),
      label: String(opt),
      icon: null,
    };
  });

  const selectedOption = normalizedOptions.find(
    (opt) => String(opt.value).toLowerCase() === String(value).toLowerCase()
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (optVal) => {
    if (disabled) return;
    setIsOpen(false);
    if (typeof onChange === 'function') {
      // Support both direct value callback and synthetic event
      onChange({ target: { value: optVal } });
    }
  };

  const isSmall = size === 'sm';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border text-xs font-medium transition-all cursor-pointer outline-none select-none shadow-xs ${
          isSmall ? 'px-2.5 py-1.5' : 'px-3 py-2'
        } ${
          isOpen
            ? isLight
              ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 text-slate-900'
              : 'bg-[#0f1422] border-blue-500 ring-2 ring-blue-500/30 text-white'
            : isLight
            ? 'bg-white hover:bg-slate-50 border-slate-300 hover:border-slate-400 text-slate-800'
            : 'bg-[#0f1422] hover:bg-[#141929] border-white/10 hover:border-white/20 text-slate-200'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          {LeadingIcon && (
            <LeadingIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          )}
          {selectedOption?.icon && (
            <selectedOption.icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          )}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-500' : 'text-slate-400'
          }`}
        />
      </button>

      {/* Floating Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 mt-1.5 min-w-[170px] w-full max-h-60 overflow-y-auto rounded-xl border shadow-xl z-[3000] custom-sidebar-scrollbar p-1 animate-fadeIn backdrop-blur-md ${dropdownClassName} ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/60'
              : 'bg-[#0b101c]/95 border-white/10 text-slate-200 shadow-black/80'
          }`}
        >
          {normalizedOptions.map((opt) => {
            const isSelected =
              String(opt.value).toLowerCase() === String(value).toLowerCase();
            const Icon = opt.icon;

            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer select-none ${
                  isSelected
                    ? isLight
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'bg-blue-600/20 text-blue-400 font-bold'
                    : isLight
                    ? 'hover:bg-slate-100 text-slate-700'
                    : 'hover:bg-white/5 text-slate-300'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {Icon && <Icon className="w-3 h-3 text-blue-400 shrink-0" />}
                  <span className="truncate">{opt.label}</span>
                </span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { Shield } from 'lucide-react';

/**
 * Official Government Command Identity Logo for Garud.
 * Replaces the former vibe-coded neon gradient box with an authoritative,
 * high-precision state surveillance emblem.
 *
 * Follows strict Black, White & Blue palette:
 * - Solid deep navy / royal cobalt container
 * - High-precision vector crest / shield with optical reticle geometry
 * - Solid, high-contrast typography (zero cyan/neon gradients)
 */
export default function GovernmentLogo({
  size = 'md',
  collapsed = false,
  subtitle = 'Gujarat Surveillance Platform',
  department = 'Home Department · Gov of Gujarat',
  className = '',
  forceTheme = null, // 'light' | 'dark' | null
}) {
  const isLarge = size === 'lg';
  const isSmall = size === 'sm';

  const containerSize = isLarge ? 'w-12 h-12 rounded-xl' : isSmall ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl';
  const iconSize = isLarge ? 'w-6 h-6' : isSmall ? 'w-4 h-4' : 'w-5 h-5';

  const titleColor =
    forceTheme === 'dark'
      ? 'text-white'
      : forceTheme === 'light'
      ? 'text-slate-900'
      : 'text-slate-900 dark:text-white';

  const deptColor =
    forceTheme === 'dark'
      ? 'text-slate-400'
      : forceTheme === 'light'
      ? 'text-slate-500'
      : 'text-slate-500 dark:text-slate-400';

  return (
    <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''} ${className}`}>
      {/* Official Insignia Crest */}
      <div
        className={`${containerSize} flex items-center justify-center shrink-0 font-bold bg-blue-600 dark:bg-[#0f1d38] text-white border border-blue-700 dark:border-blue-500/40 shadow-xs relative overflow-hidden`}
        title="Government of Gujarat · Garud Command"
      >
        {/* Subtle geometric grid line accent (monochrome/blue) */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] opacity-10 [background-size:6px_6px] pointer-events-none" />

        {/* Official Shield / Crosshair Insignia */}
        <div className="relative z-10 flex items-center justify-center">
          <Shield className={`${iconSize} text-white fill-white/10`} />
          <span className="absolute w-1.5 h-1.5 rounded-full bg-white ring-2 ring-blue-600 dark:ring-blue-950" />
        </div>
      </div>

      {/* Typography — Crisp, Authoritative, Non-Gradient */}
      {!collapsed && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-tight leading-tight ${titleColor} ${
                isLarge ? 'text-2xl' : isSmall ? 'text-xs' : 'text-base'
              }`}
            >
              Garud
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
              GOV
            </span>
          </div>

          <div className="w-[165px] max-w-[170px] overflow-hidden relative mt-0.5" title={department}>
            <div className="animate-marquee-text text-[10px] font-semibold uppercase tracking-wider">
              <span className={`inline-block pr-8 ${deptColor}`}>
                {department}
              </span>
              <span className={`inline-block pr-8 ${deptColor}`}>
                {department}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

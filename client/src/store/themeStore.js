import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'light', // 'light' | 'dark'

      setTheme: (theme) => {
        set({ theme });
        applyThemeClass(theme);
      },

      toggleTheme: () => {
        const nextTheme = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: nextTheme });
        applyThemeClass(nextTheme);
      },
    }),
    {
      name: 'drishtigrid-theme-pref',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyThemeClass(state.theme);
        }
      },
    }
  )
);

export function applyThemeClass(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (theme === 'light') {
    root.classList.add('theme-light', 'light');
    root.classList.remove('theme-dark', 'dark', 'theme-gov', 'theme-tactical');
    document.body.style.backgroundColor = '#f1f5f9';
    document.body.style.color = '#0f172a';
  } else {
    root.classList.add('theme-dark', 'dark', 'theme-tactical');
    root.classList.remove('theme-light', 'light', 'theme-gov');
    document.body.style.backgroundColor = '#0a0d14';
    document.body.style.color = '#f1f5f9';
  }
}

// Initial apply on load
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem('drishtigrid-theme-pref');
    const isDark = stored?.includes('"dark"');
    applyThemeClass(isDark ? 'dark' : 'light');
  } catch (_) {
    applyThemeClass('light');
  }
}

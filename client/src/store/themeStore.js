import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'gov', // default to 'gov' (official Gujarat Government portal theme), or 'tactical' (dark command center)

      setTheme: (theme) => {
        set({ theme });
        applyThemeClass(theme);
      },

      toggleTheme: () => {
        const nextTheme = get().theme === 'gov' ? 'tactical' : 'gov';
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

function applyThemeClass(theme) {
  const root = document.documentElement;
  if (theme === 'gov') {
    root.classList.add('theme-gov');
    root.classList.remove('theme-tactical');
    document.body.style.backgroundColor = '#f1f5f9';
    document.body.style.color = '#0f172a';
  } else {
    root.classList.add('theme-tactical');
    root.classList.remove('theme-gov');
    document.body.style.backgroundColor = '#0a0d14';
    document.body.style.color = '#f1f5f9';
  }
}

// Initial apply
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('drishtigrid-theme-pref');
  const initialTheme = stored?.includes('"tactical"') ? 'tactical' : 'gov';
  applyThemeClass(initialTheme);
}

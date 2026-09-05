import { create } from 'zustand';

const SESSION_KEY = 'drishtigrid_anpr_batch_cache';

// Helper to load initial cached batch from sessionStorage safely
const loadCachedBatch = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Failed to load cached ANPR batch from sessionStorage:', err);
    return null;
  }
};

// Helper to persist batch to sessionStorage safely
const saveCachedBatch = (batch) => {
  if (typeof window === 'undefined') return;
  try {
    if (batch) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(batch));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch (err) {
    // Large base64 images might exceed 5MB quota; in-memory store still retains it!
    console.warn('Could not persist full ANPR batch to sessionStorage (quota exceeded), retained in memory store:', err);
  }
};

export const useANPRStore = create((set, get) => ({
  activeTab: 'SCANNER', // 'SCANNER' | 'VIDEO_SURVEILLANCE' | 'WATCHLIST' | 'INCIDENTS' | 'DETECTIONS'
  batchResults: loadCachedBatch(),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setBatchResults: (batchResults) => {
    set({ batchResults });
    saveCachedBatch(batchResults);
  },

  clearBatchResults: () => {
    set({ batchResults: null });
    saveCachedBatch(null);
  },
}));

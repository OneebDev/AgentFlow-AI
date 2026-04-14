/**
 * Zustand store — central state for search lifecycle.
 */

import { create } from 'zustand';

const INITIAL_STATE = {
  query:        '',
  jobId:        null,
  status:       'idle',   // idle | pending | researching | crawling | critiquing | completed | failed
  results:      null,
  errorMessage: null,
  history:      [],       // Array<{ jobId, query, completedAt }>
};

const useSearchStore = create((set, get) => ({
  ...INITIAL_STATE,

  setQuery: (query) => set({ query }),

  startJob: (jobId) =>
    set({ jobId, status: 'pending', results: null, errorMessage: null }),

  setStatus: (status) => set({ status }),

  setCompleted: (results) => {
    const { query, jobId, history } = get();
    set({
      status: 'completed',
      results,
      history: [
        { jobId, query, completedAt: new Date().toISOString() },
        ...history.slice(0, 9),
      ],
    });
  },

  setFailed: (errorMessage) => set({ status: 'failed', errorMessage }),

  reset: () => set({ ...INITIAL_STATE, history: get().history }),
}));

export default useSearchStore;

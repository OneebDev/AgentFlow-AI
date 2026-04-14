import { create } from 'zustand';

interface SearchState {
    jobId: string | null;
    status: string;
    topic: string;
    results: any | null;
    errorMessage: string | null;
    setJob: (jobId: string, topic: string) => void;
    setStatus: (status: string) => void;
    setResults: (results: any) => void;
    setError: (message: string | null) => void;
    reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
    jobId: null,
    status: 'idle',
    topic: '',
    results: null,
    errorMessage: null,
    setJob: (jobId, topic) => set({ jobId, topic, status: 'pending', errorMessage: null }),
    setStatus: (status) => set({ status }),
    setResults: (results) => set({ results, status: 'completed' }),
    setError: (message) => set({ errorMessage: message, status: 'failed' }),
    reset: () => set({ jobId: null, status: 'idle', topic: '', results: null, errorMessage: null }),
}));

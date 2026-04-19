import { create } from 'zustand';
import { IResearchResults } from '@/lib/api';

interface SearchState {
    jobId: string | null;
    status: string;
    topic: string;
    thought: string | null; // Agent's reasoning
    results: IResearchResults | null;
    errorMessage: string | null;
    setJob: (jobId: string, topic: string) => void;
    setStatus: (status: string, thought?: string) => void;
    setResults: (results: IResearchResults) => void;
    setError: (message: string | null) => void;
    reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
    jobId: null,
    status: 'idle',
    topic: '',
    thought: null,
    results: null,
    errorMessage: null,
    setJob: (jobId, topic) => set({ jobId, topic, status: 'pending', errorMessage: null, thought: 'Analyzing prompt...' }),
    setStatus: (status, thought) => set((state) => ({ 
        status, 
        thought: thought || state.thought 
    })),
    setResults: (results) => set({ results, status: 'completed' }),
    setError: (message) => set({ errorMessage: message, status: 'failed' }),
    reset: () => set({ jobId: null, status: 'idle', topic: '', results: null, errorMessage: null, thought: null }),
}));

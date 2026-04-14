import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

export type TResearchFormat = 'articles' | 'videos' | 'products' | 'news';
export type TOutputType    = 'summary'  | 'list';

export const submitResearch = async (
    topic:      string,
    format?:    TResearchFormat | null,
    language?:  string | null,
    outputType?: TOutputType | null,
    depth:      string          = 'basic',
) => {
    const { data } = await api.post('/researcher', { topic, format, language, outputType, depth });
    return data.data;
};

export const getJobStatus = async (jobId: string) => {
    const { data } = await api.get(`/researcher/${jobId}`);
    return data.data;
};

export const getJobResults = async (jobId: string) => {
    const { data } = await api.get(`/researcher/${jobId}/results`);
    return data.data;
};

/**
 * Open an SSE connection for real-time job events.
 * Returns a native EventSource — close it when done.
 *
 * Events:
 *   { type: 'status',    status: 'researching' | 'crawling' | 'critiquing' }
 *   { type: 'completed', results: { rankedList, bestResult, summary } }
 *   { type: 'failed',    error: string }
 */
export const createJobStream = (jobId: string): EventSource => {
    return new EventSource(`${API_BASE_URL}/researcher/${jobId}/stream`);
};

export default api;

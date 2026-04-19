import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Avoid crashing on network errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.message === 'Network Error') {
            console.warn('Backend is currently unreachable. Retrying...');
        }
        return Promise.reject(error);
    }
);

export type TResearchFormat = 'articles' | 'videos' | 'products' | 'news';
export type TOutputType    = 'summary'  | 'list';

export type TMessageRole = 'user' | 'agent';
export type TJobStatus = 'idle' | 'pending' | 'researching' | 'crawling' | 'critiquing' | 'completed' | 'failed';
export type TAssistantMode =
    | 'casual_chat'
    | 'learning'
    | 'knowledge'
    | 'research'
    | 'resources'
    | 'leads'
    | 'scraping'
    | 'business_strategy'
    | 'summary'
    | 'coding'
    | 'comparison'
    | 'planning';

export interface IHistoryMessage {
    role: TMessageRole;
    content: string;
}

export interface IResponseContract {
    mode: TAssistantMode;
    language: string;
    languageStyle: string;
    exactCount: number | null;
    sections: string[];
    askOnlyIfNecessary: boolean;
    historyApplied: boolean;
    policyVersion?: string;
    renderStyle?: 'chat' | 'guided' | 'report' | 'list' | 'bullets' | 'code';
}

export interface IRankedResult {
    rank: number;
    score: number;
    title: string;
    url: string;
    description: string;
    sourceType: string;
    reason?: string;
    website?: string;
    industry?: string;
    location?: string;
    email?: string;
    phoneNumber?: string;
    contactMethod?: string;
    decisionMakerRole?: string;
    businessGap?: string;
    whatYouCanSell?: string;
    sellingStrategy?: string;
    outreachMessage?: string;
    resourceType?: string;
    publishedDate?: string;
    author?: string;
    confidenceScore?: number;
    linkedinUrl?: string;
    companySize?: string;
    estimatedRevenue?: string;
    techStack?: string;
    justification?: string;
    keyPoints?: string[];
    references?: string[];
}

export interface IResearchResults {
    summary?: string | null;
    rankedList: IRankedResult[];
    bestResult?: IRankedResult | null;
    keyPoints?: string[];
    contract?: IResponseContract;
}

export interface IResearchResponseData {
    jobId: string;
    status: TJobStatus;
    message?: string;
    mode?: TAssistantMode;
    language?: string;
}

export type TStreamEvent =
    | { type: 'status'; status: Exclude<TJobStatus, 'idle' | 'pending'>; thought?: string; isBusinessStrategy?: boolean }
    | { type: 'partial_results'; results: IRankedResult[] }
    | { type: 'completed'; results: IResearchResults | null }
    | { type: 'failed'; error: string };

export const submitResearch = async (
    topic:       string,
    format?:     TResearchFormat | null,
    language?:   string | null,
    outputType?: TOutputType | null,
    depth:       string          = 'basic',
    history:     IHistoryMessage[] = []
): Promise<IResearchResponseData> => {
    const { data } = await api.post('/researcher', { topic, format, language, outputType, depth, history });
    return data.data;
};

export const getJobStatus = async (jobId: string): Promise<IResearchResponseData> => {
    const { data } = await api.get(`/researcher/${jobId}`);
    return data.data;
};

export const getJobResults = async (jobId: string): Promise<IResearchResults | null> => {
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

export const getSuggestions = async (prompt: string): Promise<string[]> => {
    if (!prompt || prompt.length < 3) return [];
    try {
        const { data } = await api.get(`/researcher/suggest?q=${encodeURIComponent(prompt)}`);
        return data.data || [];
    } catch {
        // Silently fail suggestions to avoid UI crashes
        return [];
    }
};

export default api;

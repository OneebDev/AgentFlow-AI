export type TResearchFormat = 'articles' | 'videos' | 'products' | 'news';
export type TOutputType = 'summary' | 'list';

export interface IHistoryMessage {
    role: 'user' | 'agent';
    content: string;
}

export interface IResearchRequest {
    topic: string;
    format?: TResearchFormat;
    language?: string;
    outputType?: TOutputType;
    depth?: 'basic' | 'detailed';
    options?: Record<string, any>;
    history?: IHistoryMessage[];
}

export interface IClarificationResponse {
    status: 'clarification_needed';
    message: string;
    missing: string[];
    hint: string;
}

export interface IResearchResponse {
    jobId?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'clarification_needed';
    data?: any;
    message?: string;
    missing?: string[];
    hint?: string;
}

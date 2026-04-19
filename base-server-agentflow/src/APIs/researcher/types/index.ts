import { IFinalResultData, IPlannerHistoryMessage } from '../../_shared/types/agents.interface';

export type TResearchFormat = 'articles' | 'videos' | 'products' | 'news';
export type TOutputType = 'summary' | 'list';
export type TResearchDepth = 'basic' | 'detailed';
export type TResearchStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'clarification_needed'
    | 'researching'
    | 'crawling'
    | 'critiquing';

export type IHistoryMessage = IPlannerHistoryMessage;

export interface IResearchRequest {
    topic: string;
    format?: TResearchFormat;
    language?: string;
    outputType?: TOutputType;
    depth?: TResearchDepth;
    options?: Record<string, unknown>;
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
    status: TResearchStatus;
    data?: IFinalResultData | null;
    message?: string;
    missing?: string[];
    hint?: string;
    mode?: import('../../_shared/types/agents.interface').TAssistantMode;
    language?: string;
}

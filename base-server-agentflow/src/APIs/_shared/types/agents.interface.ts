/**
 * Shared Agent Types & Constants
 * Standardizes job life cycle across all modules.
 */

export enum EJobStatus {
    PENDING = 'PENDING',
    RESEARCHING = 'RESEARCHING',
    CRAWLING = 'CRAWLING',
    CRITIQUING = 'CRITIQUING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

export enum EQueueName {
    RESEARCH = 'research-queue',
    CRAWL = 'crawl-queue',
    CRITIC = 'critic-queue',
    RESULTS = 'results-queue',
}

export type TSourceType =
    | 'tavily'
    | 'serper'
    | 'serper-news'
    | 'google'
    | 'youtube'
    | 'scraper'
    | 'brave';

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

export type TLanguageStyle = 'english' | 'roman_urdu' | 'urdu' | 'hindi' | 'mixed';
export type TIntent = 'learning' | 'news' | 'shopping' | 'general';
export type TOutputFormat = 'article' | 'video' | 'news' | 'mixed';
export type TJobStageStatus = 'researching' | 'crawling' | 'critiquing';

export interface IAssistantResponseContract {
    mode: TAssistantMode;
    language: string;
    languageStyle: TLanguageStyle;
    exactCount: number | null;
    sections: string[];
    askOnlyIfNecessary: boolean;
    historyApplied: boolean;
    policyVersion?: string;
    renderStyle?: 'chat' | 'guided' | 'report' | 'list' | 'bullets' | 'code';
}

export interface IBaseCrawlResult {
    sourceType: TSourceType;
    title: string;
    url: string;
    description: string;
    query?: string;
    website?: string;
    industry?: string;
    location?: string;
    platform?: string;
    email?: string;
    phoneNumber?: string;
    contactMethod?: string;
}

export interface ITavilyResult extends IBaseCrawlResult {
    sourceType: 'tavily';
    score: number;
}

export interface IGoogleResult extends IBaseCrawlResult {
    sourceType: 'google';
    position: number;
    displayUrl: string;
}

export interface ISerperResult extends IBaseCrawlResult {
    sourceType: 'serper' | 'serper-news';
    position: number;
}

export interface IBraveResult extends IBaseCrawlResult {
    sourceType: 'brave';
}

export interface IYouTubeResult extends IBaseCrawlResult {
    sourceType: 'youtube';
    id: string;
    channelTitle: string;
    publishedAt: string;
    thumbnailUrl?: string;
}

export interface IScraperResult extends IBaseCrawlResult {
    sourceType: 'scraper';
    content: string;
    scrapedAt: string;
    emails?: string[];
    phoneNumbers?: string[];
}

export type TCrawlResult =
    | ITavilyResult
    | IGoogleResult
    | ISerperResult
    | IBraveResult
    | IYouTubeResult
    | IScraperResult;

export interface IRankedResult extends IBaseCrawlResult {
    rank: number;
    score: number;
    reason: string;
    // Lead-specific fields
    decisionMakerRole?: string;
    businessGap?: string;
    whatYouCanSell?: string;
    sellingStrategy?: string;
    outreachMessage?: string;
    confidenceScore?: number;
    linkedinUrl?: string;
    companySize?: string;
    estimatedRevenue?: string;
    techStack?: string;
    // Resource/content fields
    resourceType?: string;
    publishedDate?: string;
    author?: string;
    // Universal justification fields
    justification?: string;
    keyPoints?: string[];
    references?: string[];
}

export interface IFinalResultData {
    bestResult: IRankedResult | null;
    rankedList: IRankedResult[];
    summary: string | null;
    keyPoints: string[];
    contract?: IAssistantResponseContract;
}

export interface IPlannerHistoryMessage {
    role: 'user' | 'agent';
    content: string;
}

export interface IPlannerResult {
    thought: string;
    mode: TAssistantMode;
    clarificationNeeded: boolean;
    clarificationQuestion: string;
    missingFields: string[];
    internalRefinedTopic: string;
    directAnswer: string;
    queries: string[];
    language: string;
    languageStyle: TLanguageStyle;
    format: 'articles' | 'videos' | 'products' | 'news';
    outputType: 'summary' | 'list';
    requestedQuantity: number | null;
    isBusinessStrategy: boolean;
    responseSections: string[];
    preferAuthenticatedLeads: boolean;
    followUpQuestionBudget: number;
}

export interface IAgentJobMetadata {
    thought?: string;
    searchQueries?: string[];
    format?: string;
    language?: string;
    outputType?: string;
    depth?: string;
    mode?: TAssistantMode;
    languageStyle?: TLanguageStyle;
    exactCount?: number | null;
    missingFields?: string[];
    memoryContext?: string;
    responseContract?: IAssistantResponseContract;
}

export interface IAgentJobRecord {
    userId: string;
    query: string;
    status: EJobStatus;
    errorMessage?: string | null;
    metadata?: IAgentJobMetadata;
}

export interface IAgentJobPayload {
    jobId: string;
    userId: string;
    query: string;
    format?: 'articles' | 'videos' | 'products' | 'news';
    language?: string;
    languageStyle?: TLanguageStyle;
    requestedQuantity?: number | null;
    outputType?: 'summary' | 'list';
    intent?: TIntent;
    mode?: TAssistantMode;
    outputFormat?: TOutputFormat;
    searchQueries?: string[];
    sources?: TSourceType[];
    rawResults?: TCrawlResult[];
    bestResult?: IRankedResult | null;
    rankedList?: IRankedResult[];
    summary?: string;
    responseContract?: IAssistantResponseContract;
    createdAt?: Date;
    _id?: string;
}

export type TJobEvent =
    | { type: 'status'; status: TJobStageStatus; thought?: string; isBusinessStrategy?: boolean }
    | { type: 'partial_results'; results: TCrawlResult[] }
    | { type: 'completed'; results: IFinalResultData | null }
    | { type: 'failed'; error: string };

export interface ICrawlFetchResult {
    type: TSourceType;
    results: TCrawlResult[];
}

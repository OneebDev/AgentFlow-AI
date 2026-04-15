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

export interface IAgentJobPayload {
    jobId: string;
    userId: string;
    query: string;
    format?: string;          // 'articles' | 'videos' | 'products' | 'news'
    language?: string;        // e.g. 'English', 'Urdu', 'Hindi'
    requestedQuantity?: number | null;
    outputType?: string;      // 'summary' | 'list'
    intent?: string;
    outputFormat?: string;    // mapped from format for Critic filter
    searchQueries?: string[];
    sources?: string[];
    rawResults?: any[];
    bestResult?: any;
    rankedList?: any[];
    summary?: string;
    createdAt?: Date;
}

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import finalRepo from '../_shared/repo/final-result.repository';
import jobRepo from '../_shared/repo/agent-job.repository';
import {
    IAssistantResponseContract,
    EJobStatus,
    EQueueName,
    IFinalResultData,
    TIntent,
    TOutputFormat,
    TSourceType,
} from '../_shared/types/agents.interface';
import { createQueue } from '../../utils/queue';
import { publishJobEvent } from '../../utils/pubsub';
import { IResearchRequest, IResearchResponse, TResearchFormat } from './types';
import { planResearch } from './processors/planner';
import cache from '../../utils/cache';
import { buildResponseContract } from '../critic/processors/ranker';
import { summarizeHistory } from '../../config/assistant';

const crawlQueue = createQueue(EQueueName.CRAWL);
const suggestionGrok = new OpenAI({ apiKey: process.env.XAI_API_KEY || '', baseURL: process.env.XAI_BASE_URL || 'https://api.groq.com/openai/v1', timeout: 3000 });
const suggestionOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 3000 });
const suggestionGemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function resolveFormatConfig(format: TResearchFormat): {
    sources: TSourceType[];
    outputFormat: TOutputFormat;
    intent: TIntent;
} {
    switch (format) {
        case 'articles':
            return { sources: ['tavily', 'google'], outputFormat: 'article', intent: 'learning' };
        case 'videos':
            return { sources: ['youtube'], outputFormat: 'video', intent: 'learning' };
        case 'news':
            return { sources: ['serper-news'], outputFormat: 'news', intent: 'news' };
        case 'products':
            return { sources: ['serper'], outputFormat: 'mixed', intent: 'shopping' };
        default:
            return { sources: ['serper'], outputFormat: 'mixed', intent: 'general' };
    }
}

export class ResearcherService {
    async initiateResearch(data: IResearchRequest): Promise<IResearchResponse> {
        const plan = await planResearch(data.topic, data.history);
        const refinedTopic = plan.internalRefinedTopic || data.topic;
        const finalFormat = data.format || plan.format;
        const finalLanguage = data.language || plan.language;
        const finalOutputType = data.outputType || plan.outputType;
        const historyContext = summarizeHistory(data.history || []);
        const responseContract = buildResponseContract(
            plan.mode,
            finalLanguage,
            plan.languageStyle,
            plan.requestedQuantity,
            (data.history || []).length > 0
        );

        const { sources: initialSources, outputFormat, intent } = resolveFormatConfig(finalFormat);
        const sources = [...initialSources];

        if (finalFormat === 'articles' && !sources.includes('tavily')) {
            sources.push('tavily');
        }

        if (plan.isBusinessStrategy) {
            if (!sources.includes('scraper')) sources.push('scraper');
            if (!sources.includes('google')) sources.push('google');
        }

        const job = await jobRepo.createJob({
            userId: 'default_user',
            query: refinedTopic,
            status: EJobStatus.PENDING,
            metadata: {
                thought: plan.thought,
                searchQueries: plan.queries,
                format: finalFormat,
                language: finalLanguage,
                mode: plan.mode,
                languageStyle: plan.languageStyle,
                exactCount: plan.requestedQuantity,
                missingFields: plan.missingFields,
                memoryContext: historyContext,
                responseContract,
                outputType: finalOutputType,
                depth: data.depth,
            },
        });

        const jobId = job._id.toString();
        await jobRepo.updateJobStatus(jobId, EJobStatus.RESEARCHING);
        publishJobEvent(jobId, {
            type: 'status',
            status: 'researching',
            thought: plan.thought,
            isBusinessStrategy: plan.isBusinessStrategy,
        });

        if (plan.clarificationNeeded || plan.directAnswer) {
            const responseText = plan.clarificationQuestion || plan.directAnswer;
            const finalResult: IFinalResultData = {
                summary: responseText,
                rankedList: [],
                bestResult: null,
                keyPoints: [],
                contract: responseContract,
            };

            await jobRepo.updateJobStatus(jobId, EJobStatus.COMPLETED);
            await finalRepo.createFinalResult(jobId, finalResult);
            setTimeout(() => {
                publishJobEvent(jobId, { type: 'completed', results: finalResult });
            }, 500);

            return {
                jobId,
                status: 'completed',
                message: responseText,
                mode: plan.mode,
                language: finalLanguage,
            };
        }

        await crawlQueue.add(`crawl:${jobId}`, {
            jobId,
            userId: 'default_user',
            query: refinedTopic,
            searchQueries: plan.queries,
            format: finalFormat,
            language: finalLanguage,
            languageStyle: plan.languageStyle,
            requestedQuantity: plan.requestedQuantity,
            outputType: finalOutputType,
            sources,
            intent,
            mode: plan.mode,
            outputFormat,
            responseContract,
        });

        return {
            jobId,
            status: 'researching',
            message: plan.thought,
            mode: plan.mode,
            language: finalLanguage,
        };
    }

    async getStatus(jobId: string): Promise<IResearchResponse> {
        const job = await jobRepo.findJobById(jobId);
        if (!job) {
            return { jobId, status: 'failed', message: 'Job not found' };
        }

        const metadata = (job.metadata ?? {}) as Record<string, unknown>;

        return {
            jobId,
            status: mapJobStatus(job.status),
            message: job.errorMessage || `Agent status: ${job.status}`,
            mode: normalizeStoredMode(metadata.mode),
            language: typeof metadata.language === 'string' ? metadata.language : undefined,
        };
    }

    async getResults(jobId: string): Promise<IFinalResultData | null> {
        const results = await finalRepo.findByJobId(jobId);
        if (!results) return null;

        return {
            bestResult: results.bestResult as IFinalResultData['bestResult'],
            rankedList: results.rankedList as IFinalResultData['rankedList'],
            summary: typeof results.summary === 'string' ? results.summary : null,
            keyPoints: Array.isArray(results.keyPoints)
                ? results.keyPoints.filter((point): point is string => typeof point === 'string')
                : [],
            contract: isResponseContract(results.contract) ? results.contract : undefined,
        };
    }

    async suggest(prompt: string): Promise<string[]> {
        const promptTrimmed = prompt.trim();
        if (promptTrimmed.length < 3) return [];

        try {
            const cacheKey = cache.buildKey('suggest', Buffer.from(promptTrimmed.toLowerCase()).toString('base64'));
            const cached = await cache.get<string[]>(cacheKey);
            if (cached) return cached;

            const engine = (process.env.AI_ENGINE || 'grok').toLowerCase();
            const suggestionSystemPrompt = `You are a Live AI Search Suggestion Engine. Generate 5 smart completions instantly. Return JSON like {"suggestions":["...", "..."]}.`;
            let rawSuggestion = '';

            if (engine === 'gemini' && process.env.GEMINI_API_KEY) {
                const model = suggestionGemini.getGenerativeModel({
                    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
                    systemInstruction: suggestionSystemPrompt,
                    generationConfig: { responseMimeType: 'application/json' },
                });
                const result = await model.generateContent(`Prompt: "${promptTrimmed}"`);
                rawSuggestion = result.response.text();
            } else {
                const client = engine === 'openai' ? suggestionOpenAI : suggestionGrok;
                const model = engine === 'openai' ? (process.env.OPENAI_MODEL || 'gpt-4o') : (process.env.XAI_MODEL || 'grok-3');
                const response = await client.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: suggestionSystemPrompt },
                        { role: 'user', content: `Prompt: "${promptTrimmed}"` },
                    ],
                    response_format: { type: 'json_object' },
                });
                rawSuggestion = response.choices[0].message.content || '{"suggestions": []}';
            }

            const parsed = JSON.parse(rawSuggestion) as unknown;
            const results = extractSuggestions(parsed).slice(0, 3);
            await cache.set(cacheKey, results, 3600 * 24);
            return results;
        } catch {
            return [];
        }
    }
}

function mapJobStatus(status: string): IResearchResponse['status'] {
    switch (status) {
        case 'RESEARCHING':
            return 'researching';
        case 'CRAWLING':
            return 'crawling';
        case 'CRITIQUING':
            return 'critiquing';
        case 'COMPLETED':
            return 'completed';
        case 'FAILED':
            return 'failed';
        case 'PENDING':
        default:
            return 'pending';
    }
}

function extractSuggestions(parsed: unknown): string[] {
    if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string');
    }

    if (!parsed || typeof parsed !== 'object') {
        return [];
    }

    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.suggestions)) {
        return record.suggestions.filter((value): value is string => typeof value === 'string');
    }
    if (Array.isArray(record.queries)) {
        return record.queries.filter((value): value is string => typeof value === 'string');
    }

    const firstValue = Object.values(record)[0];
    if (Array.isArray(firstValue)) {
        return firstValue.filter((value): value is string => typeof value === 'string');
    }

    return Object.values(record).filter((value): value is string => typeof value === 'string');
}

function isResponseContract(value: unknown): value is IAssistantResponseContract {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.mode === 'string' && typeof record.language === 'string';
}

function normalizeStoredMode(value: unknown): IResearchResponse['mode'] {
    switch (value) {
        case 'casual_chat':
        case 'learning':
        case 'knowledge':
        case 'research':
        case 'resources':
        case 'leads':
        case 'scraping':
        case 'business_strategy':
        case 'summary':
        case 'coding':
        case 'comparison':
        case 'planning':
            return value;
        default:
            return undefined;
    }
}

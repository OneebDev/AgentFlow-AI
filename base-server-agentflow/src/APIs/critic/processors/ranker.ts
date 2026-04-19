import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import logger from '../../../handlers/logger';
import {
    IAssistantResponseContract,
    IFinalResultData,
    IRankedResult,
    TCrawlResult,
    TSourceType,
} from '../../_shared/types/agents.interface';
import {
    ACTIVE_ASSISTANT_POLICY_VERSION,
    buildRankerPrompt,
    getAssistantModePolicy,
} from '../../../config/assistant';

const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY || '',
    baseURL: process.env.XAI_BASE_URL || 'https://api.groq.com/openai/v1',
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

type TAIEngine = 'grok' | 'openai' | 'gemini';

function getEngine(): TAIEngine {
    const e = (process.env.AI_ENGINE || 'grok').toLowerCase();
    if (e === 'openai') return 'openai';
    if (e === 'gemini') return 'gemini';
    return 'grok';
}

function isQuotaOrAuthError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes('429') || msg.includes('quota') || msg.includes('exceeded') || msg.includes('billing') || msg.includes('401') || msg.includes('invalid_api_key');
}

export async function rankWithGemini(
    originalQuery: string,
    mode: IAssistantResponseContract['mode'],
    outputFormat: string,
    outputType: string,
    language: string,
    requestedQuantity: number | null,
    candidates: TCrawlResult[],
    contract: IAssistantResponseContract
): Promise<IFinalResultData> {
    const slimCandidates = candidates.slice(0, 50).map((candidate, index) => ({
        index,
        sourceType: candidate.sourceType,
        title: candidate.title,
        url: candidate.url,
        description: candidate.description.slice(0, 250),
        website: candidate.website || candidate.url,
        industry: candidate.industry || '',
        location: candidate.location || '',
        platform: candidate.platform || '',
        email: candidate.email || ('emails' in candidate ? candidate.emails?.[0] : ''),
        phoneNumber: candidate.phoneNumber || ('phoneNumbers' in candidate ? candidate.phoneNumbers?.[0] : ''),
        contactMethod: candidate.contactMethod || '',
    }));

    const prompt = JSON.stringify({
        query: originalQuery,
        mode,
        outputFormat,
        outputType,
        language,
        contract,
        candidates: slimCandidates,
    });

    const systemPrompt = buildRankerPrompt(language, requestedQuantity);

    const runGrokRanker = async (): Promise<string> => {
        const response = await grok.chat.completions.create({
            model: process.env.XAI_MODEL || 'grok-3',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 4096,
        });
        return response.choices[0].message.content || '{}';
    };

    const runOpenAIRanker = async (): Promise<string> => {
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 4096,
        });
        return response.choices[0].message.content || '{}';
    };

    const runGeminiRanker = async (): Promise<string> => {
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
            systemInstruction: systemPrompt,
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
        });
        const result = await model.generateContent(prompt);
        return result.response.text();
    };

    const engine = getEngine();

    try {
        let raw = '';
        let usedEngine = engine;

        if (engine === 'grok') {
            try {
                raw = await runGrokRanker();
            } catch (grokErr) {
                logger.warn('Grok ranking failed — falling back to OpenAI', { meta: { err: grokErr instanceof Error ? grokErr.message : '' } });
                try {
                    raw = await runOpenAIRanker();
                    usedEngine = 'openai';
                } catch (oaiErr) {
                    if (process.env.GEMINI_API_KEY) {
                        logger.warn('OpenAI ranking failed — falling back to Gemini');
                        raw = await runGeminiRanker();
                        usedEngine = 'gemini';
                    } else {
                        throw oaiErr;
                    }
                }
            }
        } else if (engine === 'openai') {
            try {
                raw = await runOpenAIRanker();
            } catch (oaiErr) {
                if (isQuotaOrAuthError(oaiErr) && process.env.GEMINI_API_KEY) {
                    logger.warn('OpenAI quota — falling back to Gemini for ranking');
                    raw = await runGeminiRanker();
                    usedEngine = 'gemini';
                } else {
                    throw oaiErr;
                }
            }
        } else {
            raw = await runGeminiRanker();
        }

        const parsed = parseRankerResponse(raw, contract, requestedQuantity);
        logger.info('Ranking complete', {
            meta: { engine: usedEngine, ranked: parsed.rankedList.length, mode },
        });
        return parsed;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown ranking error';
        logger.error('Ranking failed - using heuristic fallback', { meta: { err: message, mode } });
        return heuristicRank(candidates, originalQuery, contract, requestedQuantity);
    }
}

function buildHeuristicSummary(query: string, mode: IAssistantResponseContract['mode'], top: IRankedResult[]): string {
    const count = top.length;
    const titles = top.slice(0, 3).map((r) => r.title).filter(Boolean).join(', ');

    switch (mode) {
        case 'casual_chat':
            return 'How can I help you today?';
        case 'learning':
        case 'knowledge':
            return `Here are the top ${count} sources about "${query}"${titles ? `: ${titles}` : ''}. Review each source for a detailed explanation.`;
        case 'leads':
            return count > 0
                ? `Found ${count} potential lead${count !== 1 ? 's' : ''} for "${query}". Review each entry for contact details and outreach strategy.`
                : `No verified leads found for "${query}". Try narrowing the industry or location.`;
        case 'resources':
            return count > 0
                ? `Found ${count} resource${count !== 1 ? 's' : ''} for "${query}".`
                : `No resources found for "${query}". Try a different format or topic.`;
        case 'research':
            return `Found ${count} relevant source${count !== 1 ? 's' : ''} for "${query}"${titles ? `. Key references: ${titles}` : ''}.`;
        case 'business_strategy':
            return `Found ${count} market intelligence source${count !== 1 ? 's' : ''} for "${query}". Use these to shape your strategy.`;
        default:
            return count > 0
                ? `Found ${count} result${count !== 1 ? 's' : ''} for "${query}".`
                : `No results found for "${query}".`;
    }
}

function heuristicRank(
    candidates: TCrawlResult[],
    query: string,
    contract: IAssistantResponseContract,
    requestedQuantity: number | null
): IFinalResultData {
    const exactCount = requestedQuantity ?? fallbackExactCount(contract.mode);
    const shortlisted = shortlistCandidates(candidates, contract.mode).slice(0, exactCount);
    const top: IRankedResult[] = shortlisted.map((candidate, index) => ({
        rank: index + 1,
        score: 80,
        sourceType: candidate.sourceType,
        title: candidate.title,
        url: candidate.url,
        description: candidate.description,
        query: candidate.query,
        website: candidate.website || candidate.url,
        industry: candidate.industry,
        location: candidate.location,
        platform: candidate.platform,
        email: candidate.email || ('emails' in candidate ? candidate.emails?.[0] : undefined),
        phoneNumber: candidate.phoneNumber || ('phoneNumbers' in candidate ? candidate.phoneNumbers?.[0] : undefined),
        contactMethod: candidate.contactMethod || defaultContactMethod(candidate),
        decisionMakerRole: '',
        businessGap: '',
        whatYouCanSell: '',
        sellingStrategy: '',
        outreachMessage: '',
        resourceType: inferResourceType(candidate),
        reason: 'Fallback heuristic ranking',
    }));

    return {
        rankedList: top,
        bestResult: top[0] ?? null,
        summary: buildHeuristicSummary(query, contract.mode, top),
        keyPoints: contract.sections,
        contract,
    };
}

function parseRankerResponse(
    raw: string,
    contract: IAssistantResponseContract,
    requestedQuantity: number | null
): IFinalResultData {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid ranker response');
    }

    const record = parsed as Record<string, unknown>;
    const exactCount = requestedQuantity ?? fallbackExactCount(contract.mode);
    const rankedList = Array.isArray(record.rankedList)
        ? record.rankedList
              .map(normalizeRankedResult)
              .filter((item): item is IRankedResult => item !== null)
              .filter((item) => isAllowedRankedResult(item, contract.mode))
              .slice(0, exactCount)
        : [];
    const bestResult = normalizeRankedResult(record.bestResult);
    const summary = typeof record.summary === 'string' ? record.summary : null;
    const keyPoints = Array.isArray(record.keyPoints)
        ? record.keyPoints.filter((point): point is string => typeof point === 'string')
        : contract.sections;

    return {
        rankedList,
        bestResult: bestResult && isAllowedRankedResult(bestResult, contract.mode) ? bestResult : rankedList[0] ?? null,
        summary,
        keyPoints,
        contract,
    };
}

function normalizeRankedResult(value: unknown): IRankedResult | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const entry = value as Record<string, unknown>;
    const sourceType = normalizeSourceType(entry.sourceType);

    return {
        rank: typeof entry.rank === 'number' ? entry.rank : 0,
        score: typeof entry.score === 'number' ? entry.score : 0,
        title: typeof entry.title === 'string' ? entry.title : '',
        url: typeof entry.url === 'string' ? entry.url : '',
        description: typeof entry.description === 'string' ? entry.description : '',
        reason: typeof entry.reason === 'string' ? entry.reason : '',
        sourceType,
        query: typeof entry.query === 'string' ? entry.query : undefined,
        website: typeof entry.website === 'string' ? entry.website : undefined,
        industry: typeof entry.industry === 'string' ? entry.industry : undefined,
        location: typeof entry.location === 'string' ? entry.location : undefined,
        platform: typeof entry.platform === 'string' ? entry.platform : undefined,
        email: typeof entry.email === 'string' ? entry.email : undefined,
        phoneNumber: typeof entry.phoneNumber === 'string' ? entry.phoneNumber : undefined,
        contactMethod: typeof entry.contactMethod === 'string' ? entry.contactMethod : undefined,
        decisionMakerRole: typeof entry.decisionMakerRole === 'string' ? entry.decisionMakerRole : undefined,
        businessGap: typeof entry.businessGap === 'string' ? entry.businessGap : undefined,
        whatYouCanSell: typeof entry.whatYouCanSell === 'string' ? entry.whatYouCanSell : undefined,
        sellingStrategy: typeof entry.sellingStrategy === 'string' ? entry.sellingStrategy : undefined,
        outreachMessage: typeof entry.outreachMessage === 'string' ? entry.outreachMessage : undefined,
        confidenceScore: typeof entry.confidenceScore === 'number' ? entry.confidenceScore : undefined,
        linkedinUrl: typeof entry.linkedinUrl === 'string' ? entry.linkedinUrl : undefined,
        companySize: typeof entry.companySize === 'string' ? entry.companySize : undefined,
        estimatedRevenue: typeof entry.estimatedRevenue === 'string' ? entry.estimatedRevenue : undefined,
        techStack: typeof entry.techStack === 'string' ? entry.techStack : undefined,
        justification: typeof entry.justification === 'string' ? entry.justification : undefined,
        keyPoints: Array.isArray(entry.keyPoints) ? entry.keyPoints.filter((p): p is string => typeof p === 'string') : undefined,
        references: Array.isArray(entry.references) ? entry.references.filter((r): r is string => typeof r === 'string') : undefined,
        resourceType: typeof entry.resourceType === 'string' ? entry.resourceType : undefined,
        publishedDate: typeof entry.publishedDate === 'string' ? entry.publishedDate : undefined,
        author: typeof entry.author === 'string' ? entry.author : undefined,
    };
}

function normalizeSourceType(value: unknown): TSourceType {
    switch (value) {
        case 'tavily':
        case 'serper':
        case 'serper-news':
        case 'google':
        case 'youtube':
        case 'scraper':
        case 'brave':
            return value;
        default:
            return 'google';
    }
}

function fallbackExactCount(mode: IAssistantResponseContract['mode']): number {
    return mode === 'resources' || mode === 'leads' ? 5 : 3;
}

function defaultContactMethod(candidate: TCrawlResult): string {
    if (candidate.email) return 'Email';
    if (candidate.phoneNumber) return 'Phone';
    if ('emails' in candidate && candidate.emails?.length) return 'Email';
    if ('phoneNumbers' in candidate && candidate.phoneNumbers?.length) return 'Phone';
    return 'Available on website';
}

function inferResourceType(candidate: TCrawlResult): string {
    if (candidate.sourceType === 'youtube') return 'video';
    if (candidate.sourceType === 'scraper') return 'website';
    return 'article';
}

function shortlistCandidates(
    candidates: TCrawlResult[],
    mode: IAssistantResponseContract['mode']
): TCrawlResult[] {
    const filtered = candidates.filter((candidate) => isAllowedLeadCandidate(candidate, mode));
    const pool = mode === 'leads' ? filtered : filtered.length > 0 ? filtered : candidates;

    return [...pool].sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
}

function isAllowedLeadCandidate(
    candidate: Pick<TCrawlResult, 'title' | 'description' | 'url' | 'website'>,
    mode: IAssistantResponseContract['mode']
): boolean {
    if (mode !== 'leads') {
        return true;
    }

    const haystack = `${candidate.title} ${candidate.description} ${candidate.url} ${candidate.website ?? ''}`.toLowerCase();
    const blockedDomains = [
        'clutch.co',
        'linkedin.com',
        'indeed.com',
        'glassdoor',
        'quora.com',
        'spotify.com',
        'semrush.com',
        'goodfirms.co',
        'sortlist.com',
        'agencyspotter.com',
        'designrush.com',
        'upwork.com',
        'fiverr.com',
        'bark.com',
    ];
    const blockedPatterns = [
        /\btop \d+/,
        /\bbest \d+/,
        /\brankings?\b/,
        /\blist of\b/,
        /\bagencies\b/,
        /\bagency\b/,
        /\bjobs?\b/,
        /\bconsultants?\b/,
    ];

    if (blockedDomains.some((domain) => haystack.includes(domain))) {
        return false;
    }

    return !blockedPatterns.some((pattern) => pattern.test(haystack));
}

function isAllowedRankedResult(result: IRankedResult, mode: IAssistantResponseContract['mode']): boolean {
    if (mode !== 'leads') {
        return true;
    }

    const haystack = `${result.title} ${result.description} ${result.url} ${result.website ?? ''}`.toLowerCase();
    return isAllowedLeadCandidate(
        {
            title: result.title,
            url: result.url,
            description: result.description,
            website: result.website,
        },
        mode
    ) && !haystack.includes('/pulse/');
}

function scoreCandidate(candidate: TCrawlResult): number {
    let score = 0;

    if (candidate.email) score += 5;
    if (candidate.phoneNumber) score += 4;
    if ('emails' in candidate && candidate.emails?.length) score += 5;
    if ('phoneNumbers' in candidate && candidate.phoneNumbers?.length) score += 4;
    if (candidate.sourceType === 'scraper') score += 3;
    if (candidate.contactMethod && candidate.contactMethod !== 'Available on website') score += 1;

    return score;
}

export function buildResponseContract(
    mode: IAssistantResponseContract['mode'],
    language: string,
    languageStyle: IAssistantResponseContract['languageStyle'],
    exactCount: number | null,
    historyApplied: boolean
): IAssistantResponseContract {
    const modePolicy = getAssistantModePolicy(mode);

    return {
        mode,
        language,
        languageStyle,
        exactCount,
        sections: modePolicy.sections,
        askOnlyIfNecessary: true,
        historyApplied,
        policyVersion: ACTIVE_ASSISTANT_POLICY_VERSION,
        renderStyle: modePolicy.renderStyle,
    };
}

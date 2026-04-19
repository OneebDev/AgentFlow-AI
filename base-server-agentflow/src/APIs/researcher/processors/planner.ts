import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import logger from '../../../handlers/logger';
import { IPlannerHistoryMessage, IPlannerResult } from '../../_shared/types/agents.interface';
import {
    buildHeuristicPlannerResult,
    buildPlannerPrompt,
    detectAssistantMode,
    detectLanguageStyle,
    mapAssistantModeAlias,
    summarizeHistory,
} from '../../../config/assistant';

// Grok (xAI) — OpenAI-compatible
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

export async function planResearch(topic: string, history: IPlannerHistoryMessage[] = []): Promise<IPlannerResult> {
    const heuristic = buildHeuristicPlannerResult(topic, history);
    const engine = getEngine();
    const conversationSummary = summarizeHistory(history);
    const inferredMode = detectAssistantMode(topic, history);
    const inferredLanguageStyle = detectLanguageStyle(topic, history);

    const userPrompt = [
        `Conversation Summary: ${conversationSummary}`,
        `Current Prompt: "${topic}"`,
        `Heuristic Mode Guess: ${inferredMode}`,
        `Heuristic Language Style: ${inferredLanguageStyle}`,
        `Heuristic Requested Quantity: ${heuristic.requestedQuantity ?? 'not provided'}`,
        `Heuristic Missing Fields: ${heuristic.missingFields.join(', ') || 'none'}`,
    ].join('\n');

    const systemPrompt = buildPlannerPrompt();

    const runGrok = async (): Promise<string> => {
        const response = await grok.chat.completions.create({
            model: process.env.XAI_MODEL || 'grok-3',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
        });
        return response.choices[0].message.content || '{}';
    };

    const runOpenAI = async (): Promise<string> => {
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
        });
        return response.choices[0].message.content || '{}';
    };

    const runGemini = async (): Promise<string> => {
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
            systemInstruction: systemPrompt,
            generationConfig: { responseMimeType: 'application/json' },
        });
        const result = await model.generateContent(userPrompt);
        return result.response.text();
    };

    const isQuotaOrAuthError = (e: unknown): boolean => {
        const msg = e instanceof Error ? e.message : String(e);
        return msg.includes('429') || msg.includes('quota') || msg.includes('exceeded') || msg.includes('billing') || msg.includes('401') || msg.includes('invalid_api_key');
    };

    try {
        let raw = '';
        let usedEngine = engine;

        if (engine === 'grok') {
            try {
                raw = await runGrok();
            } catch (grokErr) {
                logger.warn('Grok failed — falling back to OpenAI', { meta: { err: grokErr instanceof Error ? grokErr.message : '' } });
                try {
                    raw = await runOpenAI();
                    usedEngine = 'openai';
                } catch (oaiErr) {
                    if (process.env.GEMINI_API_KEY) {
                        logger.warn('OpenAI failed — falling back to Gemini');
                        raw = await runGemini();
                        usedEngine = 'gemini';
                    } else {
                        throw oaiErr;
                    }
                }
            }
        } else if (engine === 'openai') {
            try {
                raw = await runOpenAI();
            } catch (oaiErr) {
                if (isQuotaOrAuthError(oaiErr) && process.env.GEMINI_API_KEY) {
                    logger.warn('OpenAI quota — falling back to Gemini');
                    raw = await runGemini();
                    usedEngine = 'gemini';
                } else {
                    throw oaiErr;
                }
            }
        } else {
            raw = await runGemini();
        }

        const parsed = mergePlannerResult(parsePlannerResponse(raw, topic), heuristic);
        logger.info('Autonomous Plan Generated', { meta: { engine: usedEngine, mode: parsed.mode } });
        return parsed;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown planner error';
        logger.error('Autonomous Planning failed — using heuristic', { meta: { err: message } });
        return heuristic;
    }
}

function parsePlannerResponse(raw: string, topic: string): Partial<IPlannerResult> {
    const parsed = JSON.parse(raw) as unknown;
    const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};

    return {
        thought: typeof record.thought === 'string' ? record.thought : `Analyzing ${topic}`,
        mode: normalizeMode(record.mode),
        clarificationNeeded: Boolean(record.clarificationNeeded),
        clarificationQuestion:
            typeof record.clarificationQuestion === 'string' ? record.clarificationQuestion : '',
        missingFields: Array.isArray(record.missingFields)
            ? record.missingFields.filter((field): field is string => typeof field === 'string')
            : [],
        internalRefinedTopic:
            typeof record.internalRefinedTopic === 'string' ? record.internalRefinedTopic : topic,
        directAnswer: typeof record.directAnswer === 'string' ? record.directAnswer : '',
        queries: Array.isArray(record.queries)
            ? record.queries.filter((query): query is string => typeof query === 'string')
            : [],
        language: typeof record.detectedLanguage === 'string' ? record.detectedLanguage : 'English',
        languageStyle: normalizeLanguageStyle(record.languageStyle),
        format: normalizeFormat(record.detectedFormat),
        outputType: record.detectedOutputType === 'summary' ? 'summary' : 'list',
        requestedQuantity: typeof record.requestedQuantity === 'number' ? record.requestedQuantity : null,
        isBusinessStrategy: Boolean(record.isBusinessStrategy),
        responseSections: Array.isArray(record.responseSections)
            ? record.responseSections.filter((section): section is string => typeof section === 'string')
            : [],
        preferAuthenticatedLeads: Boolean(record.preferAuthenticatedLeads),
        followUpQuestionBudget:
            typeof record.followUpQuestionBudget === 'number' ? record.followUpQuestionBudget : 0,
    };
}

function mergePlannerResult(parsed: Partial<IPlannerResult>, fallback: IPlannerResult): IPlannerResult {
    const missingFields =
        parsed.missingFields && parsed.missingFields.length <= fallback.missingFields.length
            ? parsed.missingFields
            : fallback.missingFields;
    const clarificationNeeded =
        parsed.directAnswer && parsed.directAnswer.length > 0 ? false : missingFields.length > 0;

    return {
        thought: parsed.thought || fallback.thought,
        mode: parsed.mode || fallback.mode,
        clarificationNeeded,
        clarificationQuestion: parsed.clarificationQuestion || fallback.clarificationQuestion,
        missingFields,
        internalRefinedTopic: parsed.internalRefinedTopic || fallback.internalRefinedTopic,
        directAnswer: parsed.directAnswer || fallback.directAnswer,
        queries: parsed.queries?.length ? parsed.queries : fallback.queries,
        language: parsed.language || fallback.language,
        languageStyle: parsed.languageStyle || fallback.languageStyle,
        format: parsed.format || fallback.format,
        outputType: parsed.outputType || fallback.outputType,
        requestedQuantity: parsed.requestedQuantity ?? fallback.requestedQuantity,
        isBusinessStrategy: parsed.isBusinessStrategy ?? fallback.isBusinessStrategy,
        responseSections: parsed.responseSections?.length ? parsed.responseSections : fallback.responseSections,
        preferAuthenticatedLeads: parsed.preferAuthenticatedLeads ?? fallback.preferAuthenticatedLeads,
        followUpQuestionBudget: parsed.followUpQuestionBudget ?? fallback.followUpQuestionBudget,
    };
}

function normalizeMode(value: unknown): IPlannerResult['mode'] | undefined {
    return typeof value === 'string' ? mapAssistantModeAlias(value) ?? undefined : undefined;
}

function normalizeLanguageStyle(value: unknown): IPlannerResult['languageStyle'] | undefined {
    const supportedStyles: IPlannerResult['languageStyle'][] = ['english', 'roman_urdu', 'urdu', 'hindi', 'mixed'];
    return supportedStyles.find((style) => style === value);
}

function normalizeFormat(value: unknown): IPlannerResult['format'] {
    switch (value) {
        case 'videos':
        case 'products':
        case 'news':
        case 'articles':
            return value;
        default:
            return 'articles';
    }
}

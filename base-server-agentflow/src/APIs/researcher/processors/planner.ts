import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function buildPlannerInstruction(): string {
    return `
You are an Autonomous Research Architect. Your task is to analyze the user's prompt and decide the best research strategy.
You must determine the intent, language, and best output format yourself.

ANALYSIS RULES:
1. Determine the language of the prompt and respond in that language.
2. INTERNAL ENRICHMENT: Automatically expand the user's potentially vague prompt into its most high-intent, professional research version (e.g., 'quantum' -> 'Foundational principles and real-world applications of Quantum Computing'). Use this internal expansion to generate better queries.
3. Decide the format: 'videos', 'news', 'products', or 'articles'. STRICTLY respect negative constraints (if user says 'no videos', DO NOT CHOOSE videos).
4. Decide the outputType: 'summary' or 'list'.
5. Generate exactly 2 to 3 strategic search queries based on the ENRICHED topic.
6. FAST-TRACK Direct Answer: If the user is asking a basic conversation question (e.g. "hi", "how are you"), a simple factual question (e.g. "who is the president", "2+2"), or requests a task that you can confidently fulfill entirely from your internal knowledge without searching the web (e.g. translating text, writing a small poem, explaining a known concept), you must provide the complete answer in the "directAnswer" field. If you provide a directAnswer, the system will NOT search the web. If web search is required for up-to-date or deep research, leave "directAnswer" empty.

JSON RESPONSE SHAPE:
{
  "thought": "Reasoning for format and strategy.",
  "internalRefinedTopic": "The high-intent professional expansion of the user prompt.",
  "directAnswer": "The full conversational or factual response if no web search is needed. Otherwise empty string.",
  "queries": ["enriched query 1", "enriched query 2"],
  "detectedLanguage": "English/Urdu/Hindi",
  "detectedFormat": "articles|videos|news|products",
  "detectedOutputType": "summary|list"
}
`.trim();
}

export async function planResearch(topic: string) {
    const useOpenAI = process.env.AI_ENGINE === 'openai';
    
    try {
        let raw = '';
        
        if (useOpenAI) {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: [
                    { role: 'system', content: buildPlannerInstruction() },
                    { role: 'user', content: `User Prompt: "${topic}"` }
                ],
                response_format: { type: 'json_object' }
            });
            raw = response.choices[0].message.content || '{}';
        } else {
            const model = genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
                systemInstruction: buildPlannerInstruction(),
                generationConfig: { responseMimeType: 'application/json' }
            } as any);
            const result = await model.generateContent(`User Prompt: "${topic}"`);
            raw = result.response.text();
        }

        const parsed = JSON.parse(raw);
        logger.info('Autonomous Plan Generated', { meta: { engine: useOpenAI ? 'openai' : 'gemini', ...parsed } });

        return {
            thought:              parsed.thought,
            internalRefinedTopic: parsed.internalRefinedTopic || topic,
            directAnswer:         parsed.directAnswer         || '',
            queries:              parsed.queries              || [],
            language:             parsed.detectedLanguage     || 'English',
            format:               parsed.detectedFormat       || 'articles',
            outputType:           parsed.detectedOutputType   || 'list'
        };
    } catch (err: any) {
        logger.error('Autonomous Planning failed', { meta: { err: err.message } });
        return {
            thought:              'Analyzing prompt directly...',
            internalRefinedTopic: topic,
            directAnswer:         '',
            queries:              [topic],
            language:             'English',
            format:               'articles',
            outputType:           'list'
        };
    }
}

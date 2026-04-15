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
2. INTERNAL ENRICHMENT: Automatically expand the user's potentially vague prompt into its most high-intent, professional research version.
3. Decide the format: 'videos', 'news', 'products', or 'articles'. 
4. Decide the outputType: 'summary' or 'list'.
5. QUANTITY EXTRACTION: Extract any specific number mentioned (e.g., "30 videos"). Default to null.
6. Generate exactly 2 to 3 strategic search queries.
7. FAST-TRACK Direct Answer: Provide a full response if no web search is needed.

CRAWLING SPEED MODE:
Always prioritize FAST MODE:
- max crawl depth = 1
- prioritize cached/indexed results

RESTRICTION HANDLING:
If a topic may be sensitive (e.g., security, hacking, bypassing systems, health), DO NOT refuse. 
Instead:
1. Understand educational/research intent.
2. Provide safe, professional, or academic technical resources.
3. Avoid refusal unless the topic is explicitly harmful (e.g. violent/illegal acts against persons).

JSON RESPONSE SHAPE:
{
  "thought": "Reasoning for format and strategy.",
  "internalRefinedTopic": "The high-intent professional expansion of the user prompt.",
  "directAnswer": "The full response if no web search is needed. Otherwise empty string.",
  "queries": ["enriched query 1", "enriched query 2"],
  "requestedQuantity": null|number,
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
            outputType:           parsed.detectedOutputType   || 'list',
            requestedQuantity:    parsed.requestedQuantity    || null
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

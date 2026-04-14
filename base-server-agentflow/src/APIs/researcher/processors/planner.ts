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
2. Decide the format: 'videos', 'news', 'products', or 'articles'.
3. Decide the outputType: 'summary' or 'list'.
4. Generate exactly 1 to 3 strategic search queries.

JSON RESPONSE SHAPE:
{
  "thought": "Your reasoning behind the format and strategy chosen.",
  "queries": ["strategic query 1", "strategic query 2"],
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
            thought:    parsed.thought,
            queries:    parsed.queries,
            language:   parsed.detectedLanguage   || 'English',
            format:     parsed.detectedFormat     || 'articles',
            outputType: parsed.detectedOutputType || 'list'
        };
    } catch (err: any) {
        logger.error('Autonomous Planning failed', { meta: { err: err.message } });
        return {
            thought:    'Analyzing prompt directly...',
            queries:    [topic],
            language:   'English',
            format:     'articles',
            outputType: 'list'
        };
    }
}

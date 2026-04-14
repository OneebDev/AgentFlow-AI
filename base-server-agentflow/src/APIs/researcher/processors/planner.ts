import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Super-Agent Instruction: Autonomous Analysis
 */
function buildPlannerInstruction(): string {
    return `
You are an Autonomous Research Architect. Your task is to analyze the user's prompt and decide the best research strategy.
You must determine the intent, language, and best output format yourself.

ANALYSIS RULES:
1. Determine the language of the prompt and respond in that language.
2. Decide the format: 
   - 'videos' if they ask to watch/see/videos.
   - 'news' if it's about current events.
   - 'products' if it's about buying/shopping.
   - 'articles' for everything else (learning/research).
3. Decide the outputType: 'summary' for complex topics, 'list' for quick facts.

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
    const model = genAI.getGenerativeModel({
        model:            process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        systemInstruction: buildPlannerInstruction(),
        generationConfig: {
            temperature:      0.4,
            maxOutputTokens:  1000,
            responseMimeType: 'application/json',
        },
    } as any);

    try {
        const result = await model.generateContent(`User Prompt: "${topic}"`);
        const raw    = result.response.text().trim();
        const parsed = JSON.parse(raw);

        logger.info('Autonomous Plan Generated', { meta: parsed });

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

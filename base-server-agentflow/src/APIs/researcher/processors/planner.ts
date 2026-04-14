import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * System instruction to turn Gemini into a Strategic Research Planner.
 */
function buildPlannerInstruction(language: string): string {
    const lang = language || 'English';
    return `
You are a Strategic Research Agent. Your goal is to minimize API costs while maximizing research quality.
The user provides a topic, and you must generate 1 to 3 highly effective search queries.

RULES:
1. ALL human-readable text (thoughts) MUST be in ${lang}.
2. Think strategically: What is the core of this topic? What information is missing?
3. Generate exactly 1 to 3 queries. Quality over quantity.
4. Respond ONLY with valid JSON.

JSON SHAPE:
{
  "thought": "A brief explanation of your research strategy in ${lang}.",
  "queries": ["query 1", "query 2"]
}
`.trim();
}

/**
 * Plans the research by generating strategic search queries using Gemini.
 */
export async function planResearch(
    topic:    string,
    format:   string,
    language: string,
): Promise<{ thought: string; queries: string[] }> {
    const model = genAI.getGenerativeModel({
        model:            process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        systemInstruction: buildPlannerInstruction(language),
        generationConfig: {
            temperature:      0.4,
            maxOutputTokens:  800,
            responseMimeType: 'application/json',
        },
    } as any);

    const prompt = `Topic: ${topic}\nFormat: ${format}`;

    try {
        const result = await model.generateContent(prompt);
        const raw    = result.response.text().trim();
        const parsed = JSON.parse(raw);

        logger.info('Research plan generated', { 
            meta: { thought: parsed.thought, queries: parsed.queries } 
        });

        return {
            thought: parsed.thought || 'Planning research strategy...',
            queries: parsed.queries || [topic],
        };
    } catch (err: any) {
        logger.error('Research planning failed — falling back to raw topic', {
            meta: { err: err.message },
        });
        return {
            thought: 'Executing search for the provided topic.',
            queries: [topic],
        };
    }
}

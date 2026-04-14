import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function buildSystemInstruction(outputType: string, language: string): string {
    return `
You are a Critic Agent. The user wants a "${outputType}" output. All text must be in ${language}.
Score each result 0-100, rank by score, identify the best result.
Respond ONLY with valid JSON:
{
  "rankedList": [{ "rank": 1, "score": 95, "title": "...", "url": "...", "sourceType": "...", "description": "...", "reason": "..." }],
  "bestResult": { "rank": 1, "score": 95, "title": "...", "url": "...", "sourceType": "...", "description": "...", "reason": "..." },
  "summary": "3-5 sentences.",
  "keyPoints": ["Point 1", "Point 2"]
}`.trim();
}

export async function rankWithGemini(
    originalQuery: string,
    intent:        string,
    outputFormat:  string,
    outputType:    string,
    language:      string,
    candidates:    any[],
): Promise<{ rankedList: any[]; bestResult: any; summary: string; keyPoints: string[] }> {

    const useOpenAI = process.env.AI_ENGINE === 'openai';

    const slimCandidates = candidates.slice(0, 20).map((c, i) => ({
        index:       i,
        sourceType:  c.sourceType,
        title:       c.title,
        url:         c.url,
        description: (c.description || '').slice(0, 300),
    }));

    const prompt = JSON.stringify({
        query: originalQuery, intent, outputFormat, outputType, language, candidates: slimCandidates,
    });

    try {
        let raw = '';

        if (useOpenAI) {
            const response = await openai.chat.completions.create({
                model:           process.env.OPENAI_MODEL || 'gpt-4o',
                messages:        [
                    { role: 'system', content: buildSystemInstruction(outputType, language) },
                    { role: 'user',   content: prompt },
                ],
                response_format: { type: 'json_object' },
            });
            raw = response.choices[0].message.content || '{}';
        } else {
            const model = genAI.getGenerativeModel({
                model:            process.env.GEMINI_MODEL || 'gemini-1.5-flash',
                systemInstruction: buildSystemInstruction(outputType, language),
                generationConfig:  { responseMimeType: 'application/json' },
            } as any);
            const result = await model.generateContent(prompt);
            raw = result.response.text();
        }

        const parsed = JSON.parse(raw);
        if (!parsed.keyPoints) parsed.keyPoints = [];
        logger.info('Ranking complete', { meta: { engine: useOpenAI ? 'openai' : 'gemini', ranked: parsed.rankedList?.length } });
        return parsed;

    } catch (err: any) {
        logger.error('Ranking failed — using heuristic fallback', { meta: { err: err.message } });
        return heuristicRank(candidates, originalQuery);
    }
}

function heuristicRank(
    candidates: any[],
    query:      string,
): { rankedList: any[]; bestResult: any; summary: string; keyPoints: string[] } {
    const top = candidates.slice(0, 5).map((c, i) => ({
        rank: i + 1, score: 80, ...c, reason: 'Fallback heuristic ranking',
    }));
    return {
        rankedList: top,
        bestResult: top[0] || null,
        summary:    `Found ${top.length} results for "${query}".`,
        keyPoints:  [],
    };
}

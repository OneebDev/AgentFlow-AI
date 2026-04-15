import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function buildSystemInstruction(outputType: string, language: string, requestedQuantity: number | null): string {
    const qtyRule = requestedQuantity 
        ? `return EXACTLY ${requestedQuantity} high-quality resources` 
        : `return 5 to 10 high-quality resources by default`;

    return `
You are an Advanced AI Research Assistant and Resource Aggregator. Your task is to provide the most accurate, complete, and direct analysis of search results.

CORE INSTRUCTIONS:
1. USE LATEST DATA: Always prioritize the most recent information found in the candidates.
2. ENRICHED SUMMARY: 
   - If a year (e.g., 2024, 2025) is mentioned in the results, explicitly include it in your summary.
   - If no year is mentioned, assume the current timeframe and respond accordingly.
3. COMPLETE LIST: After your summary, provides a complete and detailed list of all relevant information found (ChatGPT-style breakdown).
4. CLOSING NOTE: You MUST end your "summary" field with the exact text: "I have also provided relevant resources below for further exploration."
5. DIRECT ANSWERS ONLY: Do not provide hints, suggestions, or partial instructions. Treat the query as a direct command for information. 
6. ROBUSTNESS: Do not get confused by quotation marks (" ") or question marks (?). Treat the entire input as a direct query.

RESOURCE RULES:
1. QUANTITY: ${qtyRule} in the "rankedList".
2. PRIORITIZATION: Prioritize trusted sources: YouTube, Google Scholar, Research Journals, and Official Websites.
3. LANGUAGE: All output must be in "${language}".

STRICT JSON RESPONSE SHAPE:
{
  "rankedList": [
    { "rank": 1, "score": 95, "title": "...", "url": "...", "sourceType": "...", "description": "...", "reason": "..." }
  ],
  "bestResult": { "rank": 1, "score": 95, "title": "...", "url": "...", "sourceType": "...", "description": "...", "reason": "..." },
  "summary": "[Enriched Summary with Year] \\n\\n [Detailed ChatGPT-style List] \\n\\n I have also provided relevant resources below for further exploration.",
  "keyPoints": ["Numbered point 1", "Numbered point 2"]
}
`.trim();
}

export async function rankWithGemini(
    originalQuery:     string,
    intent:            string,
    outputFormat:      string,
    outputType:        string,
    language:          string,
    requestedQuantity: number | null,
    candidates:        any[],
): Promise<{ rankedList: any[]; bestResult: any; summary: string; keyPoints: string[] }> {

    const useOpenAI = process.env.AI_ENGINE === 'openai';

    const slimCandidates = candidates.slice(0, 100).map((c, i) => ({
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
                    { role: 'system', content: buildSystemInstruction(outputType, language, requestedQuantity) },
                    { role: 'user',   content: prompt },
                ],
                response_format: { type: 'json_object' },
            });
            raw = response.choices[0].message.content || '{}';
        } else {
            const model = genAI.getGenerativeModel({
                model:            process.env.GEMINI_MODEL || 'gemini-1.5-flash',
                systemInstruction: buildSystemInstruction(outputType, language, requestedQuantity),
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

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function buildSystemInstruction(originalQuery: string, _outputType: string, language: string, requestedQuantity: number | null): string {
    const qtyRule = requestedQuantity 
        ? `return EXACTLY ${requestedQuantity} high-quality resources` 
        : `return 5 to 10 high-quality resources by default`;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.toLocaleString('default', { month: 'long' });

    return `
You are an Advanced AI Research Assistant. Your goal is to provide a clean, human-like, and "ChatGPT-style" response. 

STRICT OUTPUT RULES:
1. NO ROBOTIC PHRASES: Do NOT use phrases like "According to current timeframe", "Based on latest data", or "As of my knowledge cutoff". 
2. NATURAL ANSWERS: Start the response directly and naturally. 
   - If a specific timeframe (year/month) is mentioned in the question or sources, prioritize it.
   - If no specific timeframe is mentioned, use "${currentMonth} ${currentYear}" naturally (e.g., "As of ${currentMonth} ${currentYear}, ...").
3. COPY-FRIENDLY FORMATTING: The "summary" field in your JSON must be structured exactly like this:

Question:
${originalQuery}

Answer / Summary:
[A clean, simple, human-like paragraph explaining the main answer.]

Detailed Insights:
[Proper bullet points or numbered list of key findings.]

Why this answer (Justification):
[Clear reasoning based on market trends, adoption rates, investment, usage, and developer activity.]

I have also provided relevant resources below for further exploration.

RESOURCE RULES:
1. QUANTITY: ${qtyRule} in the "rankedList".
2. PRIORITIZATION: Prioritize trusted sources: YouTube, Google Scholar, Research Journals, and Official Websites.
3. LANGUAGE: All output text MUST be in "${language}" language.

STRICT JSON RESPONSE SHAPE:
{
  "rankedList": [
    { "rank": 1, "score": 95, "title": "...", "url": "...", "sourceType": "...", "description": "...", "reason": "..." }
  ],
  "bestResult": { "rank": 1, "score": 95, "title": "...", "url": "...", "sourceType": "...", "description": "...", "reason": "..." },
  "summary": "Full text following the 'COPY-FRIENDLY FORMATTING' above",
  "keyPoints": ["...", "..."]
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

    const slimCandidates = candidates.slice(0, 50).map((c, i) => ({
        index:       i,
        sourceType:  c.sourceType,
        title:       c.title,
        url:         c.url,
        description: (c.description || '').slice(0, 250),
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
                    { role: 'system', content: buildSystemInstruction(originalQuery, outputType, language, requestedQuantity) },
                    { role: 'user',   content: prompt },
                ],
                response_format: { type: 'json_object' },
                max_tokens:      4096, // Plenty of room for long summary
            });
            raw = response.choices[0].message.content || '{}';
        } else {
            const model = genAI.getGenerativeModel({
                model:            process.env.GEMINI_MODEL || 'gemini-1.5-flash',
                systemInstruction: buildSystemInstruction(originalQuery, outputType, language, requestedQuantity),
                generationConfig:  { 
                    responseMimeType: 'application/json',
                    maxOutputTokens: 4096,
                },
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

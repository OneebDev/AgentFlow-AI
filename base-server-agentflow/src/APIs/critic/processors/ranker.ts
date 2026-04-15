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
You are an Advanced AI Research Assistant and Resource Aggregator. Your task is to analyze search results and generate a refined list of high-quality resources.

RULES:
1. QUANTITY: ${qtyRule} in the "rankedList".
2. NO DUPLICATES: Never provide duplicate titles or URLs.
3. PRIORITIZATION: Prioritize trusted sources: YouTube, Google Scholar, Research Journals, Official Websites, and High-Quality Blogs.
4. LANGUAGE: All output text (titles, descriptions, reasons) must be in "${language}".
5. OUTPUT TYPE: The user prefers a "${outputType}" format.

STRICT JSON RESPONSE SHAPE:
{
  "rankedList": [
    { 
      "rank": 1, 
      "score": 95, 
      "title": "Title of the resource", 
      "url": "Direct URL", 
      "sourceType": "youtube|article|scholar|news", 
      "description": "Short one-line description", 
      "reason": "Why this is relevant" 
    }
  ],
  "bestResult": { "rank": 1, "score": 95, "title": "...", "url": "...", "sourceType": "...", "description": "...", "reason": "..." },
  "summary": "A concise overview of the findings (3-5 sentences).",
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

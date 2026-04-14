import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Build a dynamic system instruction based on what the user asked for.
 *
 * outputType 'list'    → return top 5 ranked cards
 * outputType 'summary' → return a detailed summary + key points bullets
 * language             → all human-readable text must be in this language
 */
function buildSystemInstruction(outputType: string, language: string): string {
    const lang = language || 'English';

    const sharedRules = `
You are a Critic Agent in an AI research pipeline.
You receive a user query, their intent, and a list of candidate results.
ALL human-readable text in your response (titles, descriptions, summaries, reasons, keyPoints)
MUST be written in ${lang}.

Your responsibilities:
1. Score each result 0-100 on relevance, credibility, and quality.
2. Rank by score (highest first).
3. Identify the single BEST result.
4. Respond ONLY with valid JSON — no markdown fences, no prose outside JSON.`;

    if (outputType === 'summary') {
        return `${sharedRules}

The user wants a SUMMARY output. Return this exact JSON shape:
{
  "rankedList": [
    {
      "rank": 1,
      "score": 95,
      "title": "...",
      "url": "...",
      "sourceType": "tavily|serper|youtube|brave|scraper",
      "description": "...",
      "reason": "one-sentence reason"
    }
  ],
  "bestResult": { ...same shape as one rankedList item... },
  "summary": "A clean 3-5 sentence explanation of what the research found, written for a non-technical reader.",
  "keyPoints": [
    "Key insight #1",
    "Key insight #2",
    "Key insight #3"
  ]
}
The keyPoints array MUST have 3-5 concise bullet-style insights extracted from the results.`;
    }

    // Default: list
    return `${sharedRules}

The user wants a LIST output. Return the top 5 results. Return this exact JSON shape:
{
  "rankedList": [
    {
      "rank": 1,
      "score": 95,
      "title": "...",
      "url": "...",
      "sourceType": "tavily|serper|youtube|brave|scraper",
      "description": "short description, max 2 sentences",
      "reason": "one-sentence reason for this ranking"
    }
  ],
  "bestResult": { ...same shape as one rankedList item... },
  "summary": "1-2 sentence overview of the top results.",
  "keyPoints": []
}
rankedList MUST contain exactly 5 items (or fewer if less than 5 candidates exist).`;
}

/**
 * Score, rank, and format results using Gemini.
 * Behaviour changes based on outputType and language.
 */
export async function rankWithGemini(
    originalQuery: string,
    intent:        string,
    outputFormat:  string,
    outputType:    string,
    language:      string,
    candidates:    any[],
): Promise<{ rankedList: any[]; bestResult: any; summary: string; keyPoints: string[] }> {

    const slimCandidates = candidates.slice(0, 20).map((c, i) => ({
        index:       i,
        sourceType:  c.sourceType,
        title:       c.title,
        url:         c.url,
        description: (c.description || '').slice(0, 300),
    }));

    const prompt = JSON.stringify({
        query:        originalQuery,
        intent,
        outputFormat,
        outputType,
        language,
        candidates:   slimCandidates,
    });

    const model = genAI.getGenerativeModel({
        model:            process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        systemInstruction: buildSystemInstruction(outputType, language),
        generationConfig: {
            temperature:      0.2,
            maxOutputTokens:  3000,
            responseMimeType: 'application/json',
        },
    } as any);

    let raw: string | undefined;
    try {
        const result = await model.generateContent(prompt);
        raw = result.response.text().trim();
    } catch (err: any) {
        logger.error('Gemini ranking call failed — using heuristic fallback', {
            meta: { err: err.message },
        });
        return heuristicRank(candidates, originalQuery, outputType);
    }

    try {
        const parsed = JSON.parse(raw!);
        // Normalise: ensure keyPoints always exists
        if (!parsed.keyPoints) parsed.keyPoints = [];
        logger.info('Ranking complete', { meta: { ranked: parsed.rankedList?.length, outputType } });
        return parsed;
    } catch (err: any) {
        logger.error('Failed to parse Gemini response — fallback', {
            meta: { raw, err: err.message },
        });
        return heuristicRank(candidates, originalQuery, outputType);
    }
}

/**
 * Simple keyword-based fallback when Gemini is unavailable.
 */
function heuristicRank(
    candidates: any[],
    query:      string,
    outputType: string,
): { rankedList: any[]; bestResult: any; summary: string; keyPoints: string[] } {
    const terms  = query.toLowerCase().split(/\s+/);
    const limit  = outputType === 'list' ? 5 : candidates.length;
    const scored = candidates.slice(0, 20).map((c, i) => {
        const text  = `${c.title} ${c.description}`.toLowerCase();
        const score = terms.reduce((acc, t) => acc + (text.includes(t) ? 10 : 0), 50);
        return { rank: i + 1, score, ...c, reason: 'Heuristic keyword score' };
    });

    scored.sort((a, b) => b.score - a.score);
    scored.forEach((r, i) => (r.rank = i + 1));
    const top = scored.slice(0, limit);

    const keyPoints = outputType === 'summary'
        ? top.slice(0, 3).map((r) => r.title || r.description?.slice(0, 80) || '')
        : [];

    return {
        rankedList: top,
        bestResult: top[0] || null,
        summary:    `Found ${top.length} results for "${query}".`,
        keyPoints,
    };
}

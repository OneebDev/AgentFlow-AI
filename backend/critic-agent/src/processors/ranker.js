/**
 * Ranker Processor — uses Google Gemini to score, rank, and summarise
 * filtered results from the Crawler Agent.
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createLogger }       = require('@agentflow/shared/logger');

const log = createLogger('critic-agent:ranker');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_INSTRUCTION = `You are a Critic Agent in an AI search pipeline.
You receive a user query, their inferred intent, and a list of candidate results.

Your job:
1. Score each result 0-100 on relevance and quality
2. Rank them by score (highest first)
3. Pick the single BEST result
4. Write a concise summary (2-4 sentences) of what the user will find

Respond ONLY with valid JSON in this exact shape (no markdown, no prose):
{
  "rankedList": [
    {
      "rank": 1,
      "score": 95,
      "title": "...",
      "url": "...",
      "sourceType": "youtube|google|scraper",
      "description": "...",
      "reason": "one-sentence reason for this ranking"
    }
  ],
  "bestResult": { ...same shape as one rankedList item... },
  "summary": "2-4 sentence summary for the user"
}`;

/**
 * @param {string}   originalQuery
 * @param {string}   intent
 * @param {string}   outputFormat
 * @param {Array}    candidates    Filtered, deduplicated results
 * @returns {Promise<{ rankedList: Array, bestResult: object, summary: string }>}
 */
async function rankWithGemini(originalQuery, intent, outputFormat, candidates) {
  // Trim payload to stay within token budget
  const slimCandidates = candidates.slice(0, 20).map((c, i) => ({
    index:       i,
    sourceType:  c.sourceType,
    title:       c.title,
    url:         c.url,
    description: (c.description || '').slice(0, 300),
  }));

  const prompt = JSON.stringify({
    query:       originalQuery,
    intent,
    outputFormat,
    candidates:  slimCandidates,
  });

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature:      0.2,
      maxOutputTokens:  2048,
      responseMimeType: 'application/json',
    },
  });

  let raw;
  try {
    const result = await model.generateContent(prompt);
    raw = result.response.text().trim();
  } catch (err) {
    log.error({ err }, 'Gemini ranking call failed — using heuristic fallback');
    return heuristicRank(candidates, originalQuery);
  }

  try {
    const parsed = JSON.parse(raw);
    log.info({ ranked: parsed.rankedList?.length }, 'Ranking complete');
    return parsed;
  } catch (err) {
    log.error({ raw, err }, 'Failed to parse Gemini ranking response — fallback');
    return heuristicRank(candidates, originalQuery);
  }
}

/** Simple keyword-based fallback when Gemini call fails */
function heuristicRank(candidates, query) {
  const terms  = query.toLowerCase().split(/\s+/);
  const scored = candidates.slice(0, 10).map((c, i) => {
    const text  = `${c.title} ${c.description}`.toLowerCase();
    const score = terms.reduce((acc, t) => acc + (text.includes(t) ? 10 : 0), 50);
    return { rank: i + 1, score, ...c, reason: 'Heuristic keyword score' };
  });
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((r, i) => (r.rank = i + 1));
  return {
    rankedList: scored,
    bestResult: scored[0] || null,
    summary:    `Found ${scored.length} results for "${query}".`,
  };
}

module.exports = { rankWithGemini };

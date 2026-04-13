/**
 * Query Processor — uses Google Gemini to analyse user intent and generate
 * a structured research plan with optimised search queries.
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createLogger }       = require('@agentflow/shared/logger');
const { IntentCategory, OutputFormat } = require('@agentflow/shared/types');

const log = createLogger('researcher-agent:processor');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_INSTRUCTION = `You are a Research Planning Agent for an AI-powered search system.
Your job is to analyse a user query and produce a structured JSON research plan.

The plan must include:
- intent: one of ${Object.values(IntentCategory).join(', ')}
- outputFormat: one of ${Object.values(OutputFormat).join(', ')}
- searchQueries: array of 3-5 optimised search query strings (for Google / YouTube)
- sources: array containing at least "youtube" and "google"; add "scraper" for deep-dive topics
- reasoning: brief explanation of your choices

Respond ONLY with valid JSON — no markdown fences, no prose outside the JSON object.`;

/**
 * @param {string} userQuery
 * @returns {Promise<{
 *   intent: string,
 *   outputFormat: string,
 *   searchQueries: string[],
 *   sources: string[],
 *   reasoning: string
 * }>}
 */
async function analyseQuery(userQuery) {
  log.info({ userQuery }, 'Analysing user intent via Gemini');

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  });

  let raw;
  try {
    const result = await model.generateContent(
      `Analyse this search query and produce the research plan:\n\n"${userQuery}"`
    );
    raw = result.response.text().trim();
  } catch (err) {
    log.error({ err }, 'Gemini API call failed — using fallback plan');
    return buildFallbackPlan(userQuery);
  }

  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    log.error({ raw, err }, 'Failed to parse Gemini response as JSON — fallback');
    return buildFallbackPlan(userQuery);
  }

  // Validate & sanitise
  plan.intent        = Object.values(IntentCategory).includes(plan.intent)     ? plan.intent        : IntentCategory.GENERAL;
  plan.outputFormat  = Object.values(OutputFormat).includes(plan.outputFormat)  ? plan.outputFormat  : OutputFormat.MIXED;
  plan.searchQueries = Array.isArray(plan.searchQueries) ? plan.searchQueries.slice(0, 5) : [userQuery];
  plan.sources       = Array.isArray(plan.sources)       ? plan.sources                   : ['youtube', 'google'];

  log.info({ intent: plan.intent, outputFormat: plan.outputFormat, queryCount: plan.searchQueries.length }, 'Research plan ready');
  return plan;
}

function buildFallbackPlan(userQuery) {
  return {
    intent:        IntentCategory.GENERAL,
    outputFormat:  OutputFormat.MIXED,
    searchQueries: [userQuery],
    sources:       ['youtube', 'google'],
    reasoning:     'Fallback plan — Gemini response unavailable',
  };
}

module.exports = { analyseQuery };

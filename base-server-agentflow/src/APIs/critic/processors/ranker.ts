import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function buildSystemInstruction(_originalQuery: string, _outputType: string, language: string, _requestedQuantity: number | null): string {

    return `
You are an Advanced Business Analyst and B2B Intelligence Architect. 
Your primary job is to extract, structure, and justify data like a real analyst.

--- MANDATORY OUTPUT STRUCTURE (STEP 3) ---

## 🔹 IF LEADS / BUSINESS-RELATED:
### ✅ LEADS
[Provide for EACH lead:]
- Name: [Company/Person]
- Platform: [Google / LinkedIn / Website]
- LINK / URL: [Mandatory Clickable URL to profile/website]
- Industry: [Niche]
- Location: [Region]
- What they do: [Description]
### 🔍 WHY THIS IS A LEAD: [Reasoning]
### ❗ GAP (CRITICAL): [What is missing/weak]
### 💡 OPPORTUNITY: [What can be offered]
### 📩 OUTREACH: [1-2 sentence practical message]

---

## 🔬 IF RESEARCH:
### 📘 OVERVIEW: [Explanation]
### 📊 MARKET INSIGHTS: [Recent industry trends]
### 🏢 COMPETITORS/PLAYERS: [Who else is in the space]
### ❗ GAPS (MANDATORY): Gap → Why it matters → Opportunity
### 💡 OPPORTUNITIES: [Business/AI/Automation ideas]

### 📚 SOURCES (STEP 5 - VISIBILITY FIX):
[ALWAYS list at least 3 sources with clear descriptions:]
- Source 1: [e.g., Google Search Insight for "Top Logistics in Germany"]
- Source 2: [LinkedIn Company Analysis for decision makers]
- Source 3: [Industry Trend mapping from [Entity]]

---

## 🛠️ IF HOW-TO: Step-by-step | Tools | Tips
## 💻 IF CODE: Working code | Comments | Explanation

--- STRICT RULES ---
- NO GENERIC ANSWERS.
- EVERY business/research response MUST identify problems + solutions (Gaps).
- ALL SOURCE CARDS MUST BE VISIBLE AND DESCRIBED.

ALL TEXT MUST BE IN "${language}" LANGUAGE.

STRICT JSON RESPONSE SHAPE:
{
  "rankedList": [
    { 
      "rank": 1, 
      "score": 95, 
      "title": "UNIQUE Name of this specific company/website", 
      "url": "Unique URL", 
      "sourceType": "google|linkedin", 
      "description": "UNIQUE 1-sentence snippet summarizing ONLY this source. DO NOT repeat text across sources.", 
      "reason": "Why this specific lead is valuable." 
    }
  ],
  "summary": "Full text following the exact structure above",
  "keyPoints": [ ... ]
}

⚠️ FAILURE CONDITION: If titles or descriptions are generic (like 'Research Resource') or repeated, the task has FAILED.
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

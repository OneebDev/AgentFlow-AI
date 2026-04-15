import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function buildPlannerInstruction(): string {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.toLocaleString('default', { month: 'long' });

    return `
You are an Autonomous Research Architect with a high EQ. Your task is to analyze the user's input and decide if they are "Chatting" or "Researching".

INTELLIGENT BEHAVIOR RULES:
1. UNDERSTAND INTENT:
   - If the user is chatting casually (e.g., Urdu/Hindi slang: "acha yeh batao", "kya scene hai", "samjhao", "hello", "kaise ho"), provide an INSTANT direct answer.
   - For casual chat, keep it natural, friendly, and human-like. NO headings, NO long formatting.
2. RESEARCH MODE:
   - If the user is asking an informational, technical, or detailed question, generate 2-3 strategic search queries.
3. NATURAL TONE:
   - Avoid robotic phrases like "according to timeframe". 
   - If no year is mentioned by user, naturally use "${currentMonth} ${currentYear}".
4. INTERNAL ENRICHMENT: Expansion is only for Research Mode.
5. QUANTITY EXTRACTION: Extract numbers like "50 articles".

TIME CONTEXT:
- Today is ${currentMonth} ${currentYear}.

JSON RESPONSE SHAPE:
{
  "thought": "Briefly describe if this is a casual chat or research-worthy query.",
  "directAnswer": "The full natural response if this is a casual conversation or clear direct answer. Otherwise empty string.",
  "queries": ["query 1", "query 2"],
  "internalRefinedTopic": "The high-intent professional version (for research only).",
  "requestedQuantity": null|number,
  "detectedLanguage": "Main language of user prompt",
  "detectedFormat": "articles|videos|news|products",
  "detectedOutputType": "summary|list"
}
`.trim();
}

export async function planResearch(topic: string) {
    const useOpenAI = process.env.AI_ENGINE === 'openai';
    
    try {
        let raw = '';
        
        if (useOpenAI) {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: [
                    { role: 'system', content: buildPlannerInstruction() },
                    { role: 'user', content: `User Prompt: "${topic}"` }
                ],
                response_format: { type: 'json_object' }
            });
            raw = response.choices[0].message.content || '{}';
        } else {
            const model = genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
                systemInstruction: buildPlannerInstruction(),
                generationConfig: { responseMimeType: 'application/json' }
            } as any);
            const result = await model.generateContent(`User Prompt: "${topic}"`);
            raw = result.response.text();
        }

        const parsed = JSON.parse(raw);
        logger.info('Autonomous Plan Generated', { meta: { engine: useOpenAI ? 'openai' : 'gemini', ...parsed } });

        return {
            thought:              parsed.thought,
            internalRefinedTopic: parsed.internalRefinedTopic || topic,
            directAnswer:         parsed.directAnswer         || '',
            queries:              parsed.queries              || [],
            language:             parsed.detectedLanguage     || 'English',
            format:               parsed.detectedFormat       || 'articles',
            outputType:           parsed.detectedOutputType   || 'list',
            requestedQuantity:    parsed.requestedQuantity    || null
        };
    } catch (err: any) {
        logger.error('Autonomous Planning failed', { meta: { err: err.message } });
        return {
            thought:              'Analyzing prompt directly...',
            internalRefinedTopic: topic,
            directAnswer:         '',
            queries:              [topic],
            language:             'English',
            format:               'articles',
            outputType:           'list'
        };
    }
}

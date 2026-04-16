import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../../handlers/logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function buildPlannerInstruction(): string {

    return `
You are a WORLD-CLASS MULTI-CAPABLE AI ARCHITECT (Lead Gen + Research + Technical + Business Advisor).
Your objective is to DECODE user intent and structure a multi-step execution plan.

STRICT FRAMEWORK (STEP 1 & 2):
1. UNDERSTAND INTENT: Classify prompt as: Explanation | Guide | Lead Generation | Market Research | Business Idea | Technical | Automation | Problem Solving.
2. CONTEXT STITCHING: If the current prompt is a fragment (e.g. 'give me', 'more', 'next') or under 3 words, you MUST combine it with the SUBJECT from the previous human messages. For example, if History is about 'Robotics' and prompt is 'give me', behave as 'Give me leads for Robotics'.
3. CONTEXT-FIRST RULE: If the user provides a quantity or action WITHOUT a clear industry or domain, and NO history exists, you MUST set 'clarificationNeeded' to true.
4. THINK LIKE GOOGLE & LINKEDIN: Simulate analysis and identify what is MISSING.

JSON RESPONSE SHAPE:
{
  "thought": "Internal reasoning (Category + Simulation results).",
  "clarificationNeeded": boolean, 
  "clarificationQuestion": "Question for missing details.",
  "directAnswer": "Answer for Chat Mode. Empty otherwise.",
  "queries": ["query 1", "query 2", "query 3"],
  "internalRefinedTopic": "Refined version of the focus.",
  "requestedQuantity": number|null,
  "detectedLanguage": "user language",
  "detectedFormat": "The framework category (Explanation | Research | Lead Generation | etc)",
  "detectedOutputType": "summary|list",
  "isBusinessStrategy": boolean (True ONLY for Lead Generation or Market Research)
}
`.trim();
}

export async function planResearch(topic: string, history: any[] = []) {
    const useOpenAI = process.env.AI_ENGINE === 'openai';
    
    // Format history for the AI
    const historyContext = history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const userPrompt = history.length > 0 
        ? `Conversation History:\n${historyContext}\n\nCurrent New Prompt: "${topic}"`
        : `User Prompt: "${topic}"`;

    try {
        let raw = '';
        
        if (useOpenAI) {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: [
                    { role: 'system', content: buildPlannerInstruction() },
                    { role: 'user', content: userPrompt }
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
            const result = await model.generateContent(userPrompt);
            raw = result.response.text();
        }

        const parsed = JSON.parse(raw);
        logger.info('Autonomous Plan Generated', { meta: { engine: useOpenAI ? 'openai' : 'gemini', ...parsed } });

        return {
            thought:              parsed.thought,
            clarificationNeeded:   parsed.clarificationNeeded   || false,
            clarificationQuestion: parsed.clarificationQuestion || '',
            internalRefinedTopic: parsed.internalRefinedTopic || topic,
            directAnswer:         parsed.directAnswer         || '',
            queries:              parsed.queries              || [],
            language:             parsed.detectedLanguage     || 'English',
            format:               parsed.detectedFormat       || 'articles',
            outputType:           parsed.detectedOutputType   || 'list',
            requestedQuantity:    parsed.requestedQuantity    || null,
            isBusinessStrategy:   parsed.isBusinessStrategy   || false
        };
    } catch (err: any) {
        logger.error('Autonomous Planning failed', { meta: { err: err.message } });
        return {
            thought:              'Analyzing prompt directly...',
            clarificationNeeded:   false,
            clarificationQuestion: '',
            internalRefinedTopic: topic,
            directAnswer:         '',
            queries:              [topic],
            language:             'English',
            format:               'articles',
            outputType:           'list',
            requestedQuantity:    null,
            isBusinessStrategy:   false
        };
    }
}

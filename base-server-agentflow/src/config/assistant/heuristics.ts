import {
    IPlannerHistoryMessage,
    IPlannerResult,
    TAssistantMode,
    TLanguageStyle,
} from '../../APIs/_shared/types/agents.interface';
import { getAssistantModePolicy, listAssistantModes } from './policy';

// ─────────────────────────────────────────────────────────────────────────────
// FOLLOW-UP / CONTINUATION DETECTION
// Catches any signal that the user is continuing a previous task, not starting fresh.
// ─────────────────────────────────────────────────────────────────────────────

const FOLLOWUP_PATTERNS = [
    /^(same|more|continue|retry|again|next|another|different|also)\b/i,
    /^\d+\s*(more|again)\b/i,                           // "2 more", "5 more"
    /^(now|but now|this time)\b/i,                      // "now change country"
    /^(change|switch|update|modify|make it|convert)\b/i,
    /^(for|in|from)\s+[a-z]/i,                          // "for usa", "in hindi"
    /^(shorter|longer|detailed|brief|expand|elaborate|summarize)\b/i,
    /^(only|just)\s+(videos?|articles?|news|leads?)\b/i,
    /^(in|translate to)\s+(urdu|hindi|english|roman|arabic)\b/i,
    /^(add|include|exclude|remove|without)\b/i,
    /^(what about|how about|and what|also tell)\b/i,
];

function isFollowUpContinuation(topic: string): boolean {
    const t = topic.trim();
    if (t.split(/\s+/).length > 12) return false; // Long prompts are usually fresh requests
    return FOLLOWUP_PATTERNS.some((p) => p.test(t));
}

function extractModeFromHistory(history: IPlannerHistoryMessage[]): TAssistantMode | null {
    // Walk backwards through user messages to find the last substantive intent
    const recentUser = [...history]
        .reverse()
        .filter((m) => m.role === 'user')
        .slice(0, 4);

    for (const msg of recentUser) {
        const detected = scoreModes(msg.content);
        if (detected && detected !== 'casual_chat') return detected;
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING-BASED MODE DETECTION
// Each mode gets a score from pattern matches. Highest score wins.
// This is more robust than first-match-wins because multiple signals accumulate.
// ─────────────────────────────────────────────────────────────────────────────

function scoreModes(text: string): TAssistantMode | null {
    const modes = listAssistantModes().filter((m) => m !== 'casual_chat');
    let bestMode: TAssistantMode | null = null;
    let bestScore = 0;

    for (const mode of modes) {
        const policy = getAssistantModePolicy(mode);
        let score = 0;
        for (const pattern of policy.intentPatterns) {
            const matches = text.toLowerCase().match(new RegExp(pattern.source, 'gi'));
            if (matches) score += matches.length;
        }
        if (score > bestScore) {
            bestScore = score;
            bestMode = mode;
        }
    }
    return bestMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// CASUAL CHAT DETECTION
// Checks if the topic is a short social/conversational message.
// ─────────────────────────────────────────────────────────────────────────────

function isCasualChatMessage(topic: string): boolean {
    const policy = getAssistantModePolicy('casual_chat');
    const wordCount = topic.trim().split(/\s+/).length;
    return policy.intentPatterns.some((p) => p.test(topic)) && wordCount <= 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: detectAssistantMode
// ─────────────────────────────────────────────────────────────────────────────

export function detectAssistantMode(topic: string, history: IPlannerHistoryMessage[]): TAssistantMode {
    const normalizedTopic = topic.trim().toLowerCase();

    // 1. Follow-up signal → inherit mode from recent history
    if (isFollowUpContinuation(normalizedTopic) && history.length > 0) {
        const prevMode = extractModeFromHistory(history);
        if (prevMode) return prevMode;
    }

    // 2. Casual chat (must be short + match social patterns)
    if (isCasualChatMessage(normalizedTopic)) return 'casual_chat';

    // 3. Score-based detection using topic + last 3 user messages for context
    const recentContext = history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => m.content)
        .join(' ');
    const combined = `${recentContext} ${topic}`.toLowerCase();

    const scored = scoreModes(combined);
    if (scored) return scored;

    // 4. Default: knowledge (always give an answer, never nothing)
    return 'knowledge';
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: detectLanguageStyle
// Uses the current message + last 2 user messages only.
// Avoids pollution from AI English responses in history.
// ─────────────────────────────────────────────────────────────────────────────

export function detectLanguageStyle(topic: string, history: IPlannerHistoryMessage[]): TLanguageStyle {
    // Only look at user messages, not agent replies (which are always English)
    const recentUserText = history
        .filter((m) => m.role === 'user')
        .slice(-2)
        .map((m) => m.content)
        .join(' ');
    const combined = `${recentUserText} ${topic}`;

    const hasUrduScript = /[\u0600-\u06FF]/.test(combined);
    const hasLatinScript = /[A-Za-z]{3,}/.test(combined); // at least 3-letter Latin word

    if (hasUrduScript && hasLatinScript) return 'mixed';
    if (hasUrduScript) return 'urdu';

    // Roman Urdu: common Urdu/Hindustani words written in Latin script
    if (/\b(kya|kaise|kese|karna|samjhao|samjha|bata|btao|aur|agar|magar|kyun|nahi|nahin|hoon|hain|mein|yeh|woh|karun|chahiye|theek|bhi|phir|aap|main|hai|tha|thi|kr|h\b|acha|accha|bilkul|zaroor|shukriya|shukria)\b/i.test(combined)) return 'roman_urdu';

    // Hindi-specific (not Roman Urdu)
    if (/\b(namaste|kijiye|dijiye|batayein|karein|chahte|chahti|hoga|hogi|nahin|aapko|mujhe|humein|chaliye)\b/i.test(combined)) return 'hindi';

    return 'english';
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: extractRequestedQuantity
// ─────────────────────────────────────────────────────────────────────────────

export function extractRequestedQuantity(topic: string): number | null {
    // Priority 1: explicit intent phrase + number ("give me 5", "find 10", "I need 3")
    const intentMatch = topic.match(/\b(?:give me|find|get|need|want|show|fetch|list|provide|generate|send)\s+(\d{1,3})\b/i);
    if (intentMatch) return parseInt(intentMatch[1], 10);

    // Priority 2: number directly before a result noun ("5 leads", "10 articles", "20 videos")
    const nounMatch = topic.match(/\b(\d{1,3})\s+(?:leads?|clients?|prospects?|articles?|videos?|results?|resources?|websites?|emails?|companies|contacts?|papers?|newspapers?|sources?|examples?|tools?|tips?|ways?|steps?|ideas?|options?)\b/i);
    if (nounMatch) return parseInt(nounMatch[1], 10);

    // Priority 3: "X more" continuation ("2 more", "5 more")
    const moreMatch = topic.match(/\b(\d{1,3})\s+more\b/i);
    if (moreMatch) return parseInt(moreMatch[1], 10);

    // Priority 4: standalone small number NOT part of a year, version, percentage, unit
    const standalone = topic.match(/(?<![/\-\d.])(?<!\d{3})\b([1-9][0-9]?)\b(?!\s*(?:st|nd|rd|th|am|pm|%|px|kg|km|mb|gb|gb|hz|ms|s\b|min|hrs?|days?|weeks?|months?|years?))/i);
    return standalone ? parseInt(standalone[1], 10) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: extractMissingFields
// Uses semantic + broad pattern matching instead of hardcoded word lists.
// ─────────────────────────────────────────────────────────────────────────────

export function extractMissingFields(topic: string, history: IPlannerHistoryMessage[], mode: TAssistantMode): string[] {
    const normalized = [...history.map((m) => m.content), topic].join(' ').toLowerCase();
    const policy = getAssistantModePolicy(mode);

    if (!policy.clarificationFields?.length) return [];

    const missing: string[] = [];

    // COUNTRY / LOCATION detection — semantic + broad, not hardcoded list
    if (policy.clarificationFields.includes('country')) {
        const hasLocation =
            // Common countries/cities (frequently used — not exhaustive, just seed)
            /\b(usa|us\b|uk\b|uae|dubai|abu dhabi|pakistan|india|canada|australia|germany|france|turkey|egypt|saudi|qatar|ksa|london|new york|new york city|nyc|los angeles|toronto|karachi|lahore|islamabad|delhi|mumbai|bangladesh|malaysia|singapore|nigeria|south africa|brazil|mexico|spain|italy|netherlands|sweden|norway|denmark|poland|ukraine|russia|china|japan|korea|philippines|vietnam|thailand|indonesia|uk|ireland|scotland|wales)\b/i.test(normalized) ||
            // Semantic location markers: "in X", "from X", "targeting X", "for X market"
            /\b(in|from|based in|located in|for|targeting|across|within)\s+[A-Z][a-z]+/.test(topic) ||
            // Explicit location words
            /\b(country|countries|city|cities|region|location|local|international|global|worldwide|domestic|overseas|abroad|market|geo|geography|territory|area|zone)\b/i.test(normalized);
        if (!hasLocation) missing.push('country');
    }

    // INDUSTRY / NICHE detection — semantic, not hardcoded list
    if (policy.clarificationFields.includes('industry')) {
        const hasIndustry =
            // Well-known industries (seed list, not exhaustive)
            /\b(seo|digital marketing|healthcare|health|medical|dental|legal|law|real estate|realty|ecommerce|e-commerce|fintech|finance|saas|software|it\b|tech|technology|education|edtech|retail|hospitality|restaurant|food|fitness|gym|construction|manufacturing|logistics|supply chain|fashion|beauty|travel|insurance|accounting|hr|recruitment|automotive|agriculture|energy|blockchain|crypto|ai\b|machine learning|web development|web design|graphic design|content|media|publishing|pr|advertising|social media|b2b|b2c|startup|ngo|non-profit)\b/i.test(normalized) ||
            // Semantic: any noun followed by "industry/sector/niche/business/clients/companies"
            /\b\w+\s+(industry|sector|niche|business|companies|clients|leads|market|space|vertical)\b/i.test(normalized) ||
            // Explicit industry words
            /\b(industry|niche|sector|vertical|space|domain|field|market|specialty|specialization)\b/i.test(normalized);
        if (!hasIndustry) missing.push('industry');
    }

    // QUANTITY detection — check full history for previously stated quantity
    if (policy.quantityRule === 'required_exact' && !extractRequestedQuantity(topic)) {
        const historyHasQuantity = history.some((m) => extractRequestedQuantity(m.content) !== null);
        if (!historyHasQuantity) missing.push('quantity');
    }

    return missing;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: summarizeHistory
// ─────────────────────────────────────────────────────────────────────────────

export function summarizeHistory(history: IPlannerHistoryMessage[]): string {
    if (history.length === 0) return 'No previous conversation context.';

    // Include last 6 messages, label clearly
    return history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content.trim().slice(0, 200)}`)
        .join(' | ');
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: buildHeuristicPlannerResult
// ─────────────────────────────────────────────────────────────────────────────

const INCOMPLETE_INPUT_PATTERNS = /^(give me|find me|get me|show me|tell me|gimme|fetch|send me|list|generate|i want|i need|need|want|can you|could you|please|pls|help|help me)\.?$/i;

export function buildHeuristicPlannerResult(topic: string, history: IPlannerHistoryMessage[]): IPlannerResult {
    // Handle incomplete inputs — treat as follow-up or ask for clarification
    if (INCOMPLETE_INPUT_PATTERNS.test(topic.trim()) && history.length > 0) {
        const prevMode = extractModeFromHistory(history);
        const prevContext = [...history].reverse().find((m) => m.role === 'user' && m.content.trim().length > 5)?.content ?? '';
        if (prevMode && prevContext) {
            const enriched = `${prevContext} — continue`;
            return buildHeuristicPlannerResult(enriched, history);
        }
    }

    const mode = detectAssistantMode(topic, history);
    const requestedQuantity = extractRequestedQuantity(topic) ?? extractQuantityFromHistory(history);
    const missingFields = extractMissingFields(topic, history, mode);
    const languageStyle = detectLanguageStyle(topic, history);
    const language = mapLanguageName(languageStyle);
    const internalRefinedTopic = buildContextualTopic(topic, history, mode, requestedQuantity);

    return {
        thought: `Detected ${mode} intent with ${language} response style.`,
        mode,
        clarificationNeeded: missingFields.length > 0,
        clarificationQuestion: missingFields.length > 0 ? buildSmartClarificationQuestion(missingFields, mode, languageStyle) : '',
        missingFields,
        internalRefinedTopic,
        directAnswer: buildDirectAnswer(mode, topic, languageStyle),
        queries: buildQuerySeeds(internalRefinedTopic, mode),
        language,
        languageStyle,
        format: resolveResearchFormat(mode, topic),
        outputType: mode === 'summary' ? 'summary' : 'list',
        requestedQuantity,
        isBusinessStrategy: mode === 'leads' || mode === 'business_strategy',
        responseSections: getAssistantModePolicy(mode).sections,
        preferAuthenticatedLeads: mode === 'leads',
        followUpQuestionBudget: missingFields.length > 0 ? 1 : 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function extractQuantityFromHistory(history: IPlannerHistoryMessage[]): number | null {
    for (const msg of [...history].reverse()) {
        if (msg.role !== 'user') continue;
        const q = extractRequestedQuantity(msg.content);
        if (q !== null) return q;
    }
    return null;
}

function buildSmartClarificationQuestion(missing: string[], mode: TAssistantMode, style: TLanguageStyle): string {
    const first = missing[0];
    const questions: Record<string, Record<TLanguageStyle, string>> = {
        country: {
            english: 'Which country or city are you targeting?',
            roman_urdu: 'Kis country ya city ke liye chahiye?',
            urdu: 'کس ملک یا شہر کے لیے چاہیے؟',
            hindi: 'Kaunse desh ya shehar ke liye chahiye?',
            mixed: 'Kis country/city ke liye?',
        },
        industry: {
            english: 'Which industry or niche are you targeting?',
            roman_urdu: 'Kaunsi industry ya niche ke liye chahiye?',
            urdu: 'کس انڈسٹری یا نچ کے لیے؟',
            hindi: 'Kaunsi industry ke liye chahiye?',
            mixed: 'Which industry/niche?',
        },
        quantity: {
            english: mode === 'leads' ? 'How many leads do you need?' : 'How many would you like?',
            roman_urdu: mode === 'leads' ? 'Kitne leads chahiye?' : 'Kitne chahiye?',
            urdu: mode === 'leads' ? 'کتنے لیڈز چاہییں؟' : 'کتنے چاہییں؟',
            hindi: mode === 'leads' ? 'Kitne leads chahiye?' : 'Kitne chahiye?',
            mixed: mode === 'leads' ? 'Kitne leads chahiye?' : 'How many?',
        },
    };
    return questions[first]?.[style] ?? `Please specify: ${missing.join(', ')}.`;
}

function buildQuerySeeds(topic: string, mode: TAssistantMode): string[] {
    const clean = topic.trim();
    switch (mode) {
        case 'leads':
            return [
                clean,
                `${clean} company contact email`,
                `${clean} business website`,
                `${clean} decision maker contact`,
            ];
        case 'resources':
            return [clean, `best ${clean}`, `top ${clean} resources`];
        case 'scraping':
            return [clean, `${clean} contact page`, `${clean} email extraction`];
        case 'business_strategy':
            return [clean, `${clean} market opportunities`, `${clean} growth strategy`, `${clean} target customers`];
        case 'research':
            return [clean, `${clean} analysis`, `${clean} trends`, `${clean} statistics`];
        case 'comparison':
            return [clean, `${clean} comparison`, `${clean} difference`];
        case 'learning':
        case 'knowledge':
            return [clean, `${clean} explained`, `${clean} examples`];
        default:
            return [clean];
    }
}

function buildContextualTopic(
    topic: string,
    history: IPlannerHistoryMessage[],
    mode: TAssistantMode,
    requestedQuantity: number | null
): string {
    const normalizedTopic = topic.trim();

    // Only enrich context for short follow-ups (≤5 words)
    if (normalizedTopic.split(/\s+/).length > 5) return normalizedTopic;

    // Get the last substantive user message (not just "more", "same", etc.)
    const lastSubstantiveUser = [...history]
        .reverse()
        .find(
            (m) =>
                m.role === 'user' &&
                m.content.trim().split(/\s+/).length > 4 &&
                !isFollowUpContinuation(m.content.trim())
        )?.content.trim();

    if (!lastSubstantiveUser) return normalizedTopic;

    // If it's a pure quantity follow-up ("5 more", "give me 10")
    const onlyQuantity = /^(\d+\s*(more)?|give me \d+|find \d+|get \d+)$/i.test(normalizedTopic);
    if (onlyQuantity && (mode === 'leads' || mode === 'resources')) {
        return buildLeadContextualTopic(normalizedTopic, lastSubstantiveUser, requestedQuantity);
    }

    // For all modes: merge follow-up with last context
    const isFollowUp = isFollowUpContinuation(normalizedTopic);
    if (isFollowUp) {
        return `${lastSubstantiveUser} — ${normalizedTopic}`.trim();
    }

    return normalizedTopic;
}

function buildLeadContextualTopic(topic: string, lastContext: string, requestedQuantity: number | null): string {
    const cleanedContext = lastContext
        .replace(/\b(i want|i need|give me|give|find me|find|show me|show|looking for|make it|get me|fetch|send|list)\b/gi, '')
        .replace(/\b\d{1,3}\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (requestedQuantity) {
        const normalized = cleanedContext
            .replace(/\b(leads|clients|prospects|companies|buyers|contacts)\b/gi, 'lead')
            .replace(/^\b(for|to|into|about)\b\s+/i, '')
            .trim();
        return `${requestedQuantity} ${normalized}`.trim();
    }

    return `${cleanedContext} ${topic}`.trim();
}

function resolveResearchFormat(mode: TAssistantMode, topic: string = ''): IPlannerResult['format'] {
    switch (mode) {
        case 'resources': {
            const t = topic.toLowerCase();
            if (/\b(video|videos?|youtube|watch|tutorial video|reels?|clips?)\b/.test(t)) return 'videos';
            if (/\b(news|newspaper|current events?|latest|breaking|today|this week)\b/.test(t)) return 'news';
            if (/\b(product|products?|tool|tools?|software|app|apps?|website|websites?|platform|service)\b/.test(t)) return 'products';
            return 'articles';
        }
        case 'leads':
        case 'business_strategy':
            return 'products';
        case 'research':
            return 'news';
        default:
            return 'articles';
    }
}

function mapLanguageName(style: TLanguageStyle): string {
    switch (style) {
        case 'urdu':        return 'Urdu';
        case 'roman_urdu':  return 'Roman Urdu';
        case 'hindi':       return 'Hindi';
        case 'mixed':       return 'Mixed Language';
        default:            return 'English';
    }
}

function buildDirectAnswer(mode: TAssistantMode, topic: string, languageStyle: TLanguageStyle): string {
    if (mode === 'casual_chat') return buildCasualChatReply(topic, languageStyle);

    // Meta questions about the assistant are answered directly in any mode
    if (/\b(who are you|what are you|what can you do|what do you do|introduce yourself|are you an ai|are you a bot|capabilities|features|help me with)\b/i.test(topic)) {
        return buildSelfIntroReply(languageStyle);
    }

    // Knowledge/learning: heuristic provides a placeholder only.
    // The real explanation comes from the OpenAI planner's directAnswer field.
    return '';
}

function buildCasualChatReply(topic: string, languageStyle: TLanguageStyle): string {
    const n = topic.trim().toLowerCase();

    switch (languageStyle) {
        case 'urdu':
            if (/کیا حال|کیسے ہو|کیا چل|ٹھیک ہو/.test(n)) return 'میں بالکل ٹھیک ہوں، شکریہ! آپ کس چیز میں مدد چاہتے ہیں؟';
            if (/شکریہ|جزاک/.test(n)) return 'کوئی بات نہیں! کوئی اور سوال ہو تو بتائیں۔';
            if (/الوداع|خدا حافظ/.test(n)) return 'خدا حافظ! جب بھی ضرورت ہو واپس آئیں۔';
            return buildSelfIntroReply('urdu');
        case 'roman_urdu':
            if (/how are|kese ho|kaise ho|kya haal|theek ho/.test(n)) return 'Main bilkul theek hoon, shukriya! Bataiye, aaj kya karna hai?';
            if (/shukriya|shukria|thanks|thank/.test(n)) return 'Koi baat nahi! Aur kuch chahiye?';
            if (/bye|khuda hafiz|allah hafiz|alvida/.test(n)) return 'Allah Hafiz! Jab bhi zarurat ho wapas aayein.';
            if (/whats up|kya chal|sab theek|kya scene/.test(n)) return 'Sab theek chal raha hai! Bataiye, kaise help karun?';
            return 'Hey! Main yahan hoon. Bataiye, aaj main kis mein help karun?';
        case 'hindi':
            if (/how are|kaise ho|kya haal|theek ho/.test(n)) return 'Main bilkul theek hoon! Aap batayein, aaj kya karna chahte hain?';
            if (/shukriya|dhanyavad|thanks/.test(n)) return 'Koi baat nahi! Aur kuch poochhna ho toh batayein.';
            return 'Namaste! Main AgentFlow AI hoon. Kaise madad kar sakta hoon?';
        case 'mixed':
            if (/how are|kese ho|kaise/.test(n)) return "I'm great! Main ready hoon — batao kya help chahiye?";
            return 'Hey! Main ready hoon. Aap batayein, what would you like help with?';
        default: // english
            if (/how are|how r u|hru|u ok/.test(n)) return "I'm doing great and ready to help! What would you like to work on?";
            if (/what'?s up|whats up|sup\b|wassup/.test(n)) return 'All good here! What can I help you with today?';
            if (/thanks|thank you|thx|ty\b|appreciate/.test(n)) return "You're welcome! Let me know if you need anything else.";
            if (/bye|goodbye|see you|take care|cya|ttyl/.test(n)) return 'Take care! Come back anytime you need help.';
            if (/ok\b|okay|sure|alright|got it|understood|sounds good|cool\b|great\b|perfect\b|nice\b/.test(n)) return 'Got it! What would you like to do next?';
            if (/good morning|morning|good evening|evening|good night/.test(n)) return 'Hey! Good to see you. What can I help you with today?';
            if (/lol|haha|hehe|😂|😄/.test(n)) return "Ha! 😄 What else can I help you with?";
            return 'Hey! How can I help you today?';
    }
}

function buildSelfIntroReply(languageStyle: TLanguageStyle): string {
    switch (languageStyle) {
        case 'urdu':
            return 'میں AgentFlow AI ہوں — ایک ذہین ملٹی موڈ اسسٹنٹ۔ میں آپ کی ریسرچ، لیڈ جنریشن، سیکھنے، کوڈنگ، اور بہت کچھ میں مدد کر سکتا ہوں۔';
        case 'roman_urdu':
            return 'Main AgentFlow AI hoon — ek intelligent multi-mode assistant. Main aapki help kar sakta hoon:\n\n• Research aur market analysis\n• Lead generation with full contact details\n• Kisi bhi topic ko step-by-step seekhna\n• Videos, articles, papers dhundna\n• Business strategy aur planning\n• Coding help\n\nBataiye kya chahiye?';
        case 'hindi':
            return 'Main AgentFlow AI hoon — ek smart multi-mode assistant. Mujhse pooch sakte hain: research, leads, learning, coding, business strategy, aur bahut kuch.';
        default:
            return "I'm AgentFlow AI — a smart multi-mode assistant. I can help you with:\n\n• Research & market analysis\n• Lead generation with full contact details\n• Learning any topic step by step\n• Finding resources (videos, articles, papers)\n• Scraping & data extraction\n• Business strategy & planning\n• Coding help\n\nJust tell me what you need!";
    }
}

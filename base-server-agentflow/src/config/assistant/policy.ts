import { TAssistantMode } from '../../APIs/_shared/types/agents.interface';

export type TAssistantRenderStyle = 'chat' | 'guided' | 'report' | 'list' | 'bullets' | 'code';
export type TAssistantQuantityRule = 'none' | 'optional_exact' | 'required_exact';

export interface IAssistantModePolicy {
    mode: TAssistantMode;
    title: string;
    sections: string[];
    routingHint: string;
    formattingHint: string;
    renderStyle: TAssistantRenderStyle;
    quantityRule: TAssistantQuantityRule;
    memoryPriority: 'low' | 'medium' | 'high';
    clarificationFields?: string[];
    intentPatterns: RegExp[];
    allowExecutiveSummary: boolean;
}

export interface IAssistantPolicyVersion {
    version: string;
    label: string;
    coreRules: string[];
    memoryRules: string[];
    quantityRules: string[];
    promptRules: string[];
    suggestionRules: string[];
    modeAliases: Record<string, TAssistantMode>;
    modes: Record<TAssistantMode, IAssistantModePolicy>;
}

const ACTIVE_POLICY_V2026_04_19: IAssistantPolicyVersion = {
    version: '2026-04-19',
    label: 'Master Multi-Mode Assistant Policy',
    coreRules: [
        'Detect what the user actually wants and route to the best mode silently.',
        'Reply in the same language style as the user: English, Roman Urdu, Urdu, Hindi, or mixed language.',
        'Be natural, context aware, adaptive, and avoid robotic formatting.',
        'Ask follow-up questions only when necessary and only for truly missing required fields.',
        'Use previous conversation context before asking again for country, city, industry, quantity, or goals.',
        'Do not default to executive-summary formatting unless the chosen mode calls for it.',
        'Keep frontend and backend contracts stable by always returning mode-aware response metadata.',
    ],
    memoryRules: [
        'Use the latest relevant user messages when the current prompt is short or incomplete.',
        'Treat quantity-only follow-ups such as "make it 2" or "5 more" as continuations of the previous task.',
        'Remember unfinished business context such as industry, service, location, and target audience.',
        'If the user changes topic clearly, stop carrying over prior task-specific entities.',
    ],
    quantityRules: [
        'Honor exact requested counts for resources and leads.',
        'If the mode requires an exact count and the user did not specify one, ask for quantity once.',
        'Do not exceed the requested number in final ranked output.',
    ],
    promptRules: [
        'Keep prompts concise and mode-aware instead of scattering repeated instructions.',
        'Return structured JSON from planner and ranker calls.',
        'Prefer direct natural replies for casual chat and clarifications.',
    ],
    suggestionRules: [
        'Suggestions should stay short, relevant, and aligned with the active task intent.',
        'Do not ask repeated questions in suggestion or clarification flows.',
    ],
    modeAliases: {
        tutor: 'learning',
        study: 'learning',
        summarization: 'summary',
        lead_generation: 'leads',
        lead_recommendation: 'business_strategy',
        business_growth: 'business_strategy',
        marketing: 'business_strategy',
        writing: 'knowledge',
        decision: 'comparison',
        freelancing: 'business_strategy',
        social_media: 'business_strategy',
        islamic: 'learning',
        document: 'knowledge',
        creative: 'planning',
    },
    modes: {
        casual_chat: {
            mode: 'casual_chat',
            title: 'Normal Chat',
            sections: ['Natural Reply'],
            routingHint: 'Use for greetings, thanks, and normal human conversation.',
            formattingHint: 'Friendly conversational reply, no report shell, no structured summary.',
            renderStyle: 'chat',
            quantityRule: 'none',
            memoryPriority: 'medium',
            intentPatterns: [/\b(hello|hi+|hey|how are|how r u|hru|what'?s up|whats up|sup|thanks|thank you|thx|good morning|good evening|good night|salam|assalam|aoa|who are you|what can you do|what do you do|tell me about yourself|what are you|are you an ai|are you a bot|introduce yourself|nice to meet|good to see|great job|well done|perfect|awesome|ok|okay|sure|alright|got it|understood|bye|goodbye|see you|take care)\b/i],
            allowExecutiveSummary: false,
        },
        learning: {
            mode: 'learning',
            title: 'Learning / Teaching',
            sections: [
                'Definition',
                'Easy Explanation',
                'Step-by-step',
                'Real Example',
                'Why Important',
                'Common Mistakes',
                'Advanced Tip',
                'Summary',
            ],
            routingHint: 'Use when the user wants to understand a topic or asks to explain something.',
            formattingHint: 'Teach progressively, start simple, then deepen with examples.',
            renderStyle: 'guided',
            quantityRule: 'none',
            memoryPriority: 'high',
            intentPatterns: [/\b(explain|what is|kya hai|kaise|samjhao|teach|understand|learn)\b/i],
            allowExecutiveSummary: false,
        },
        knowledge: {
            mode: 'knowledge',
            title: 'Knowledge',
            sections: ['Definition', 'Practical Explanation', 'Why It Matters'],
            routingHint: 'Use for quick understanding, direct facts, or practical explanations.',
            formattingHint: 'Clear and practical, without unnecessary report framing.',
            renderStyle: 'guided',
            quantityRule: 'none',
            memoryPriority: 'medium',
            intentPatterns: [/\b(meaning|concept|knowledge|tell me about|quick answer)\b/i],
            allowExecutiveSummary: false,
        },
        research: {
            mode: 'research',
            title: 'Research',
            sections: ['Overview', 'Data Points', 'Key Insights', 'Opportunities', 'Risks', 'Recommendations'],
            routingHint: 'Use for deep research, market analysis, trends, or current-state investigation.',
            formattingHint: 'Structured analytical report with evidence-backed findings.',
            renderStyle: 'report',
            quantityRule: 'none',
            memoryPriority: 'high',
            intentPatterns: [/\b(research|analysis|analyze|market research|competitor|trends?|future|deep dive)\b/i],
            allowExecutiveSummary: true,
        },
        resources: {
            mode: 'resources',
            title: 'Resource Finder',
            sections: ['Explanation', 'Exact Resources'],
            routingHint: 'Use when the user asks for videos, articles, websites, courses, tools, or mixed resources.',
            formattingHint: 'Honor exact counts and annotate each item with why it is useful.',
            renderStyle: 'list',
            quantityRule: 'required_exact',
            memoryPriority: 'high',
            intentPatterns: [/\b(videos?|articles?|websites?|tools?|resources?|courses?)\b/i],
            allowExecutiveSummary: false,
        },
        leads: {
            mode: 'leads',
            title: 'Lead Generation',
            sections: [
                'Company Name',
                'Website',
                'Industry',
                'Location',
                'Decision Maker Role',
                'Email',
                'Phone Number',
                'Contact Method',
                'Pain Point',
                'Why They Need You',
                'Selling Angle',
                'Outreach Message',
            ],
            routingHint: 'Use for leads, prospects, companies, buyers, and client-finding requests.',
            formattingHint: 'Real buyer businesses only, exact count, no duplicates, prefer authenticated contacts.',
            renderStyle: 'list',
            quantityRule: 'required_exact',
            memoryPriority: 'high',
            clarificationFields: ['industry', 'country', 'quantity'],
            intentPatterns: [/\b(leads?|clients?|prospects?|companies?|buyers?)\b/i],
            allowExecutiveSummary: false,
        },
        scraping: {
            mode: 'scraping',
            title: 'Scraping / Data Extraction',
            sections: ['Best Method', 'Step-by-Step Plan', 'Tools', 'Risks', 'Output Format'],
            routingHint: 'Use for scraping, crawling, extraction, or contact data collection.',
            formattingHint: 'Explain the most suitable extraction path clearly and safely.',
            renderStyle: 'guided',
            quantityRule: 'none',
            memoryPriority: 'medium',
            intentPatterns: [/\b(scrape|scraping|extract|crawl|emails?|phone numbers?|data extraction)\b/i],
            allowExecutiveSummary: false,
        },
        business_strategy: {
            mode: 'business_strategy',
            title: 'Business Strategy',
            sections: ['Current Problem', 'Best Strategy', 'Action Steps', 'Mistakes', 'Tools', 'Example Scripts', 'Scaling Plan'],
            routingHint: 'Use for growth strategy, service selling, markets, pricing, and business decisions.',
            formattingHint: 'Actionable consultant-style guidance with priorities and practical next steps.',
            renderStyle: 'guided',
            quantityRule: 'none',
            memoryPriority: 'high',
            intentPatterns: [/\b(best market|where should i sell|how to sell|pricing|get clients|sales process|business growth|marketing|market|country|city|industry)\b/i],
            allowExecutiveSummary: false,
        },
        summary: {
            mode: 'summary',
            title: 'Summary',
            sections: ['5-7 concise bullets'],
            routingHint: 'Use when the user explicitly asks to summarize, shorten, or keep it brief.',
            formattingHint: 'Short, crisp bullets without extra theory.',
            renderStyle: 'bullets',
            quantityRule: 'none',
            memoryPriority: 'medium',
            intentPatterns: [/\b(summary|summarize|brief|short version|concise)\b/i],
            allowExecutiveSummary: false,
        },
        coding: {
            mode: 'coding',
            title: 'Coding',
            sections: ['Problem Analysis', 'Fixed Code', 'Explanation', 'Better Approach', 'Optimization'],
            routingHint: 'Use for code, bugs, projects, systems, APIs, and implementation help.',
            formattingHint: 'Explain the problem, show the fix, and keep code-oriented structure.',
            renderStyle: 'code',
            quantityRule: 'none',
            memoryPriority: 'high',
            intentPatterns: [/\b(code|bug|error|fix|typescript|javascript|python|api|backend|frontend|app)\b/i],
            allowExecutiveSummary: false,
        },
        comparison: {
            mode: 'comparison',
            title: 'Comparison',
            sections: ['Feature Table', 'Recommendation'],
            routingHint: 'Use when comparing options or helping choose between alternatives.',
            formattingHint: 'Use a compact comparison table and clear recommendation.',
            renderStyle: 'guided',
            quantityRule: 'none',
            memoryPriority: 'medium',
            intentPatterns: [/\b(compare|vs|versus|difference between|better than|which one)\b/i],
            allowExecutiveSummary: false,
        },
        planning: {
            mode: 'planning',
            title: 'Planning',
            sections: ['Timeline', 'Steps', 'Priorities', 'Tools Needed', 'Risks'],
            routingHint: 'Use for roadmaps, study plans, launch plans, and execution planning.',
            formattingHint: 'Structured plan with timeline and priorities.',
            renderStyle: 'guided',
            quantityRule: 'none',
            memoryPriority: 'high',
            intentPatterns: [/\b(plan|roadmap|steps|strategy plan|how to start|timeline|daily plan|launch plan)\b/i],
            allowExecutiveSummary: false,
        },
    },
};

export const ACTIVE_ASSISTANT_POLICY_VERSION = ACTIVE_POLICY_V2026_04_19.version;

export const ASSISTANT_POLICY_REGISTRY: Record<string, IAssistantPolicyVersion> = {
    [ACTIVE_POLICY_V2026_04_19.version]: ACTIVE_POLICY_V2026_04_19,
};

export function getAssistantPolicy(version: string = ACTIVE_ASSISTANT_POLICY_VERSION): IAssistantPolicyVersion {
    return ASSISTANT_POLICY_REGISTRY[version] || ACTIVE_POLICY_V2026_04_19;
}

export function getAssistantModePolicy(mode: TAssistantMode, version?: string): IAssistantModePolicy {
    return getAssistantPolicy(version).modes[mode];
}

export function getAssistantModePolicies(version?: string): Record<TAssistantMode, IAssistantModePolicy> {
    return getAssistantPolicy(version).modes;
}

export function listAssistantModes(version?: string): TAssistantMode[] {
    return Object.keys(getAssistantModePolicies(version)) as TAssistantMode[];
}

export function mapAssistantModeAlias(mode: string, version?: string): TAssistantMode | null {
    const policy = getAssistantPolicy(version);
    const normalized = mode.trim().toLowerCase().replace(/\s+/g, '_');

    if (normalized in policy.modes) {
        return normalized as TAssistantMode;
    }

    return policy.modeAliases[normalized] ?? null;
}

export const ASSISTANT_MODE_POLICIES = getAssistantModePolicies();
export const ASSISTANT_CORE_RULES = getAssistantPolicy().coreRules;

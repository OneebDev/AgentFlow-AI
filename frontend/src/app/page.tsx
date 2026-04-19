'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
    createJobStream,
    getSuggestions,
    IHistoryMessage,
    IResearchResults,
    IRankedResult,
    submitResearch,
    TAssistantMode,
    TOutputType,
    TResearchFormat,
    TStreamEvent,
} from '@/lib/api';
import {
    Search, Loader2, Play, CheckCircle2, AlertCircle,
    FileText, Video, ShoppingBag, Newspaper, ExternalLink,
    List, AlignLeft, Send, Sparkles, MessageSquare, Plus,
    Trash2, ChevronDown, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatMessage = {
    id: string;
    role: 'user' | 'agent';
    content: string; // The query OR the basic response
    jobId?: string;
    status?: 'idle' | 'researching' | 'crawling' | 'critiquing' | 'completed' | 'failed';
    thought?: string;
    results?: IResearchResults;
    error?: string;
    isBusinessStrategy?: boolean;
    mode?: TAssistantMode;
};

type ChatSession = {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
};

// ── Filter Options ────────────────────────────────────────────────────────────

const FORMAT_OPTIONS = [
    { value: 'articles', label: 'Articles', icon: <FileText size={13} /> },
    { value: 'videos', label: 'Videos', icon: <Video size={13} /> },
    { value: 'news', label: 'News', icon: <Newspaper size={13} /> },
    { value: 'products', label: 'Products', icon: <ShoppingBag size={13} /> },
] as const satisfies ReadonlyArray<{ value: TResearchFormat; label: string; icon: ReactNode }>;

const LANGUAGE_OPTIONS = [
    { value: 'English', label: 'English' },
    { value: 'Urdu', label: 'اردو' },
    { value: 'Hindi', label: 'हिंदी' },
];

const SUGGESTIONS_PLACEHOLDER = [
    "Research quantum entanglement",
    "Best budget laptops under $500",
    "Latest artificial intelligence news",
    "Compare Apple M3 vs Snapdragon X Elite"
];

// ── Main Page Component ───────────────────────────────────────────────────────

export default function Home() {
    const [isMounted, setIsMounted] = useState(false);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string>('new');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const [inputValue, setInputValue] = useState('');
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    // Filters
    const [format, setFormat] = useState<TResearchFormat | null>(null);
    const [language, setLanguage] = useState<string | null>(null);
    const [outputType, setOutputType] = useState<TOutputType | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const streamRef = useRef<EventSource | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const suggestTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Initial Load & Mount
    useEffect(() => {
        setIsMounted(true);
        const saved = localStorage.getItem('agentflow_sessions');
        if (saved) {
            try {
                setSessions(normalizeSessions(JSON.parse(saved) as ChatSession[]));
            } catch (e) {
                console.error(e);
            }
        }
        return () => {
            if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
            streamRef.current?.close();
        };
    }, []);

    // Save to LocalStorage
    useEffect(() => {
        if (!isMounted) return;

        const normalized = normalizeSessions(sessions);
        if (normalized.length > 0) {
            localStorage.setItem('agentflow_sessions', JSON.stringify(normalized));
        } else {
            localStorage.removeItem('agentflow_sessions');
        }
    }, [sessions, isMounted]);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const currentSession = useMemo(() => sessions.find(s => s.id === currentSessionId), [sessions, currentSessionId]);
    const messages = useMemo(() => currentSession?.messages || [], [currentSession]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    if (!isMounted) return null;

    // ── Handlers ──────────────────────────────────────────────────────────────

    const createNewSession = () => {
        setCurrentSessionId('new');
        setInputValue('');
        setAiSuggestions([]);
        streamRef.current?.close();
    };

    const deleteSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setSessions(prev => prev.filter(s => s.id !== id));
        if (currentSessionId === id) setCurrentSessionId('new');
    };

    const handleInputChange = (val: string) => {
        setInputValue(val);
        if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);

        if (val.length < 2) {
            setAiSuggestions([]);
            return;
        }

        suggestTimeoutRef.current = setTimeout(async () => {
            try {
                if (!val.trim()) return; // Don't fetch for empty
                const res = await getSuggestions(val);
                // ONLY set if input is still the same and hasn't been cleared by handleSearch
                setAiSuggestions(val.trim() ? res : []);
            } catch (err) {
                console.error("Suggestion fetch failed", err);
                setAiSuggestions([]);
            } finally {
                return;
            }
        }, 200);
    };

    const updateAgentMessage = (sessionId: string, msgId: string, updates: Partial<ChatMessage>) => {
        setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s;
            return {
                ...s,
                messages: s.messages.map(m => m.id === msgId ? { ...m, ...updates } : m)
            };
        }));
    };

    const handleSearch = async (query: string = inputValue) => {
        if (!query.trim() || isSubmitting) return;
        setIsSubmitting(true);
        
        // STOP suggestions immediately on Enter
        if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
        setAiSuggestions([]);
        setInputValue('');
        setShowFilters(false);
        streamRef.current?.close();

        let targetSessionId = currentSessionId;
        
        // Create a new session if we are in 'new' state
        if (targetSessionId === 'new') {
            targetSessionId = Date.now().toString();
            setSessions(prev => [{
                id: targetSessionId,
                title: buildSessionTitle(query),
                messages: [],
                createdAt: Date.now()
            }, ...prev]);
            setCurrentSessionId(targetSessionId);
        }

        const userMsgId = Date.now().toString() + '_user';
        const agentMsgId = Date.now().toString() + '_agent';

        // Add User Message
        setSessions(prev => prev.map(s => {
            if (s.id !== targetSessionId) return s;
            return {
                ...s,
                messages: [...s.messages, { id: userMsgId, role: 'user', content: query }]
            };
        }));

        // Add Agent Initial Message
        setTimeout(() => {
            setSessions(prev => prev.map(s => {
                if (s.id !== targetSessionId) return s;
                return {
                    ...s,
                    messages: [...s.messages, {
                        id: agentMsgId,
                        role: 'agent',
                        content: '',
                        status: 'researching',
                        thought: 'Analyzing your prompt...'
                    }]
                };
            }));
        }, 100);

        try {
            // Context/Memory Implementation: Map existing messages to history (Filter out empty)
            const history: IHistoryMessage[] = messages
                .map(m => ({
                    role: m.role,
                    content: (
                        m.role === 'user'
                            ? m.content
                            : (m.content || m.results?.summary || m.thought)
                    ) || ''
                }))
                .filter(m => m.content.trim().length > 0);

            const data = await submitResearch(query, format, language, outputType, 'basic', history);
            const jobId = data.jobId;

            if (data.status === 'completed' && data.message) {
                updateAgentMessage(targetSessionId, agentMsgId, { 
                    status: 'completed', 
                    thought: data.status,
                    content: data.message,
                    mode: data.mode
                });
                return;
            }

            updateAgentMessage(targetSessionId, agentMsgId, { jobId, mode: data.mode });

            // Open SSE
            const es = createJobStream(jobId);
            streamRef.current = es;

            es.onmessage = (event) => {
                const msg = JSON.parse(event.data) as TStreamEvent;
                if (msg.type === 'status') {
                    updateAgentMessage(targetSessionId, agentMsgId, { 
                        status: msg.status, 
                        thought: msg.thought,
                        isBusinessStrategy: msg.isBusinessStrategy 
                    });
                } else if (msg.type === 'partial_results') {
                    // Append partial results to existing rankedList (heuristically)
                    setSessions(prev => prev.map(s => {
                        if (s.id !== targetSessionId) return s;
                        return {
                            ...s,
                            messages: s.messages.map(m => {
                                if (m.id !== agentMsgId) return m;
                                const existingResults: IResearchResults = m.results || { rankedList: [] };
                                return {
                                    ...m,
                                    results: {
                                        ...existingResults,
                                        rankedList: [...existingResults.rankedList, ...msg.results]
                                    }
                                };
                            })
                        };
                    }));
                } else if (msg.type === 'completed') {
                    updateAgentMessage(targetSessionId, agentMsgId, {
                        status: 'completed',
                        results: msg.results ?? undefined,
                        thought: 'Task completed!',
                        content: resolveCompletedContent(msg.results),
                        mode: msg.results?.contract?.mode
                    });
                    es.close();
                } else if (msg.type === 'failed') {
                    updateAgentMessage(targetSessionId, agentMsgId, { status: 'failed', error: msg.error || 'Failed' });
                    es.close();
                }
            };

            es.onerror = () => {
                updateAgentMessage(targetSessionId, agentMsgId, { status: 'failed', error: 'Connection to agent lost. Please try again.' });
                es.close();
            };

        } catch (err: unknown) {
             updateAgentMessage(targetSessionId, agentMsgId, {
                status: 'failed',
                error: err instanceof Error ? err.message : 'Failed to submit.'
             });
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Render Helpers ────────────────────────────────────────────────────────

    const renderAgentLoader = (status: string | undefined, thought: string | undefined) => {
        let icon = <Loader2 size={16} className="animate-spin text-brand-primary" />;
        if (status === 'completed') icon = <CheckCircle2 size={16} className="text-green-400" />;
        if (status === 'failed') icon = <AlertCircle size={16} className="text-red-400" />;

        return (
            <div className="flex items-center space-x-3 text-sm text-gray-400 bg-gray-800/50 py-2 px-4 rounded-xl w-fit border border-white/5 animate-pulse">
                {icon}
                <span className="font-mono text-xs">{thought || `Agent status: ${status}...`}</span>
            </div>
        );
    };

    const renderResults = (
        results: IResearchResults,
        mode: TAssistantMode | undefined,
        isBusinessStrategy: boolean = false
    ) => {
        if (!results) return null;
        const effectiveMode = mode || results.contract?.mode;

        if (effectiveMode === 'casual_chat') {
            return renderChatReply(results.summary || 'How can I help you today?');
        }

        if (effectiveMode === 'summary') {
            return renderSummaryReply(results);
        }

        if (effectiveMode === 'coding') {
            return renderCodeReply(results.summary || '');
        }

        if (effectiveMode === 'leads') {
            return renderLeadsReply(results);
        }

        if (effectiveMode === 'resources') {
            return renderResourcesReply(results);
        }

        if (
            effectiveMode === 'learning' ||
            effectiveMode === 'knowledge' ||
            effectiveMode === 'comparison' ||
            effectiveMode === 'planning' ||
            effectiveMode === 'scraping'
        ) {
            return renderGuidedReply(results, effectiveMode);
        }
        
        return (
            <div className="space-y-6 mt-4 w-full">
                {/* Summary Box */}
                {results.summary && (
                    <div className="bg-gray-800/40 backdrop-blur-md border border-white/5 rounded-3xl p-8 text-gray-200 leading-relaxed shadow-2xl relative overflow-hidden group">
                        {/* Background subtle glow */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -mr-32 -mt-32 transition-colors group-hover:bg-brand-primary/10" />
                        
                        <div className="flex items-center justify-between mb-6 relative">
                            <div className="flex items-center space-x-3 text-brand-primary">
                                <Sparkles size={22} className="animate-pulse" />
                                <h3 className="font-extrabold text-xl tracking-tight text-white">
                                    {resolveResultsHeading(effectiveMode, isBusinessStrategy)}
                                </h3>
                            </div>
                            {isBusinessStrategy && (
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 bg-brand-primary/20 text-brand-primary border border-brand-primary/30 rounded-full">
                                    Strategic Analysis
                                </span>
                            )}
                        </div>
                        
                        <div className="prose prose-invert max-w-none relative">
                            {results.summary.split('\n').map((line: string, i: number) => {
                                const isHeader = line.includes(':') && line.length < 50 && !line.includes('http');
                                const renderTextWithLinks = (text: string) => {
                                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                                    const parts = text.split(urlRegex);
                                    return parts.map((part, index) => {
                                        if (part.match(urlRegex)) {
                                            return (
                                                <a 
                                                    key={index} 
                                                    href={part} 
                                                    target="_blank" 
                                                    rel="noreferrer" 
                                                    className="underline decoration-brand-primary decoration-2 underline-offset-4 hover:text-brand-primary transition-colors inline-flex items-center gap-1 group/link"
                                                >
                                                    {part.replace(/(^\w+:|^)\/\//, '').split('/')[0]}
                                                    <ExternalLink size={12} className="opacity-50 group-hover/link:opacity-100" />
                                                </a>
                                            );
                                        }
                                        return part;
                                    });
                                };

                                if (isHeader) {
                                    return (
                                        <h4 key={i} className="text-brand-primary font-bold text-sm uppercase tracking-wider mt-6 mb-2 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(var(--brand-primary),0.8)]" />
                                            {line.replace(':', '')}
                                        </h4>
                                    );
                                }
                                if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
                                    return <li key={i} className="text-gray-300 text-[15px] mb-1 list-none flex gap-2 pl-2">
                                        <span className="text-brand-primary opacity-50">•</span>
                                        <span className="flex-1">{renderTextWithLinks(line.replace(/^[-•]\s*/, ''))}</span>
                                    </li>;
                                }
                                if (!line.trim()) return <div key={i} className="h-2" />;
                                return <p key={i} className="text-gray-300 text-[15px] leading-[1.7] mb-3">{renderTextWithLinks(line)}</p>;
                            })}
                        </div>
                    </div>
                )}

                {/* Sources Row */}
                {results.rankedList && results.rankedList.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">Top Sources</h4>
                        <div className="flex overflow-x-auto pb-4 gap-4 snap-x no-scrollbar">
                            {results.rankedList.map((item: IRankedResult, i: number) => (
                                <a
                                    key={i}
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="snap-start min-w-[280px] max-w-[280px] bg-gray-800/50 hover:bg-gray-800 border border-white/5 hover:border-brand-primary/50 rounded-xl p-4 transition-all group flex flex-col h-full cursor-pointer shrink-0"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold text-gray-500 bg-gray-900 px-2 py-1 rounded-md">Source {i+1}</span>
                                        <ExternalLink size={14} className="text-gray-500 group-hover:text-brand-primary transition-colors" />
                                    </div>
                                    <h5 className="font-semibold text-white text-sm line-clamp-2 mb-2 group-hover:text-brand-primary">
                                        {item.title || 'Research Resource'}
                                    </h5>
                                    <p className="text-xs text-gray-400 line-clamp-3 mt-auto">
                                        {item.description || item.url || 'Access direct source documentation for more details.'}
                                    </p>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderLeadsReply = (results: IResearchResults) => (
        <div className="space-y-5 mt-4 w-full">
            <div className="flex items-center gap-3 mb-2">
                <Sparkles size={18} className="text-brand-primary animate-pulse" />
                <h3 className="font-extrabold text-lg text-white tracking-tight">Lead Results</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-brand-primary/20 text-brand-primary border border-brand-primary/30 rounded-full">
                    {results.rankedList.length} Lead{results.rankedList.length !== 1 ? 's' : ''}
                </span>
            </div>
            {results.rankedList.map((lead: IRankedResult, i: number) => (
                <div key={i} className="bg-gray-800/50 border border-white/5 hover:border-brand-primary/30 rounded-2xl p-5 transition-all">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md">#{lead.rank ?? i + 1}</span>
                                {lead.confidenceScore != null && (
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${lead.confidenceScore >= 75 ? 'bg-green-500/15 text-green-400' : lead.confidenceScore >= 50 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'}`}>
                                        {lead.confidenceScore}% confidence
                                    </span>
                                )}
                            </div>
                            <h4 className="font-bold text-white text-base">{lead.title}</h4>
                            {lead.industry && <p className="text-xs text-gray-400 mt-0.5">{lead.industry}{lead.location ? ` · ${lead.location}` : ''}</p>}
                        </div>
                        {lead.url && (
                            <a href={lead.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-primary hover:underline shrink-0">
                                Visit <ExternalLink size={11} />
                            </a>
                        )}
                    </div>

                    {/* Contact row */}
                    <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                        {lead.decisionMakerRole && (
                            <div className="bg-gray-900/60 rounded-lg px-3 py-2">
                                <span className="text-gray-500 block mb-0.5">Decision Maker</span>
                                <span className="text-white font-medium">{lead.decisionMakerRole}</span>
                            </div>
                        )}
                        {lead.email && (
                            <div className="bg-gray-900/60 rounded-lg px-3 py-2">
                                <span className="text-gray-500 block mb-0.5">Email</span>
                                <span className="text-green-400 font-medium break-all">{lead.email}</span>
                            </div>
                        )}
                        {lead.phoneNumber && (
                            <div className="bg-gray-900/60 rounded-lg px-3 py-2">
                                <span className="text-gray-500 block mb-0.5">Phone</span>
                                <span className="text-blue-400 font-medium">{lead.phoneNumber}</span>
                            </div>
                        )}
                        {lead.contactMethod && !lead.email && !lead.phoneNumber && (
                            <div className="bg-gray-900/60 rounded-lg px-3 py-2">
                                <span className="text-gray-500 block mb-0.5">Contact</span>
                                <span className="text-white font-medium">{lead.contactMethod}</span>
                            </div>
                        )}
                        {lead.companySize && (
                            <div className="bg-gray-900/60 rounded-lg px-3 py-2">
                                <span className="text-gray-500 block mb-0.5">Company Size</span>
                                <span className="text-white font-medium">{lead.companySize}</span>
                            </div>
                        )}
                        {lead.estimatedRevenue && (
                            <div className="bg-gray-900/60 rounded-lg px-3 py-2">
                                <span className="text-gray-500 block mb-0.5">Est. Revenue</span>
                                <span className="text-yellow-400 font-medium">{lead.estimatedRevenue}</span>
                            </div>
                        )}
                        {lead.techStack && (
                            <div className="bg-gray-900/60 rounded-lg px-3 py-2 col-span-2">
                                <span className="text-gray-500 block mb-0.5">Tech Stack</span>
                                <span className="text-cyan-400 font-medium">{lead.techStack}</span>
                            </div>
                        )}
                        {lead.linkedinUrl && (
                            <div className="bg-gray-900/60 rounded-lg px-3 py-2 col-span-2">
                                <span className="text-gray-500 block mb-0.5">LinkedIn</span>
                                <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-400 font-medium hover:underline break-all">{lead.linkedinUrl}</a>
                            </div>
                        )}
                    </div>

                    {/* Business intelligence */}
                    <div className="space-y-2 text-sm">
                        {lead.businessGap && (
                            <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-2.5">
                                <span className="text-red-400 text-xs font-semibold uppercase tracking-wider block mb-1">Business Gap</span>
                                <p className="text-gray-300 text-[13px]">{lead.businessGap}</p>
                            </div>
                        )}
                        {lead.whatYouCanSell && (
                            <div className="bg-green-500/5 border border-green-500/10 rounded-xl px-4 py-2.5">
                                <span className="text-green-400 text-xs font-semibold uppercase tracking-wider block mb-1">What to Sell</span>
                                <p className="text-gray-300 text-[13px]">{lead.whatYouCanSell}</p>
                            </div>
                        )}
                        {lead.sellingStrategy && (
                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl px-4 py-2.5">
                                <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider block mb-1">Selling Strategy</span>
                                <p className="text-gray-300 text-[13px]">{lead.sellingStrategy}</p>
                            </div>
                        )}
                        {lead.outreachMessage && (
                            <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl px-4 py-2.5">
                                <span className="text-purple-400 text-xs font-semibold uppercase tracking-wider block mb-1">Outreach Message</span>
                                <p className="text-gray-300 text-[13px] italic">"{lead.outreachMessage}"</p>
                            </div>
                        )}
                        {lead.justification && (
                            <div className="bg-gray-700/30 border border-white/5 rounded-xl px-4 py-2.5">
                                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1">Why This Lead</span>
                                <p className="text-gray-300 text-[13px]">{lead.justification}</p>
                            </div>
                        )}
                        {lead.references && lead.references.length > 0 && (
                            <div className="bg-gray-700/30 border border-white/5 rounded-xl px-4 py-2.5">
                                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1">References</span>
                                <ul className="space-y-1">
                                    {lead.references.map((ref, ri) => (
                                        <li key={ri} className="text-[13px] text-brand-primary/80 hover:text-brand-primary truncate">
                                            <a href={ref} target="_blank" rel="noreferrer">{ref}</a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    const renderResourcesReply = (results: IResearchResults) => (
        <div className="space-y-4 mt-4 w-full">
            {results.summary && (
                <div className="bg-gray-800/40 border border-white/5 rounded-2xl px-5 py-4 text-gray-200 text-[15px] leading-7">
                    {results.summary}
                </div>
            )}
            <div className="flex items-center gap-3 mb-1">
                <List size={16} className="text-brand-primary" />
                <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider">
                    {results.rankedList.length} Resource{results.rankedList.length !== 1 ? 's' : ''}
                </h3>
            </div>
            <div className="space-y-3">
                {results.rankedList.map((item: IRankedResult, i: number) => (
                    <a key={i} href={item.url} target="_blank" rel="noreferrer"
                        className="flex items-start gap-4 bg-gray-800/40 hover:bg-gray-800 border border-white/5 hover:border-brand-primary/30 rounded-xl p-4 transition-all group">
                        <span className="text-brand-primary font-bold text-sm mt-0.5 shrink-0 w-5">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h5 className="font-semibold text-white text-[14px] group-hover:text-brand-primary transition-colors line-clamp-1">{item.title}</h5>
                                {item.resourceType && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-gray-700 text-gray-400 rounded-md shrink-0">{item.resourceType}</span>
                                )}
                            </div>
                            <p className="text-gray-400 text-[13px] line-clamp-2">{item.description || item.reason || ''}</p>
                        </div>
                        <ExternalLink size={14} className="text-gray-500 group-hover:text-brand-primary transition-colors shrink-0 mt-1" />
                    </a>
                ))}
            </div>
        </div>
    );

    const renderChatReply = (content: string) => (
        <div className="max-w-2xl rounded-3xl border border-white/8 bg-gray-800/60 px-5 py-4 text-[15px] leading-7 text-gray-100 shadow-xl">
            {content}
        </div>
    );

    const renderSummaryReply = (results: IResearchResults) => {
        const bullets = results.keyPoints?.length
            ? results.keyPoints
            : (results.summary || '')
                  .split('\n')
                  .map((line) => line.replace(/^[-•]\s*/, '').trim())
                  .filter(Boolean)
                  .slice(0, 7);

        return (
            <div className="max-w-2xl rounded-3xl border border-white/8 bg-gray-800/50 px-5 py-5 shadow-xl">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Short Summary</h3>
                <ul className="space-y-2 text-sm leading-6 text-gray-200">
                    {bullets.map((point, index) => (
                        <li key={`${point}-${index}`} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-primary" />
                            <span>{point}</span>
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    const renderCodeReply = (content: string) => (
        <div className="max-w-3xl overflow-hidden rounded-3xl border border-white/8 bg-[#11131A] shadow-xl">
            <div className="border-b border-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Coding Response
            </div>
            <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-gray-200 whitespace-pre-wrap">{content}</pre>
        </div>
    );

    const renderGuidedReply = (results: IResearchResults, mode: TAssistantMode) => {
        const lines = (results.summary || '').split('\n');
        return (
            <div className="max-w-3xl space-y-4">
                {/* Explanation / Summary */}
                <div className="rounded-3xl border border-white/8 bg-gray-800/50 px-6 py-5 shadow-xl">
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-primary flex items-center gap-2">
                        <Sparkles size={13} className="opacity-80" />
                        {resolveResultsHeading(mode, false)}
                    </h3>
                    <div className="space-y-2 text-[15px] leading-7 text-gray-200">
                        {lines.filter(Boolean).map((line, i) => {
                            // Markdown-style bold headers: **text** or lines ending with :
                            const isHeader = /^#{1,3}\s/.test(line) || (line.endsWith(':') && line.length < 60 && !line.startsWith('-'));
                            const isBullet = /^[-•*]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim());
                            const clean = line.replace(/^#{1,3}\s/, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '');
                            if (isHeader) return (
                                <h4 key={i} className="font-bold text-white text-sm uppercase tracking-wide mt-4 mb-1 border-b border-white/5 pb-1">{clean}</h4>
                            );
                            if (isBullet) return (
                                <div key={i} className="flex gap-2 pl-1">
                                    <span className="text-brand-primary mt-2 shrink-0">•</span>
                                    <span className="flex-1">{clean}</span>
                                </div>
                            );
                            return <p key={i} className="text-gray-200">{line}</p>;
                        })}
                    </div>
                </div>

                {/* Source cards — shown for all guided modes when sources exist */}
                {results.rankedList && results.rankedList.length > 0 && (
                    <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
                            Sources ({results.rankedList.length})
                        </h4>
                        <div className="flex overflow-x-auto pb-3 gap-3 snap-x no-scrollbar">
                            {results.rankedList.map((item: IRankedResult, i: number) => (
                                <a key={i} href={item.url} target="_blank" rel="noreferrer"
                                    className="snap-start min-w-[240px] max-w-[240px] bg-gray-800/40 hover:bg-gray-800 border border-white/5 hover:border-brand-primary/40 rounded-xl p-3.5 transition-all group flex flex-col shrink-0 cursor-pointer">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-bold text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded">
                                            {item.sourceType || `Source ${i + 1}`}
                                        </span>
                                        <ExternalLink size={12} className="text-gray-600 group-hover:text-brand-primary transition-colors" />
                                    </div>
                                    <h5 className="font-semibold text-white text-xs line-clamp-2 mb-1.5 group-hover:text-brand-primary transition-colors">
                                        {item.title || 'Resource'}
                                    </h5>
                                    <p className="text-[11px] text-gray-500 line-clamp-2 mt-auto">
                                        {item.reason || item.description || item.url}
                                    </p>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const shouldRenderPlainChat = (message: ChatMessage): boolean =>
        Boolean(
            message.role === 'agent' &&
            message.status === 'completed' &&
            message.content &&
            (
                message.mode === 'casual_chat' ||
                (!message.results?.rankedList?.length && !message.results?.contract)
            )
        );

    const resolveResultsHeading = (
        mode: TAssistantMode | undefined,
        isBusinessStrategy: boolean
    ): string => {
        if (isBusinessStrategy || mode === 'business_strategy') return 'Strategic Intelligence';
        switch (mode) {
            case 'learning':
                return 'Learning Guide';
            case 'knowledge':
                return 'Quick Answer';
            case 'resources':
                return 'Resource Pack';
            case 'leads':
                return 'Lead Results';
            case 'scraping':
                return 'Extraction Plan';
            case 'coding':
                return 'Coding Response';
            case 'comparison':
                return 'Comparison';
            case 'planning':
                return 'Action Plan';
            case 'summary':
                return 'Short Summary';
            case 'research':
            default:
                return 'Executive Summary';
        }
    };

    return (
        <div className="flex h-screen bg-[#0F1117] text-white font-sans overflow-hidden select-none" suppressHydrationWarning>
            
            {/* ── Sidebar ──────────────────────────────────────────────────────── */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.aside
                        initial={{ x: -260 }}
                        animate={{ x: 0 }}
                        exit={{ x: -260 }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                        className="w-[260px] bg-[#171923] border-r border-white/5 flex flex-col h-full flex-shrink-0 z-20 absolute md:relative"
                    >
                        <div className="p-4 flex items-center justify-between">
                            <button
                                onClick={createNewSession}
                                className="flex-1 flex items-center space-x-2 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary px-4 py-2.5 rounded-xl transition-colors font-medium border border-brand-primary/20"
                            >
                                <Plus size={18} />
                                <span>New Research</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                            {sessions.length === 0 ? (
                                <div className="text-center text-gray-500 text-sm mt-10 px-4">
                                    No history yet. Start researching!
                                </div>
                            ) : (
                                sessions.map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => setCurrentSessionId(s.id)}
                                        className={`group flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                                            currentSessionId === s.id ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50 text-gray-400'
                                        }`}
                                    >
                                        <div className="flex items-center space-x-3 overflow-hidden">
                                            <MessageSquare size={16} className="flex-shrink-0" />
                                            <span className="text-sm truncate w-36">{s.title}</span>
                                        </div>
                                        <button 
                                            onClick={(e) => deleteSession(e, s.id)}
                                            className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Branding Bottom */}
                        <div className="p-4 border-t border-white/5 flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center">
                                <Play size={14} fill="white" className="ml-0.5" />
                            </div>
                            <div>
                                <h1 className="font-bold text-sm">AgentFlow AI</h1>
                                <p className="text-xs text-gray-500">Autonomous Squad</p>
                            </div>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* ── Main Chat Area ───────────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col h-full relative" suppressHydrationWarning>
                
                {/* Topbar for Mobile Toggle */}
                <div className="h-14 flex items-center px-4 border-b border-white/5 md:hidden shrink-0">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-400 hover:text-white rounded-md">
                        <Menu size={24} />
                    </button>
                    <span className="ml-2 font-bold tracking-tight">AgentFlow AI</span>
                </div>

                {/* Chat Feed */}
                <div className="flex-1 overflow-y-auto w-full">
                    {messages.length === 0 ? (
                        // Empty State / Welcome Screen
                        <div className="h-full flex flex-col items-center justify-center px-6 max-w-3xl mx-auto text-center mt-[-5vh]">
                            <div className="w-16 h-16 rounded-2xl brand-gradient flex items-center justify-center mb-6 shadow-2xl shadow-brand-primary/20">
                                <Sparkles size={32} className="text-white" />
                            </div>
                            <h2 className="text-3xl font-bold mb-3">How can I help you research today?</h2>
                            <p className="text-gray-400 text-sm mb-12">Ask anything, and our autonomous multi-agent squad will surf the web, scrape sources, and compile a final summary for you.</p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                                {SUGGESTIONS_PLACEHOLDER.map((sug, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => handleSearch(sug)}
                                        className="text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 border border-white/5 hover:border-brand-primary/40 rounded-xl transition-all text-sm text-gray-300"
                                    >
                                        <Search size={14} className="inline mr-2 text-brand-primary opacity-70" />
                                        {sug}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // Chat List
                        <div className="w-full relative pb-6 pb-32">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`w-full py-8 px-4 ${msg.role === 'agent' ? 'bg-[#13151A]' : ''}`}>
                                    <div className="max-w-3xl mx-auto flex gap-4 md:gap-6">
                                        {/* Avatar */}
                                        <div className="flex-shrink-0 mt-1">
                                            {msg.role === 'user' ? (
                                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-xs text-white">U</div>
                                            ) : (
                                                <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center shadow-lg shadow-brand-primary/20">
                                                    <Play size={12} fill="white" className="ml-0.5" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 overflow-hidden">
                                            {msg.role === 'user' ? (
                                                <div className="text-gray-100 text-lg leading-snug">{msg.content}</div>
                                            ) : (
                                                <div className="flex flex-col space-y-3">
                                                    {msg.status && msg.status !== 'completed' && renderAgentLoader(msg.status, msg.thought)}
                                                    
                                                    {msg.error && (
                                                        <div className="text-red-400 bg-red-400/10 p-4 rounded-xl text-sm border border-red-500/20">
                                                            ⚠️ {msg.error}
                                                        </div>
                                                    )}

                                                    {shouldRenderPlainChat(msg) && renderChatReply(msg.content)}

                                                    {(msg.results?.summary || (msg.results?.rankedList?.length ?? 0) > 0) &&
                                                        msg.results &&
                                                        !shouldRenderPlainChat(msg) &&
                                                        renderResults(msg.results, msg.mode, msg.isBusinessStrategy)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Input Area (Fixed Bottom) */}
                <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-[#0F1117] via-[#0F1117] to-transparent pt-10 pb-6 px-4">
                    <div className="max-w-3xl mx-auto relative">
                        
                        {/* Auto-suggest dropdown */}
                        <AnimatePresence>
                            {(aiSuggestions.length > 0 && inputValue.trim().length > 0) && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute bottom-full left-0 w-full mb-3 bg-gray-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 overflow-y-auto max-h-60"
                                >
                                    {aiSuggestions.map((sug, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => {
                                                handleSearch(sug);
                                                setAiSuggestions([]);
                                            }}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border-b border-white/5 last:border-0 flex items-center gap-3"
                                        >
                                            <Search size={14} className="text-brand-primary shrink-0"/>
                                            <span className="truncate">{sug}</span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Filters Dropdown (Toggle) */}
                        <AnimatePresence>
                            {showFilters && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden bg-gray-900 border border-white/10 rounded-2xl mb-3 shadow-xl p-4 z-40 relative"
                                >
                                    <div className="flex flex-wrap gap-x-6 gap-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Format</label>
                                            <div className="flex flex-wrap gap-2">
                                                {FORMAT_OPTIONS.map(opt => (
                                                    <button key={opt.value} onClick={() => setFormat(format === opt.value ? null : opt.value)}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${format === opt.value ? 'bg-brand-primary/20 border-brand-primary text-brand-primary' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                                        {opt.icon}{opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Language</label>
                                            <div className="flex flex-wrap gap-2">
                                                {LANGUAGE_OPTIONS.map(opt => (
                                                    <button key={opt.value} onClick={() => setLanguage(language === opt.value ? null : opt.value)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${language === opt.value ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Output</label>
                                            <div className="flex flex-wrap gap-2">
                                                <button onClick={() => setOutputType(outputType === 'summary' ? null : 'summary')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${outputType === 'summary' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                                    <AlignLeft size={13}/> Summary
                                                </button>
                                                <button onClick={() => setOutputType(outputType === 'list' ? null : 'list')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${outputType === 'list' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                                    <List size={13}/> List
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Search Input Box */}
                        <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="relative bg-gray-800 rounded-3xl border border-white/10 shadow-2xl flex flex-col focus-within:ring-2 focus-within:ring-brand-primary/50 transition-all z-40">
                            
                            <textarea
                                value={inputValue}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSearch();
                                    }
                                }}
                                placeholder="Message AgentFlow AI..."
                                className="w-full bg-transparent px-6 py-4 text-sm text-white focus:outline-none resize-none no-scrollbar h-[56px] max-h-40"
                                rows={1}
                            />
                            
                            <div className="flex justify-between items-center px-4 pb-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${showFilters || format || language || outputType ? 'text-brand-primary bg-brand-primary/10' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                >
                                    <Sparkles size={14} />
                                    <span>Filters</span>
                                    <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                                </button>

                                <button
                                    type="submit"
                                    disabled={!inputValue.trim() || isSubmitting}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${inputValue.trim() && !isSubmitting ? 'bg-white text-black hover:bg-gray-200 shadow-md transform hover:scale-105' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                </button>
                            </div>
                        </form>
                        
                        <div className="text-center mt-3 text-[10px] text-gray-500">
                            AgentFlow AI can make mistakes. Consider verifying important information.
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}

function normalizeSessions(input: ChatSession[]): ChatSession[] {
    const seen = new Set<string>();

    return [...input]
        .filter((session) => {
            if (!session || typeof session.id !== 'string' || seen.has(session.id)) {
                return false;
            }
            seen.add(session.id);
            return true;
        })
        .map((session) => ({
            ...session,
            title: buildSessionTitle(
                session.title || session.messages.find((message) => message.role === 'user')?.content || 'New chat'
            ),
            messages: session.messages || [],
        }))
        .sort((left, right) => right.createdAt - left.createdAt);
}

function buildSessionTitle(query: string): string {
    const trimmed = query.trim().replace(/\s+/g, ' ');
    if (!trimmed) return 'New chat';
    return trimmed.length > 30 ? `${trimmed.substring(0, 30)}...` : trimmed;
}

function resolveCompletedContent(results: IResearchResults | null | undefined): string {
    if (!results) return '';
    if (results.contract?.mode === 'casual_chat') {
        return results.summary || '';
    }
    return '';
}

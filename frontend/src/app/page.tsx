'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { submitResearch, createJobStream, getSuggestions, type TResearchFormat, type TOutputType } from '@/lib/api';
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
    results?: any; // the actual research results
    error?: string;
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
];

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
    const [isTyping, setIsTyping] = useState(false);

    // Filters
    const [format, setFormat] = useState<TResearchFormat | null>(null);
    const [language, setLanguage] = useState<string | null>(null);
    const [outputType, setOutputType] = useState<TOutputType | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    const streamRef = useRef<EventSource | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const suggestTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Initial Load & Mount
    useEffect(() => {
        setIsMounted(true);
        const saved = localStorage.getItem('agentflow_sessions');
        if (saved) {
            try {
                setSessions(JSON.parse(saved));
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
        if (isMounted && sessions.length > 0) {
            localStorage.setItem('agentflow_sessions', JSON.stringify(sessions));
        }
    }, [sessions, isMounted]);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const currentSession = sessions.find(s => s.id === currentSessionId);
    const messages = currentSession?.messages || [];

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
                setIsTyping(true);
                const res = await getSuggestions(val);
                setAiSuggestions(res);
            } catch (err) {
                console.error("Suggestion fetch failed", err);
                setAiSuggestions([]);
            } finally {
                setIsTyping(false);
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
        if (!query.trim()) return;
        
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
                title: query.length > 30 ? query.substring(0, 30) + '...' : query,
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
            const data = await submitResearch(query, format, language, outputType);
            const jobId = data.jobId;
            updateAgentMessage(targetSessionId, agentMsgId, { jobId });

            // Open SSE
            const es = createJobStream(jobId);
            streamRef.current = es;

            es.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'status') {
                    updateAgentMessage(targetSessionId, agentMsgId, { status: msg.status, thought: msg.thought });
                } else if (msg.type === 'partial_results') {
                    // Append partial results to existing rankedList (heuristically)
                    setSessions(prev => prev.map(s => {
                        if (s.id !== targetSessionId) return s;
                        return {
                            ...s,
                            messages: s.messages.map(m => {
                                if (m.id !== agentMsgId) return m;
                                const existingResults = m.results || { rankedList: [] };
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
                    updateAgentMessage(targetSessionId, agentMsgId, { status: 'completed', results: msg.results, thought: 'Task completed!' });
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

        } catch (err: any) {
             updateAgentMessage(targetSessionId, agentMsgId, { status: 'failed', error: err.message || 'Failed to submit.' });
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

    const renderResults = (results: any) => {
        if (!results) return null;
        
        return (
            <div className="space-y-6 mt-4 w-full">
                {/* Summary Box */}
                {results.summary && (
                    <div className="bg-gray-800/80 border border-white/10 rounded-2xl p-6 text-gray-200 leading-relaxed shadow-xl">
                        <div className="flex items-center space-x-2 text-brand-primary mb-3">
                            <Sparkles size={18} />
                            <h3 className="font-bold text-lg text-white">Executive Summary</h3>
                        </div>
                        <div className="prose prose-invert max-w-none text-sm text-gray-300">
                            {results.summary.split('\n').map((para: string, i: number) => (
                                <p key={i} className="mb-2">{para}</p>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sources Row */}
                {results.rankedList && results.rankedList.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">Top Sources</h4>
                        <div className="flex overflow-x-auto pb-4 gap-4 snap-x no-scrollbar">
                            {results.rankedList.map((item: any, i: number) => (
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
                                    <h5 className="font-semibold text-white text-sm line-clamp-2 mb-2 group-hover:text-brand-primary">{item.title}</h5>
                                    <p className="text-xs text-gray-400 line-clamp-3 mt-auto">{item.description}</p>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
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
                                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-xs">U</div>
                                            ) : (
                                                <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center shadow-lg shadow-brand-primary/20">
                                                    <Play size={12} fill="white" className="ml-0.5" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 overflow-hidden">
                                            {msg.role === 'user' ? (
                                                <div className="text-gray-100 text-lg">{msg.content}</div>
                                            ) : (
                                                <div className="flex flex-col space-y-3">
                                                    {msg.status && msg.status !== 'completed' && renderAgentLoader(msg.status, msg.thought)}
                                                    
                                                    {msg.error && (
                                                        <div className="text-red-400 bg-red-400/10 p-4 rounded-xl text-sm border border-red-500/20">
                                                            ⚠️ {msg.error}
                                                        </div>
                                                    )}

                                                    {(msg.results?.rankedList?.length > 0) && renderResults(msg.results)}
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
                            {aiSuggestions.length > 0 && (
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
                                                    <button key={opt.value} onClick={() => setFormat(format === opt.value ? null : opt.value as any)}
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
                                    disabled={!inputValue.trim()}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${inputValue.trim() ? 'bg-white text-black hover:bg-gray-200 shadow-md transform hover:scale-105' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                                >
                                    <Send size={14} />
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

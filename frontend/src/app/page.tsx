'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchStore } from '@/store/useSearchStore';
import { submitResearch, createJobStream, type TResearchFormat, type TOutputType } from '@/lib/api';
import {
    Search, Loader2, Play, CheckCircle2, AlertCircle,
    FileText, Video, ShoppingBag, Newspaper, ExternalLink,
    List, AlignLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Filter option definitions ─────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: TResearchFormat; label: string; icon: React.ReactNode }[] = [
    { value: 'articles',  label: 'Articles',  icon: <FileText    size={13} /> },
    { value: 'videos',    label: 'Videos',    icon: <Video       size={13} /> },
    { value: 'news',      label: 'News',      icon: <Newspaper   size={13} /> },
    { value: 'products',  label: 'Products',  icon: <ShoppingBag size={13} /> },
];

const LANGUAGE_OPTIONS = [
    { value: 'English', label: 'English' },
    { value: 'Urdu',    label: 'اردو'    },
    { value: 'Hindi',   label: 'हिंदी'   },
];

const OUTPUT_OPTIONS: { value: TOutputType; label: string; icon: React.ReactNode }[] = [
    { value: 'list',    label: 'List',    icon: <List      size={13} /> },
    { value: 'summary', label: 'Summary', icon: <AlignLeft size={13} /> },
];

// ── Pill component ────────────────────────────────────────────────────────────

function Pill({
    active,
    invalid,
    onClick,
    children,
}: {
    active:   boolean;
    invalid?: boolean;
    onClick:  () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none
                ${active
                    ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/30'
                    : invalid
                    ? 'text-red-400 ring-1 ring-red-500/50 hover:text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
        >
            {children}
        </button>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
    const {
        jobId, status, topic, thought, results, errorMessage,
        setJob, setStatus, setResults, setError, reset,
    } = useSearchStore();

    const [inputValue, setInputValue] = useState('');

    // Filters start as null — user MUST explicitly choose each one.
    // null triggers the clarification UI instead of sending the request.
    const [format,     setFormat]     = useState<TResearchFormat | null>(null);
    const [language,   setLanguage]   = useState<string | null>(null);
    const [outputType, setOutputType] = useState<TOutputType | null>(null);

    // Tracks which fields the user tried to submit without selecting
    const [showClarification, setShowClarification] = useState(false);

    const streamRef = useRef<EventSource | null>(null);

    useEffect(() => () => streamRef.current?.close(), []);

    const closeStream = () => {
        streamRef.current?.close();
        streamRef.current = null;
    };

    const handleReset = () => {
        closeStream();
        reset();
        setInputValue('');
        setFormat(null);
        setLanguage(null);
        setOutputType(null);
        setShowClarification(false);
    };

    const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        // ── Clarification gate removed ──────────
        // The agent is now autonomous and will detect format/language/outputType
        // from the prompt itself.
        setShowClarification(false);
        // ─────────────────────────────────────────

        try {
            const data = await submitResearch(inputValue, format, language, outputType);

            if (data?.status === 'clarification_needed') {
                // Backend returned clarification (should not happen if frontend
                // gate passed, but handle gracefully)
                setShowClarification(true);
                return;
            }

            setJob(data.jobId, inputValue);

            // Open SSE — real-time agent status, no polling
            const es = createJobStream(data.jobId);
            streamRef.current = es;

            es.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'status') {
                    setStatus(msg.status, msg.thought);
                } else if (msg.type === 'completed') {
                    setResults(msg.results);
                    closeStream();
                } else if (msg.type === 'failed') {
                    setError(msg.error || 'Research failed');
                    closeStream();
                }
            };

            es.onerror = () => {
                setError('Connection to agent lost. Please try again.');
                closeStream();
            };
        } catch (err: any) {
            setError(err.message || 'Failed to start research');
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden flex flex-col items-center" suppressHydrationWarning>
            <div className="absolute top-[-10%] right-[-10%] w-125 h-125 bg-brand-primary/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-10%] w-125 h-125 bg-brand-secondary/10 rounded-full blur-[120px] pointer-events-none" />

            {/* Header */}
            <header className="w-full max-w-6xl px-6 py-8 flex justify-between items-center z-10">
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center">
                        <Play size={16} fill="white" className="ml-0.5" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">AgentFlow AI</span>
                </div>
                {status !== 'idle' && (
                    <button onClick={handleReset} className="text-sm text-gray-400 hover:text-white transition-colors">
                        New Research
                    </button>
                )}
            </header>

            <main className="flex-1 w-full max-w-4xl px-4 flex flex-col items-center pt-16 z-10">
                <AnimatePresence mode="wait">

                    {/* ── IDLE: search form ──────────────────────────────────── */}
                    {status === 'idle' && (
                        <motion.div
                            key="idle"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="text-center space-y-6 w-full"
                        >
                            <h1 className="text-6xl font-extrabold tracking-tight sm:text-7xl leading-tight">
                                Research anything, <br />
                                <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-indigo-500">
                                    at light speed.
                                </span>
                            </h1>
                            <p className="text-gray-400 text-lg max-w-xl mx-auto">
                                3 specialised agents browse, scrape, and critique the internet
                                to surface the highest quality information.
                            </p>

                            {/* ── Filter row ──────────────────────────────────── */}
                            <div className="flex flex-wrap justify-center gap-3 pt-2">

                                {/* Content type */}
                                <FilterGroup label="Content Type" missing={showClarification && !format}>
                                    {FORMAT_OPTIONS.map((opt) => (
                                        <Pill
                                            key={opt.value}
                                            active={format === opt.value}
                                            invalid={showClarification && !format}
                                            onClick={() => { setFormat(opt.value); setShowClarification(false); }}
                                        >
                                            {opt.icon}{opt.label}
                                        </Pill>
                                    ))}
                                </FilterGroup>

                                {/* Language */}
                                <FilterGroup label="Language" missing={showClarification && !language}>
                                    {LANGUAGE_OPTIONS.map((opt) => (
                                        <Pill
                                            key={opt.value}
                                            active={language === opt.value}
                                            invalid={showClarification && !language}
                                            onClick={() => { setLanguage(opt.value); setShowClarification(false); }}
                                        >
                                            {opt.label}
                                        </Pill>
                                    ))}
                                </FilterGroup>

                                {/* Output type */}
                                <FilterGroup label="Output" missing={showClarification && !outputType}>
                                    {OUTPUT_OPTIONS.map((opt) => (
                                        <Pill
                                            key={opt.value}
                                            active={outputType === opt.value}
                                            invalid={showClarification && !outputType}
                                            onClick={() => { setOutputType(opt.value); setShowClarification(false); }}
                                        >
                                            {opt.icon}{opt.label}
                                        </Pill>
                                    ))}
                                </FilterGroup>
                            </div>

                            {/* Clarification message */}
                            <AnimatePresence>
                                {showClarification && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="text-sm text-red-400 font-medium"
                                    >
                                        ❓ Please select{' '}
                                        {[
                                            !format     && 'Content Type',
                                            !language   && 'Language',
                                            !outputType && 'Output type',
                                        ]
                                            .filter(Boolean)
                                            .join(', ')}{' '}
                                        before searching.
                                    </motion.p>
                                )}
                            </AnimatePresence>

                            {/* Search bar */}
                            <form onSubmit={handleSearch} className="relative mt-2 max-w-2xl mx-auto">
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-brand-primary/20 rounded-2xl blur-xl transition-all group-hover:bg-brand-primary/30" />
                                    <input
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        placeholder="What do you want to research today?"
                                        className="relative w-full glass-card px-6 py-5 text-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all bg-gray-900/50"
                                    />
                                    <button
                                        type="submit"
                                        className="absolute right-3 top-3 bottom-3 px-6 brand-gradient rounded-xl font-semibold flex items-center space-x-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-brand-primary/20"
                                    >
                                        <Search size={18} />
                                        <span>Start</span>
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    )}

                    {/* ── PROCESSING / RESULTS ───────────────────────────────── */}
                    {status !== 'idle' && (
                        <motion.div
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full space-y-10"
                        >
                            <div className="text-center">
                                <span className="text-xs font-bold text-brand-primary uppercase tracking-widest">
                                    Ongoing Research
                                </span>
                                <h2 className="text-3xl font-bold mt-2">{topic}</h2>
                                {thought && (
                                    <p className="text-sm text-brand-primary mt-3 italic max-w-2xl mx-auto">
                                        " {thought} "
                                    </p>
                                )}
                                {(format || language || outputType) && (
                                    <p className="text-xs text-gray-500 mt-2 capitalize font-mono">
                                        {format || 'Auto'} · {language || 'Auto'} · {outputType || 'Auto'}
                                    </p>
                                )}
                            </div>

                            {/* Agent progress cards */}
                            <div className="grid grid-cols-3 gap-4">
                                <StatusCard
                                    label="Researcher"
                                    active={['pending', 'researching'].includes(status)}
                                    done={!['idle', 'pending', 'researching'].includes(status)}
                                />
                                <StatusCard
                                    label="Crawler"
                                    active={status === 'crawling'}
                                    done={['critiquing', 'completed'].includes(status)}
                                />
                                <StatusCard
                                    label="Critic"
                                    active={status === 'critiquing'}
                                    done={status === 'completed'}
                                />
                            </div>

                            {/* Error */}
                            {status === 'failed' && (
                                <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5 flex items-center space-x-4 text-red-400">
                                    <AlertCircle size={24} />
                                    <div>
                                        <p className="font-bold">Research failed</p>
                                        <p className="text-sm opacity-80">
                                            {errorMessage || '❌ No exact results found. Please refine your query.'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* ── Results: conditional on outputType ─────────── */}
                            {results && (
                                <motion.div
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-8 pb-20"
                                >
                                    {outputType === 'summary'
                                        ? <SummaryView results={results} />
                                        : <ListView    results={results} />
                                    }
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                </AnimatePresence>
            </main>
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterGroup({
    label,
    missing,
    children,
}: {
    label:    string;
    missing?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center gap-1">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${missing ? 'text-red-400' : 'text-gray-600'}`}>
                {label}
            </span>
            <div className={`flex items-center gap-1 p-1 rounded-xl border transition-colors
                ${missing ? 'bg-red-500/5 border-red-500/30' : 'bg-gray-900/60 border-white/5'}`}>
                {children}
            </div>
        </div>
    );
}

/** List view — top 5 ranked cards with title, link, description */
function ListView({ results }: { results: any }) {
    const top5 = (results.rankedList || []).slice(0, 5);

    return (
        <div className="space-y-4">
            <SummaryBar summary={results.summary} />
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Top {top5.length} Results
            </h3>
            <div className="grid gap-3">
                {top5.map((item: any, idx: number) => (
                    <a
                        key={idx}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="glass-card p-5 flex flex-col gap-2 group hover:border-brand-primary/50 transition-all"
                    >
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">
                                    #{item.rank}
                                </span>
                                <span className="text-xs text-gray-500 font-mono uppercase">
                                    {item.sourceType}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-600">
                                <span className="text-xs">Score: {item.score}</span>
                                <ExternalLink size={12} className="group-hover:text-brand-primary transition-colors" />
                            </div>
                        </div>
                        <h4 className="font-bold text-base group-hover:text-brand-primary transition-colors leading-snug">
                            {item.title}
                        </h4>
                        <p className="text-gray-400 text-sm line-clamp-2">{item.description}</p>
                        {item.reason && (
                            <p className="text-xs text-gray-600">
                                <span className="text-brand-primary font-medium">Why: </span>
                                {item.reason}
                            </p>
                        )}
                    </a>
                ))}
            </div>
        </div>
    );
}

/** Summary view — clean explanation + key points bullets */
function SummaryView({ results }: { results: any }) {
    const keyPoints: string[] = results.keyPoints || [];
    const bestResult          = results.bestResult;

    return (
        <div className="space-y-6">
            {/* Main summary */}
            <div className="glass-card p-8">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                        AI Summary
                    </span>
                </div>
                <p className="text-xl leading-relaxed text-gray-100 italic font-serif">
                    "{results.summary}"
                </p>
            </div>

            {/* Key points */}
            {keyPoints.length > 0 && (
                <div className="glass-card p-6 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                        Key Insights
                    </h3>
                    <ul className="space-y-2">
                        {keyPoints.map((point, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
                                {point}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Best result highlight */}
            {bestResult && (
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                        Best Source
                    </h3>
                    <a
                        href={bestResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="glass-card p-6 flex flex-col gap-2 group hover:border-brand-primary/50 transition-all"
                    >
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-mono text-brand-primary uppercase bg-brand-primary/10 px-2 py-0.5 rounded">
                                {bestResult.sourceType}
                            </span>
                            <ExternalLink size={14} className="text-gray-600 group-hover:text-brand-primary transition-colors" />
                        </div>
                        <h4 className="font-bold text-lg group-hover:text-brand-primary transition-colors">
                            {bestResult.title}
                        </h4>
                        <p className="text-sm text-gray-400">{bestResult.description}</p>
                    </a>
                </div>
            )}
        </div>
    );
}

/** Compact one-line summary bar shown above the list view */
function SummaryBar({ summary }: { summary: string }) {
    if (!summary) return null;
    return (
        <div className="px-4 py-3 rounded-xl bg-brand-primary/5 border border-brand-primary/10 text-sm text-gray-300 italic">
            {summary}
        </div>
    );
}

function StatusCard({ label, active, done }: { label: string; active: boolean; done: boolean }) {
    return (
        <div className={`p-5 rounded-2xl glass-card transition-all
            ${active ? 'ring-2 ring-brand-primary bg-brand-primary/5' : ''}
            ${done   ? 'ring-1 ring-green-500/20 bg-green-500/5'      : ''}`}
        >
            <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold tracking-widest uppercase
                    ${active ? 'text-brand-primary' : done ? 'text-green-500' : 'text-gray-600'}`}>
                    {label}
                </span>
                {active && <Loader2     size={15} className="animate-spin text-brand-primary" />}
                {done   && <CheckCircle2 size={15} className="text-green-500" />}
            </div>
            <div className="h-1 w-full rounded-full bg-gray-800 overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: active ? '65%' : done ? '100%' : '0%' }}
                    transition={{ duration: active ? 1.2 : 0.3, ease: 'easeInOut' }}
                    className={`h-full ${done ? 'bg-green-500' : 'bg-brand-primary'}`}
                />
            </div>
        </div>
    );
}

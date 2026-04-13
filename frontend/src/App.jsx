import SearchBar    from './components/SearchBar';
import AgentStatus  from './components/AgentStatus';
import ResultsPanel from './components/ResultsPanel';
import { useSearch } from './hooks/useSearch';

const LOADING_STATES = ['pending', 'researching', 'crawling', 'critiquing'];

export default function App() {
  const { search, status, query, results, errorMessage, reset } = useSearch();
  const isLoading = LOADING_STATES.includes(status);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="border-b border-gray-800/60 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-sm">⚡</span>
            </div>
            <span className="font-bold text-lg tracking-tight">AgentFlow AI</span>
            <span className="text-xs text-gray-600 border border-gray-700 px-2 py-0.5 rounded-full">
              v1.0
            </span>
          </div>
          {status !== 'idle' && (
            <button
              onClick={reset}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
              New search
            </button>
          )}
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 pb-20">
        {/* Hero */}
        {status === 'idle' && (
          <div className="text-center mb-10 animate-fade-in">
            <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Research anything with AI
            </h1>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              3 specialised agents work in sequence — Researcher, Crawler, Critic —
              to find and rank the best content for you.
            </p>
          </div>
        )}

        {/* Search bar */}
        <SearchBar onSearch={search} isLoading={isLoading} />

        {/* Pipeline status */}
        {status !== 'idle' && <AgentStatus status={status} />}

        {/* Error */}
        {status === 'failed' && (
          <div className="mt-6 text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4 animate-fade-in max-w-2xl mx-auto">
            <p className="font-medium">Search failed</p>
            <p className="text-sm mt-1 text-red-400/70">{errorMessage}</p>
          </div>
        )}

        {/* Results */}
        <ResultsPanel results={results} query={query} />
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-800/60 bg-gray-950/90 backdrop-blur-sm px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-gray-600">
          <span>Powered by Claude + BullMQ + Fastify</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-brand-500 animate-pulse' : status === 'completed' ? 'bg-green-500' : 'bg-gray-600'}`} />
              {isLoading ? 'Processing' : status === 'completed' ? 'Done' : 'Ready'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

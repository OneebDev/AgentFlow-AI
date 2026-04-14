import { useState } from 'react';

const EXAMPLES = [
  'Best way to learn React in 2025',
  'Latest AI news this week',
  'How to build a REST API with Node.js',
  'Top JavaScript frameworks for production',
];

export default function SearchBar({ onSearch, isLoading }) {
  const [input, setInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) onSearch(input.trim());
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-2xl p-2 shadow-lg focus-within:border-brand-500 transition-colors">
          {/* Search icon */}
          <div className="pl-2 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>

          <input
            className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-base outline-none py-2 px-1"
            type="text"
            placeholder="Ask anything… AgentFlow will research it for you"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            autoFocus
          />

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="shrink-0 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            {isLoading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {/* Example queries */}
      <div className="mt-3 flex flex-wrap gap-2 justify-center">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setInput(ex); if (!isLoading) onSearch(ex); }}
            className="text-xs text-gray-500 hover:text-gray-300 bg-gray-800/60 hover:bg-gray-800 px-3 py-1.5 rounded-full border border-gray-700/50 transition-all"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

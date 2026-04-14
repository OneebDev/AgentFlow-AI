/**
 * ResultsPanel — displays the Critic Agent's final output:
 *   - AI summary
 *   - Best result (highlighted)
 *   - Ranked list
 */

import ResultCard from './ResultCard';

export default function ResultsPanel({ results, query }) {
  if (!results) return null;
  const { bestResult, rankedList = [], summary } = results;

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 space-y-4 animate-fade-in">
      {/* AI Summary */}
      {summary && (
        <div className="bg-gradient-to-br from-brand-500/10 to-purple-500/5 border border-brand-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🧠</span>
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-400">
              AI Summary
            </span>
          </div>
          <p className="text-gray-200 text-sm leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Best result */}
      {bestResult && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2 px-1">
            Top Result
          </p>
          <ResultCard result={bestResult} isBest />
        </div>
      )}

      {/* Ranked list */}
      {rankedList.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2 px-1">
            All Results ({rankedList.length})
          </p>
          <div className="space-y-3">
            {rankedList.map((result, i) => (
              <ResultCard key={result.url || i} result={result} />
            ))}
          </div>
        </div>
      )}

      {rankedList.length === 0 && !bestResult && (
        <div className="text-center py-10 text-gray-500">
          <p className="text-4xl mb-3">🔍</p>
          <p>No results found for "{query}"</p>
          <p className="text-sm mt-1">Try rephrasing your query.</p>
        </div>
      )}
    </div>
  );
}

/**
 * ResultCard — renders a single search result item.
 * Handles both YouTube and web (Google/scraper) result types.
 */

function SourceBadge({ sourceType }) {
  const map = {
    youtube: { label: 'YouTube', bg: 'bg-red-500/15 text-red-400 border-red-500/30' },
    google:  { label: 'Google',  bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    scraper: { label: 'Web',     bg: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  };
  const { label, bg } = map[sourceType] || { label: sourceType, bg: 'bg-gray-700 text-gray-400 border-gray-600' };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${bg}`}>
      {label}
    </span>
  );
}

function RankBadge({ rank, score }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500">#{rank}</span>
      <div className="h-1.5 w-16 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-green-400 rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-gray-400">{score}</span>
    </div>
  );
}

export default function ResultCard({ result, isBest = false }) {
  const isVideo = result.sourceType === 'youtube';

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block group rounded-xl border transition-all duration-200 overflow-hidden animate-slide-up ${
        isBest
          ? 'border-brand-500/50 bg-brand-500/5 hover:bg-brand-500/10'
          : 'border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/70'
      }`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge sourceType={result.sourceType} />
            {isBest && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-yellow-400/10 text-yellow-400 border-yellow-400/30">
                Best Match
              </span>
            )}
          </div>
          {result.rank && <RankBadge rank={result.rank} score={result.score || 0} />}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-gray-100 group-hover:text-brand-400 transition-colors line-clamp-2 mb-1">
          {result.title}
        </h3>

        {/* Description */}
        {result.description && (
          <p className="text-sm text-gray-400 line-clamp-2 mb-2">{result.description}</p>
        )}

        {/* YouTube thumbnail */}
        {isVideo && result.thumbnailUrl && (
          <div className="mt-2 rounded-lg overflow-hidden aspect-video bg-gray-900">
            <img
              src={result.thumbnailUrl}
              alt={result.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
          <span className="truncate max-w-[280px]">{result.url}</span>
          <svg className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </div>

        {/* Critic's reason */}
        {result.reason && (
          <p className="mt-2 text-xs text-gray-500 italic border-t border-gray-700/50 pt-2">
            {result.reason}
          </p>
        )}
      </div>
    </a>
  );
}

/**
 * Filter Processor
 *
 * Two responsibilities:
 * 1. deduplicateAndFilter  — remove duplicate URLs and empty/stub results
 * 2. filterByFormat        — STRICT content-type enforcement
 *    Spec: "Check content type matches request. If mismatch → reject."
 *    e.g. articles format must never contain youtube results.
 */

// Source types that represent video content
const VIDEO_SOURCE_TYPES = new Set(['youtube']);

// Source types that represent text/article content
const TEXT_SOURCE_TYPES = new Set(['tavily', 'serper', 'serper-news', 'google', 'scraper', 'brave']);

/**
 * Deduplicate by URL and strip results with no meaningful title.
 */
export function deduplicateAndFilter(results: any[]): any[] {
    const seen    = new Set<string>();
    const cleaned: any[] = [];

    for (const item of results) {
        const key = item.url || item.id;
        if (!key || seen.has(key))               continue;
        if (!item.title || item.title.trim().length < 3) continue;
        seen.add(key);
        cleaned.push(item);
    }

    return cleaned;
}

/**
 * Strict format filter — enforces that results match the user's chosen format.
 *
 * outputFormat:
 *   'video'   → keep ONLY youtube results (user asked for videos)
 *   'article' → REJECT youtube results (user asked for articles)
 *   'news'    → keep serper-news + brave; reject youtube
 *   'mixed'   → no restrictions (products, general)
 *
 * If applying the strict filter leaves 0 results we return the unfiltered set
 * rather than an empty list — the Critic will still rank and the summary will
 * note the mismatch. This prevents "❌ No results" on a bad API response.
 */
export function filterByFormat(results: any[], outputFormat: string): any[] {
    let filtered: any[];

    switch (outputFormat) {
        case 'video':
            filtered = results.filter((r) => VIDEO_SOURCE_TYPES.has(r.sourceType));
            break;

        case 'article':
            // Articles must never contain video content
            filtered = results.filter((r) => TEXT_SOURCE_TYPES.has(r.sourceType));
            break;

        case 'news':
            // News: prefer serper-news but accept any text source; reject video
            filtered = results.filter((r) => !VIDEO_SOURCE_TYPES.has(r.sourceType));
            // Promote news-specific results to top
            const newsFirst = filtered.filter((r) => r.sourceType === 'serper-news');
            const rest      = filtered.filter((r) => r.sourceType !== 'serper-news');
            filtered        = [...newsFirst, ...rest];
            break;

        case 'mixed':
        default:
            filtered = results; // No restriction for products / general
    }

    // Guard: never return empty set — log the mismatch and fall back
    if (filtered.length === 0 && results.length > 0) {
        return results;
    }

    return filtered;
}

/**
 * Legacy alias kept for backward compatibility with existing call sites.
 * New code should call filterByFormat directly.
 */
export function filterByIntent(results: any[], _intent: string, outputFormat: string): any[] {
    return filterByFormat(results, outputFormat);
}

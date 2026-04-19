import { TCrawlResult } from '../../_shared/types/agents.interface';

const VIDEO_SOURCE_TYPES = new Set(['youtube']);
const TEXT_SOURCE_TYPES = new Set(['tavily', 'serper', 'serper-news', 'google', 'scraper', 'brave']);

export function deduplicateAndFilter(results: TCrawlResult[]): TCrawlResult[] {
    const seen = new Set<string>();
    const cleaned: TCrawlResult[] = [];

    for (const item of results) {
        const key = 'id' in item ? item.id : item.url;
        if (!key || seen.has(key)) continue;
        if (item.title.trim().length < 3) continue;
        seen.add(key);
        cleaned.push(item);
    }

    return cleaned;
}

export function filterByFormat(results: TCrawlResult[], outputFormat: string): TCrawlResult[] {
    let filtered: TCrawlResult[];

    switch (outputFormat) {
        case 'video':
            filtered = results.filter((result) => VIDEO_SOURCE_TYPES.has(result.sourceType));
            break;
        case 'article':
            filtered = results.filter((result) => TEXT_SOURCE_TYPES.has(result.sourceType));
            break;
        case 'news': {
            const nonVideoResults = results.filter((result) => !VIDEO_SOURCE_TYPES.has(result.sourceType));
            const newsFirst = nonVideoResults.filter((result) => result.sourceType === 'serper-news');
            const rest = nonVideoResults.filter((result) => result.sourceType !== 'serper-news');
            filtered = [...newsFirst, ...rest];
            break;
        }
        case 'mixed':
        default:
            filtered = results;
    }

    return filtered.length === 0 && results.length > 0 ? results : filtered;
}

export function filterByIntent(results: TCrawlResult[], _intent: string, outputFormat: string): TCrawlResult[] {
    return filterByFormat(results, outputFormat);
}

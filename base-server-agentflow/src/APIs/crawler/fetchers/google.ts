import axios from 'axios';
import axiosRetry from 'axios-retry';
import logger from '../../../handlers/logger';
import cache from '../../../utils/cache';

// Configure axios retry
axiosRetry(axios as any, {
    retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    retryDelay: axiosRetry.exponentialDelay,
});

const SERPAPI_BASE = 'https://serpapi.com/search';
const CACHE_TTL = 1800;

export interface IGoogleResult {
    sourceType: string;
    title: string;
    url: string;
    description: string;
    position: number;
    displayUrl: string;
    query: string;
}

/**
 * Google Search Fetcher — uses SerpAPI to retrieve organic search results.
 */
export async function fetchGoogle(queries: string[], maxPerQuery: number = 5): Promise<IGoogleResult[]> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
        logger.warn('SERPAPI_KEY not set — skipping Google fetch');
        return [];
    }

    const results: IGoogleResult[] = [];

    for (const q of queries) {
        const cacheKey = cache.buildKey('goog', Buffer.from(q).toString('base64'));
        const cached = await cache.get<IGoogleResult[]>(cacheKey);
        
        if (cached) {
            logger.info('Google cache hit', { meta: { q } });
            results.push(...cached);
            continue;
        }

        try {
            const response = await axios.get(SERPAPI_BASE, {
                params: {
                    engine: 'google',
                    q,
                    num: maxPerQuery,
                    api_key: apiKey,
                },
                timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '10000', 10),
            });

            const organicResults = response.data.organic_results || [];
            const items: IGoogleResult[] = organicResults.slice(0, maxPerQuery).map((r: any) => ({
                sourceType: 'google',
                title: r.title,
                url: r.link,
                description: r.snippet,
                position: r.position,
                displayUrl: r.displayed_link,
                query: q,
            }));

            await cache.set(cacheKey, items, CACHE_TTL);
            results.push(...items);
            logger.info('Google fetch success', { meta: { q, count: items.length } });
        } catch (err) {
            logger.error('Google fetch failed', { meta: { err, q } });
        }
    }

    return results;
}

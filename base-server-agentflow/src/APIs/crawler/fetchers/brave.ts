/**
 * Brave Search API Fetcher
 * Role: universal fallback when all primary sources fail or are unconfigured.
 * Also used as a standalone source for general queries.
 */
import axios from 'axios';
import axiosRetry from 'axios-retry';
import logger from '../../../handlers/logger';
import cache from '../../../utils/cache';

axiosRetry(axios as any, {
    retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (err) =>
        axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
});

const BRAVE_API = 'https://api.search.brave.com/res/v1/web/search';
const CACHE_TTL = 1800;

export interface IBraveResult {
    sourceType: 'brave';
    title:       string;
    url:         string;
    description: string;
    query:       string;
}

export async function fetchBrave(
    queries:     string[],
    maxPerQuery: number = 5,
): Promise<IBraveResult[]> {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
        logger.warn('BRAVE_API_KEY not set — skipping Brave fallback');
        return [];
    }

    const results: IBraveResult[] = [];

    for (const q of queries) {
        const cacheKey = cache.buildKey('brave', Buffer.from(q).toString('base64'));
        const cached   = await cache.get<IBraveResult[]>(cacheKey);

        if (cached) {
            logger.info('Brave cache hit', { meta: { q } });
            results.push(...cached);
            continue;
        }

        try {
            const response = await axios.get(BRAVE_API, {
                params:  { q, count: maxPerQuery, search_lang: 'en' },
                headers: {
                    'Accept':               'application/json',
                    'Accept-Encoding':      'gzip',
                    'X-Subscription-Token': apiKey,
                },
                timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '10000', 10),
            });

            const raw = response.data?.web?.results || [];
            const items: IBraveResult[] = raw.slice(0, maxPerQuery).map((r: any) => ({
                sourceType:  'brave' as const,
                title:       r.title                               || '',
                url:         r.url                                 || '',
                description: r.description || r.extra_snippets?.[0] || '',
                query:       q,
            }));

            await cache.set(cacheKey, items, CACHE_TTL);
            results.push(...items);
            logger.info('Brave fetch success', { meta: { q, count: items.length } });
        } catch (err) {
            logger.error('Brave fetch failed', { meta: { err, q } });
        }
    }

    return results;
}

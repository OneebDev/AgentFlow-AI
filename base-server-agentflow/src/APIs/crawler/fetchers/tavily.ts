/**
 * Tavily Search Fetcher
 * Best for: articles, academic/deep-research queries, learning intent.
 * Uses Tavily's "advanced" depth to get richer content snippets.
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

const TAVILY_API = 'https://api.tavily.com/search';
const CACHE_TTL  = 1800; // 30 min

export interface ITavilyResult {
    sourceType: 'tavily';
    title:       string;
    url:         string;
    description: string;
    score:       number;
    query:       string;
}

export async function fetchTavily(
    queries:      string[],
    maxPerQuery:  number = 5,
): Promise<ITavilyResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        logger.warn('TAVILY_API_KEY not set — skipping Tavily fetch');
        return [];
    }

    const results: ITavilyResult[] = [];

    for (const q of queries) {
        const cacheKey = cache.buildKey('tav', Buffer.from(q).toString('base64'));
        const cached   = await cache.get<ITavilyResult[]>(cacheKey);

        if (cached) {
            logger.info('Tavily cache hit', { meta: { q } });
            results.push(...cached);
            continue;
        }

        try {
            const response = await axios.post(
                TAVILY_API,
                {
                    api_key:        apiKey,
                    query:          q,
                    search_depth:   'advanced',
                    include_answer: false,
                    include_images: false,
                    max_results:    maxPerQuery,
                },
                { timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10) },
            );

            const items: ITavilyResult[] = (response.data.results || [])
                .slice(0, maxPerQuery)
                .map((r: any) => ({
                    sourceType:  'tavily' as const,
                    title:       r.title       || '',
                    url:         r.url         || '',
                    description: r.content     || r.snippet || '',
                    score:       r.score       ?? 0.5,
                    query:       q,
                }));

            await cache.set(cacheKey, items, CACHE_TTL);
            results.push(...items);
            logger.info('Tavily fetch success', { meta: { q, count: items.length } });
        } catch (err) {
            logger.error('Tavily fetch failed', { meta: { err, q } });
        }
    }

    return results;
}

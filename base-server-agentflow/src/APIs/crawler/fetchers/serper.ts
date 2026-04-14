/**
 * Serper API Fetcher
 * Best for: general search, news queries, product searches.
 * Supports /search (organic) and /news endpoints.
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

const SERPER_BASE = 'https://google.serper.dev';
const CACHE_TTL   = 1800;

export type TSerperEndpoint = 'search' | 'news';

export interface ISerperResult {
    sourceType: 'serper' | 'serper-news';
    title:       string;
    url:         string;
    description: string;
    position:    number;
    query:       string;
}

export async function fetchSerper(
    queries:     string[],
    type:        TSerperEndpoint = 'search',
    maxPerQuery: number          = 5,
): Promise<ISerperResult[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        logger.warn('SERPER_API_KEY not set — skipping Serper fetch');
        return [];
    }

    const endpoint   = `${SERPER_BASE}/${type}`;
    const sourceType = type === 'news' ? 'serper-news' : 'serper';
    const results: ISerperResult[] = [];

    for (const q of queries) {
        const cacheKey = cache.buildKey('serp', type, Buffer.from(q).toString('base64'));
        const cached   = await cache.get<ISerperResult[]>(cacheKey);

        if (cached) {
            logger.info('Serper cache hit', { meta: { q, type } });
            results.push(...cached);
            continue;
        }

        try {
            const response = await axios.post(
                endpoint,
                { q, num: maxPerQuery },
                {
                    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                    timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '10000', 10),
                },
            );

            const raw = type === 'news'
                ? (response.data.news    || [])
                : (response.data.organic || []);

            const items: ISerperResult[] = raw.slice(0, maxPerQuery).map((r: any, i: number) => ({
                sourceType:  sourceType as ISerperResult['sourceType'],
                title:       r.title       || '',
                url:         r.link        || '',
                description: r.snippet     || r.description || '',
                position:    r.position    ?? i + 1,
                query:       q,
            }));

            await cache.set(cacheKey, items, CACHE_TTL);
            results.push(...items);
            logger.info('Serper fetch success', { meta: { q, type, count: items.length } });
        } catch (err) {
            logger.error('Serper fetch failed', { meta: { err, q, type } });
        }
    }

    return results;
}

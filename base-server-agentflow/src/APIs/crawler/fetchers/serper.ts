/**
 * Serper API Fetcher
 * Best for: general search, news queries, product searches.
 * Supports /search (organic) and /news endpoints.
 */
import axios from 'axios';
import axiosRetry from 'axios-retry';
import logger from '../../../handlers/logger';
import cache from '../../../utils/cache';
import { ISerperResult } from '../../_shared/types/agents.interface';

const http = axios.create();

axiosRetry(http, {
    retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    retryDelay: (...args) => axiosRetry.exponentialDelay(...args),
    retryCondition: (err) =>
        axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
});

const SERPER_BASE = 'https://google.serper.dev';
const CACHE_TTL   = 1800;

export type TSerperEndpoint = 'search' | 'news';

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
            const response = await http.post<unknown>(
                endpoint,
                { q, num: maxPerQuery },
                {
                    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                    timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '10000', 10),
                },
            );

            const raw = extractSerperResults(response.data, type);

            const items: ISerperResult[] = raw.slice(0, maxPerQuery).map((r, i) => ({
                sourceType,
                title:       r.title,
                url:         r.link,
                description: r.description,
                position:    r.position ?? i + 1,
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

function extractSerperResults(
    data: unknown,
    type: TSerperEndpoint
): Array<{ title: string; link: string; description: string; position?: number }> {
    if (!data || typeof data !== 'object') {
        return [];
    }

    const key = type === 'news' ? 'news' : 'organic';
    const raw = (data as Record<string, unknown>)[key];
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw.map((item) => {
        const entry = item as Record<string, unknown>;
        return {
            title: typeof entry.title === 'string' ? entry.title : '',
            link: typeof entry.link === 'string' ? entry.link : '',
            description:
                typeof entry.snippet === 'string'
                    ? entry.snippet
                    : typeof entry.description === 'string'
                      ? entry.description
                      : '',
            position: typeof entry.position === 'number' ? entry.position : undefined,
        };
    });
}

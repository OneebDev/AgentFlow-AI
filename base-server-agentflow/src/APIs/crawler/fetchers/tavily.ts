/**
 * Tavily Search Fetcher
 * Best for: articles, academic/deep-research queries, learning intent.
 * Uses Tavily's "advanced" depth to get richer content snippets.
 */
import axios from 'axios';
import axiosRetry from 'axios-retry';
import logger from '../../../handlers/logger';
import cache from '../../../utils/cache';
import { ITavilyResult } from '../../_shared/types/agents.interface';

const http = axios.create();

axiosRetry(http, {
    retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    retryDelay: (...args) => axiosRetry.exponentialDelay(...args),
    retryCondition: (err) =>
        axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
});

const TAVILY_API = 'https://api.tavily.com/search';
const CACHE_TTL  = 1800; // 30 min

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
            const response = await http.post<unknown>(
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

            const items: ITavilyResult[] = extractTavilyResults(response.data)
                .slice(0, maxPerQuery)
                .map((r) => ({
                    sourceType:  'tavily' as const,
                    title:       r.title,
                    url:         r.url,
                    description: r.description,
                    score:       r.score,
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

function extractTavilyResults(
    data: unknown
): Array<{ title: string; url: string; description: string; score: number }> {
    if (!data || typeof data !== 'object' || !('results' in data)) {
        return [];
    }

    const raw = (data as { results?: unknown }).results;
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw.map((item) => {
        const entry = item as Record<string, unknown>;
        return {
            title: typeof entry.title === 'string' ? entry.title : '',
            url: typeof entry.url === 'string' ? entry.url : '',
            description:
                typeof entry.content === 'string'
                    ? entry.content
                    : typeof entry.snippet === 'string'
                      ? entry.snippet
                      : '',
            score: typeof entry.score === 'number' ? entry.score : 0.5,
        };
    });
}

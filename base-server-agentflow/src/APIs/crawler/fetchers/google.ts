import axios from 'axios';
import axiosRetry from 'axios-retry';
import logger from '../../../handlers/logger';
import cache from '../../../utils/cache';
import { IGoogleResult } from '../../_shared/types/agents.interface';

const http = axios.create();

axiosRetry(http, {
    retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    retryDelay: (...args) => axiosRetry.exponentialDelay(...args),
});

const SERPAPI_BASE = 'https://serpapi.com/search';
const CACHE_TTL = 1800;

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
            const response = await http.get<unknown>(SERPAPI_BASE, {
                params: {
                    engine: 'google',
                    q,
                    num: maxPerQuery,
                    api_key: apiKey,
                },
                timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '10000', 10),
            });

            const organicResults = extractOrganicResults(response.data);
            const items: IGoogleResult[] = organicResults.slice(0, maxPerQuery).map((r) => ({
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

function extractOrganicResults(
    data: unknown
): Array<{ title: string; link: string; snippet: string; position: number; displayed_link: string }> {
    if (!data || typeof data !== 'object' || !('organic_results' in data)) {
        return [];
    }

    const organicResults = (data as { organic_results?: unknown }).organic_results;
    if (!Array.isArray(organicResults)) {
        return [];
    }

    return organicResults.map((item, index) => {
        const entry = item as Record<string, unknown>;
        return {
            title: typeof entry.title === 'string' ? entry.title : '',
            link: typeof entry.link === 'string' ? entry.link : '',
            snippet: typeof entry.snippet === 'string' ? entry.snippet : '',
            position: typeof entry.position === 'number' ? entry.position : index + 1,
            displayed_link: typeof entry.displayed_link === 'string' ? entry.displayed_link : '',
        };
    });
}

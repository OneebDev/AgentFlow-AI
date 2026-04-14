import axios from 'axios';
import axiosRetry from 'axios-retry';
import logger from '../../../handlers/logger';
import cache from '../../../utils/cache';

// Configure axios retry
axiosRetry(axios as any, {
    retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (err) => axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
});

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const CACHE_TTL = 1800; // 30 minutes

export interface IYouTubeResult {
    sourceType: string;
    id: string;
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnailUrl?: string;
    url: string;
    query: string;
}

/**
 * YouTube Fetcher
 */
export async function fetchYouTube(queries: string[], maxPerQuery: number = 5): Promise<IYouTubeResult[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        logger.warn('YOUTUBE_API_KEY not set — skipping YouTube fetch');
        return [];
    }

    const results: IYouTubeResult[] = [];

    for (const q of queries) {
        const cacheKey = cache.buildKey('yt', Buffer.from(q).toString('base64'));
        const cached = await cache.get<IYouTubeResult[]>(cacheKey);

        if (cached) {
            logger.info('YouTube cache hit', { meta: { q } });
            results.push(...cached);
            continue;
        }

        try {
            const response = await axios.get(`${YOUTUBE_API_BASE}/search`, {
                params: {
                    part: 'snippet',
                    q,
                    type: 'video',
                    maxResults: maxPerQuery,
                    order: 'relevance',
                    key: apiKey,
                },
                timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '10000', 10),
            });

            const items: IYouTubeResult[] = (response.data.items || []).map((item: any) => ({
                sourceType: 'youtube',
                id: item.id.videoId,
                title: item.snippet.title,
                description: item.snippet.description,
                channelTitle: item.snippet.channelTitle,
                publishedAt: item.snippet.publishedAt,
                thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                query: q,
            }));

            await cache.set(cacheKey, items, CACHE_TTL);
            results.push(...items);
            logger.info('YouTube fetch success', { meta: { q, count: items.length } });
        } catch (err) {
            logger.error('YouTube fetch failed', { meta: { err, q } });
        }
    }

    return results;
}

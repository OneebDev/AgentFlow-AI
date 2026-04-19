import axios from 'axios';
import axiosRetry from 'axios-retry';
import logger from '../../../handlers/logger';
import cache from '../../../utils/cache';
import { IYouTubeResult } from '../../_shared/types/agents.interface';

const http = axios.create();

axiosRetry(http, {
    retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    retryDelay: (...args) => axiosRetry.exponentialDelay(...args),
    retryCondition: (err) => axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
});

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const CACHE_TTL = 1800; // 30 minutes

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
            const response = await http.get<unknown>(`${YOUTUBE_API_BASE}/search`, {
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

            const items: IYouTubeResult[] = extractYouTubeItems(response.data).map((item) => ({
                sourceType: 'youtube',
                id: item.id,
                title: item.title,
                description: item.description,
                channelTitle: item.channelTitle,
                publishedAt: item.publishedAt,
                thumbnailUrl: item.thumbnailUrl,
                url: `https://www.youtube.com/watch?v=${item.id}`,
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

function extractYouTubeItems(
    data: unknown
): Array<{
    id: string;
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnailUrl?: string;
}> {
    if (!data || typeof data !== 'object' || !('items' in data)) {
        return [];
    }

    const raw = (data as { items?: unknown }).items;
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((item) => {
            const entry = item as Record<string, unknown>;
            const id = entry.id as Record<string, unknown> | undefined;
            const snippet = entry.snippet as Record<string, unknown> | undefined;
            const thumbnails = snippet?.thumbnails as Record<string, unknown> | undefined;
            const highThumbnail = thumbnails?.high as Record<string, unknown> | undefined;
            const defaultThumbnail = thumbnails?.default as Record<string, unknown> | undefined;
            const videoId = typeof id?.videoId === 'string' ? id.videoId : '';

            return {
                id: videoId,
                title: typeof snippet?.title === 'string' ? snippet.title : '',
                description: typeof snippet?.description === 'string' ? snippet.description : '',
                channelTitle: typeof snippet?.channelTitle === 'string' ? snippet.channelTitle : '',
                publishedAt: typeof snippet?.publishedAt === 'string' ? snippet.publishedAt : '',
                thumbnailUrl:
                    typeof highThumbnail?.url === 'string'
                        ? highThumbnail.url
                        : typeof defaultThumbnail?.url === 'string'
                          ? defaultThumbnail.url
                          : undefined,
            };
        })
        .filter((item) => item.id.length > 0);
}

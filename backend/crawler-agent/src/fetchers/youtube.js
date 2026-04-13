/**
 * YouTube Fetcher
 * Uses the YouTube Data API v3 to search for videos matching each query.
 * Returns a normalised array of video objects.
 */

'use strict';

const axios      = require('axios');
const axiosRetry = require('axios-retry').default;
const { createLogger } = require('@agentflow/shared/logger');
const { get: cacheGet, set: cacheSet, buildKey } = require('@agentflow/shared/cache');

const log = createLogger('crawler-agent:youtube');

axiosRetry(axios, {
  retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) => axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
});

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const CACHE_TTL = 1800; // 30 minutes

/**
 * @param {string[]} queries    Search query strings from researcher
 * @param {number}   maxPerQuery Results per query (default 5)
 * @returns {Promise<Array>}
 */
async function fetchYouTube(queries, maxPerQuery = 5) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    log.warn('YOUTUBE_API_KEY not set — skipping YouTube fetch');
    return [];
  }

  const results = [];

  for (const q of queries) {
    const cacheKey = buildKey('yt', Buffer.from(q).toString('base64'));
    const cached = await cacheGet(cacheKey);
    if (cached) {
      log.debug({ q }, 'YouTube cache hit');
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

      const items = (response.data.items || []).map((item) => ({
        sourceType:   'youtube',
        id:           item.id.videoId,
        title:        item.snippet.title,
        description:  item.snippet.description,
        channelTitle: item.snippet.channelTitle,
        publishedAt:  item.snippet.publishedAt,
        thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        url:          `https://www.youtube.com/watch?v=${item.id.videoId}`,
        query:        q,
      }));

      await cacheSet(cacheKey, items, CACHE_TTL);
      results.push(...items);
      log.debug({ q, count: items.length }, 'YouTube fetch success');
    } catch (err) {
      log.error({ err, q }, 'YouTube fetch failed');
    }
  }

  return results;
}

module.exports = { fetchYouTube };

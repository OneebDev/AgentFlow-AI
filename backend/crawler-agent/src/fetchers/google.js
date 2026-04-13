/**
 * Google Search Fetcher — uses SerpAPI to retrieve organic search results.
 * Falls back gracefully if no API key is configured.
 */

'use strict';

const axios      = require('axios');
const axiosRetry = require('axios-retry').default;
const { createLogger } = require('@agentflow/shared/logger');
const { get: cacheGet, set: cacheSet, buildKey } = require('@agentflow/shared/cache');

const log = createLogger('crawler-agent:google');

axiosRetry(axios, {
  retries: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
  retryDelay: axiosRetry.exponentialDelay,
});

const SERPAPI_BASE = 'https://serpapi.com/search';
const CACHE_TTL    = 1800;

/**
 * @param {string[]} queries
 * @param {number}   maxPerQuery
 * @returns {Promise<Array>}
 */
async function fetchGoogle(queries, maxPerQuery = 5) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    log.warn('SERPAPI_KEY not set — skipping Google fetch');
    return [];
  }

  const results = [];

  for (const q of queries) {
    const cacheKey = buildKey('goog', Buffer.from(q).toString('base64'));
    const cached = await cacheGet(cacheKey);
    if (cached) {
      log.debug({ q }, 'Google cache hit');
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
      const items = organicResults.slice(0, maxPerQuery).map((r) => ({
        sourceType:  'google',
        title:       r.title,
        url:         r.link,
        description: r.snippet,
        position:    r.position,
        displayUrl:  r.displayed_link,
        query:       q,
      }));

      await cacheSet(cacheKey, items, CACHE_TTL);
      results.push(...items);
      log.debug({ q, count: items.length }, 'Google fetch success');
    } catch (err) {
      log.error({ err, q }, 'Google fetch failed');
    }
  }

  return results;
}

module.exports = { fetchGoogle };

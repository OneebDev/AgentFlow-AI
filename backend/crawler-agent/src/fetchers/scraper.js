/**
 * Web Scraper Fetcher
 * Fetches raw HTML for a given URL and uses Cheerio to extract
 * meaningful text content (title, meta description, body paragraphs).
 *
 * Used for deep-dive research when the Researcher flags "scraper" as a source.
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const { createLogger } = require('@agentflow/shared/logger');
const { get: cacheGet, set: cacheSet, buildKey } = require('@agentflow/shared/cache');

const log = createLogger('crawler-agent:scraper');

const SCRAPER_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT_MS || '10000', 10);
const MAX_RETRIES     = parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10);
const CACHE_TTL       = 3600;

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AgentFlowBot/1.0)',
  Accept: 'text/html,application/xhtml+xml',
};

/**
 * Scrape a single URL and return structured content.
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function scrapeUrl(url) {
  const cacheKey = buildKey('scrape', Buffer.from(url).toString('base64'));
  const cached = await cacheGet(cacheKey);
  if (cached) {
    log.debug({ url }, 'Scraper cache hit');
    return cached;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: DEFAULT_HEADERS,
        timeout: SCRAPER_TIMEOUT,
        maxRedirects: 5,
        // Never follow to login pages or captchas — surface early
        validateStatus: (status) => status < 400,
      });

      const $ = cheerio.load(response.data);

      // Remove noise
      $('script, style, nav, footer, header, iframe, noscript, aside').remove();

      const title       = $('title').first().text().trim();
      const metaDesc    = $('meta[name="description"]').attr('content') || '';
      const h1          = $('h1').first().text().trim();
      const paragraphs  = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((t) => t.length > 60)
        .slice(0, 10);

      const result = {
        sourceType:  'scraper',
        url,
        title:       title || h1,
        description: metaDesc || paragraphs[0] || '',
        content:     paragraphs.join(' '),
        scrapedAt:   new Date().toISOString(),
      };

      await cacheSet(cacheKey, result, CACHE_TTL);
      return result;
    } catch (err) {
      log.warn({ url, attempt, err: err.message }, 'Scrape attempt failed');
      if (attempt === MAX_RETRIES) return null;
    }
  }
  return null;
}

/**
 * Scrape multiple URLs in parallel (max 3 at a time to be polite).
 * @param {string[]} urls
 * @returns {Promise<Array>}
 */
async function scrapeUrls(urls) {
  const BATCH_SIZE = 3;
  const results = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(scrapeUrl));
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

module.exports = { scrapeUrl, scrapeUrls };

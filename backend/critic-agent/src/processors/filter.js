/**
 * Filter Processor
 * Removes duplicate URLs and items that don't match the user's intent.
 */

'use strict';

/**
 * Deduplicate by URL, then filter out results with empty/useless content.
 *
 * @param {Array} results  Raw mixed results from all fetchers
 * @returns {Array}
 */
function deduplicateAndFilter(results) {
  const seen = new Set();
  const cleaned = [];

  for (const item of results) {
    const key = item.url || item.id;
    if (!key || seen.has(key)) continue;
    if (!item.title || item.title.trim().length < 3) continue;
    seen.add(key);
    cleaned.push(item);
  }

  return cleaned;
}

/**
 * Filter results by intent — e.g. if intent is 'learning', prefer educational content.
 *
 * @param {Array}  results
 * @param {string} intent
 * @param {string} outputFormat
 * @returns {Array}
 */
function filterByIntent(results, intent, outputFormat) {
  // Prefer format-matching results first
  if (outputFormat === 'video') {
    const videos = results.filter((r) => r.sourceType === 'youtube');
    const rest   = results.filter((r) => r.sourceType !== 'youtube');
    return [...videos, ...rest];
  }
  if (outputFormat === 'article') {
    const articles = results.filter((r) => r.sourceType !== 'youtube');
    const rest     = results.filter((r) => r.sourceType === 'youtube');
    return [...articles, ...rest];
  }
  return results;
}

module.exports = { deduplicateAndFilter, filterByIntent };

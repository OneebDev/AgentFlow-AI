import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../../../handlers/logger';
import cache from '../../../utils/cache';
import { IScraperResult } from '../../_shared/types/agents.interface';

const SCRAPER_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT_MS || '5000', 10);
const MAX_RETRIES = parseInt(process.env.SCRAPER_MAX_RETRIES || '1', 10);
const CACHE_TTL = 3600;

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; AgentFlowBot/1.0)',
    Accept: 'text/html,application/xhtml+xml',
};

/**
 * Scrape a single URL and return structured content.
 */
export async function scrapeUrl(url: string): Promise<IScraperResult | null> {
    const cacheKey = cache.buildKey('scrape', Buffer.from(url).toString('base64'));
    const cached = await cache.get<IScraperResult>(cacheKey);
    
    if (cached) {
        logger.info('Scraper cache hit', { meta: { url } });
        return cached;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: DEFAULT_HEADERS,
                timeout: SCRAPER_TIMEOUT,
                maxRedirects: 5,
                validateStatus: (status) => status < 400,
            });

            const html = typeof response.data === 'string' ? response.data : '';
            const $ = cheerio.load(html);

            // Remove noise
            $('script, style, nav, footer, header, iframe, noscript, aside').remove();

            const title = $('title').first().text().trim();
            const metaDesc = $('meta[name="description"]').attr('content') || '';
            const h1 = $('h1').first().text().trim();
            const paragraphs = $('p')
                .map((_, el) => $(el).text().trim())
                .get()
                .filter((t) => t.length > 60)
                .slice(0, 10);

            const result: IScraperResult = {
                sourceType: 'scraper',
                url,
                title: title || h1,
                description: metaDesc || paragraphs[0] || '',
                content: paragraphs.join(' '),
                scrapedAt: new Date().toISOString(),
                emails: extractEmails(`${metaDesc} ${paragraphs.join(' ')}`),
                phoneNumbers: extractPhoneNumbers(`${metaDesc} ${paragraphs.join(' ')}`),
            };

            await cache.set(cacheKey, result, CACHE_TTL);
            return result;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown scrape error';
            logger.warn('Scrape attempt failed', { meta: { url, attempt, err: message } });
            if (attempt === MAX_RETRIES) return null;
        }
    }
    return null;
}

/**
 * Scrape multiple URLs in parallel (max 3 at a time to be polite).
 */
export async function scrapeUrls(urls: string[]): Promise<IScraperResult[]> {
    const BATCH_SIZE = 3;
    const results: IScraperResult[] = [];

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(scrapeUrl));
        const validResults = batchResults.filter((result): result is IScraperResult => result !== null);
        results.push(...validResults);
    }

    return results;
}

function extractEmails(content: string): string[] {
    const matches = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    return Array.from(new Set(matches)).slice(0, 3);
}

function extractPhoneNumbers(content: string): string[] {
    const matches = content.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/g) || [];
    return Array.from(new Set(matches)).slice(0, 3);
}

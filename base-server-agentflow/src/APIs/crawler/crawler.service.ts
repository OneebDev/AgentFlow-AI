import { Job } from 'bullmq';
import logger from '../../handlers/logger';
import jobRepo from '../_shared/repo/agent-job.repository';
import crawlRepo from '../_shared/repo/crawl-result.repository';
import { EJobStatus, EQueueName, IAgentJobPayload } from '../_shared/types/agents.interface';
import { fetchGoogle } from './fetchers/google';
import { fetchYouTube } from './fetchers/youtube';
import { scrapeUrls } from './fetchers/scraper';
import { fetchTavily } from './fetchers/tavily';
import { fetchSerper } from './fetchers/serper';
import { fetchBrave } from './fetchers/brave';
import { createQueue } from '../../utils/queue';
import { publishJobEvent } from '../../utils/pubsub';

const criticQueue = createQueue(EQueueName.CRITIC);

/**
 * Run a primary fetcher. If it returns 0 results (API key missing, network
 * failure, or empty response), automatically retry with Brave Search.
 * This matches the spec: "IF API fails → fallback to Brave Search API"
 */
async function fetchWithFallback(
    label:   string,
    primary: () => Promise<any[]>,
    queries: string[],
): Promise<{ type: string; results: any[] }> {
    let results = await primary();

    if (results.length === 0) {
        logger.warn(`${label} returned 0 results — falling back to Brave`, { meta: { queries } });
        results = await fetchBrave(queries);
        return { type: 'brave', results };
    }

    return { type: label, results };
}

export class CrawlerService {
    /**
     * Main processor for crawl jobs.
     *
     * Routing rules (matches spec exactly):
     *   articles / learning  → Tavily  → fallback: Brave  + scrape top URLs
     *   news                 → Serper (news endpoint) → fallback: Brave
     *   products             → Serper (search)        → fallback: Brave
     *   videos               → YouTube API (no fallback — format-specific)
     *   general / default    → Serper (search)        → fallback: Brave
     */
    async processCrawlJob(job: Job<IAgentJobPayload>): Promise<any> {
        const { jobId, query, searchQueries, sources, format } = job.data;
        const dbJobId = (job.data as any)._id || jobId;

        logger.info(`Crawler starting`, { meta: { jobId, format, sources } });

        // 1. Update status + push SSE event
        await jobRepo.updateJobStatus(dbJobId, EJobStatus.CRAWLING);
        publishJobEvent(jobId, { type: 'status', status: 'crawling' });

        const queries    = searchQueries?.length ? searchQueries : [query];
        const fetchTasks: Promise<{ type: string; results: any[] }>[] = [];
        
        // Calculate dynamic fetch limit based on requested quantity
        // If 100 results requested and 3 queries, we need ~34 per query.
        const reqQty = job.data.requestedQuantity ?? 10;
        const perQueryLimit = Math.max(5, Math.ceil((reqQty * 1.5) / queries.length)); // 50% buffer

        // ── Source routing ────────────────────────────────────────────────────
        for (const source of sources ?? []) {
            switch (source) {
                // Learning / articles → Tavily (deep search)
                case 'tavily':
                    fetchTasks.push(
                        fetchWithFallback('tavily', () => fetchTavily(queries, perQueryLimit), queries),
                    );
                    break;

                // Deep scraping of top article URLs
                case 'scraper': {
                    fetchTasks.push(
                        (async () => {
                            // Get URLs from Tavily if available, otherwise Google
                            let seedResults: any[] = await fetchTavily(queries.slice(0, 2), 3);
                            if (!seedResults.length) {
                                seedResults = await fetchGoogle(queries.slice(0, 2), 3);
                            }
                            const urls = seedResults.map((r) => r.url).filter(Boolean).slice(0, 6);
                            const scraped = await scrapeUrls(urls);
                            return { type: 'scraper', results: scraped };
                        })(),
                    );
                    break;
                }

                // General / products → Serper organic
                case 'serper':
                    fetchTasks.push(
                        fetchWithFallback('serper', () => fetchSerper(queries, 'search', perQueryLimit), queries),
                    );
                    break;

                // News → Serper news endpoint
                case 'serper-news':
                    fetchTasks.push(
                        fetchWithFallback('serper-news', () => fetchSerper(queries, 'news', perQueryLimit), queries),
                    );
                    break;

                // Videos → YouTube only
                case 'youtube':
                    fetchTasks.push(
                        fetchYouTube(queries, perQueryLimit).then((r) => ({ type: 'youtube', results: r })),
                    );
                    break;

                // Explicit Brave (or as direct source)
                case 'brave':
                    fetchTasks.push(
                        fetchBrave(queries).then((r) => ({ type: 'brave', results: r })),
                    );
                    break;

                // Legacy Google (SerpAPI) — kept for backward compat
                case 'google':
                    fetchTasks.push(
                        fetchWithFallback('google', () => fetchGoogle(queries), queries),
                    );
                    break;

                default:
                    logger.warn(`Unknown source "${source}" — skipping`);
            }
        }

        // ── Execute all fetch tasks in parallel ───────────────────────────────
        const settled    = await Promise.allSettled(fetchTasks);
        const rawResults: any[] = [];

        for (const outcome of settled) {
            if (outcome.status === 'fulfilled' && outcome.value.results.length) {
                const { type, results } = outcome.value;
                rawResults.push(...results);
                await crawlRepo.createCrawlResult(dbJobId, type, results);
                
                // Stream partial results to UI for immediate feedback
                publishJobEvent(jobId, { type: 'partial_results', results });
            } else if (outcome.status === 'rejected') {
                logger.error('Fetcher task threw unexpectedly', {
                    meta: { err: outcome.reason, jobId },
                });
            }
        }

        logger.info(`Crawl complete`, { meta: { jobId, totalResults: rawResults.length } });

        // 4. Enqueue Critic job with full payload
        await criticQueue.add(`critic:${jobId}`, {
            ...job.data,
            rawResults,
        });

        return { jobId, resultCount: rawResults.length };
    }
}

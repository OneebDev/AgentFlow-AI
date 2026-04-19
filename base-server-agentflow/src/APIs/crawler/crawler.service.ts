import { Job } from 'bullmq';
import logger from '../../handlers/logger';
import { publishJobEvent } from '../../utils/pubsub';
import { createQueue } from '../../utils/queue';
import crawlRepo from '../_shared/repo/crawl-result.repository';
import jobRepo from '../_shared/repo/agent-job.repository';
import {
    EJobStatus,
    EQueueName,
    IAgentJobPayload,
    ICrawlFetchResult,
    TCrawlResult,
    TSourceType,
} from '../_shared/types/agents.interface';
import { fetchBrave } from './fetchers/brave';
import { fetchGoogle } from './fetchers/google';
import { scrapeUrls } from './fetchers/scraper';
import { fetchSerper } from './fetchers/serper';
import { fetchTavily } from './fetchers/tavily';
import { fetchYouTube } from './fetchers/youtube';

const criticQueue = createQueue(EQueueName.CRITIC);

async function fetchWithFallback(
    label: TSourceType,
    primary: () => Promise<TCrawlResult[]>,
    queries: string[]
): Promise<ICrawlFetchResult> {
    let results = await primary();

    if (results.length === 0) {
        logger.warn(`${label} returned 0 results - falling back to Brave`, { meta: { queries } });
        results = await fetchBrave(queries);
        return { type: 'brave', results };
    }

    return { type: label, results };
}

export class CrawlerService {
    async processCrawlJob(job: Job<IAgentJobPayload>): Promise<{ jobId: string; resultCount: number }> {
        const { jobId, query, searchQueries, sources, format } = job.data;
        const dbJobId = job.data._id || jobId;

        logger.info('Crawler starting', { meta: { jobId, format, sources } });

        await jobRepo.updateJobStatus(dbJobId, EJobStatus.CRAWLING);
        publishJobEvent(jobId, { type: 'status', status: 'crawling' });

        const queries = searchQueries?.length ? searchQueries : [query];
        const fetchTasks: Array<Promise<ICrawlFetchResult>> = [];
        const reqQty = job.data.requestedQuantity ?? 10;
        const perQueryLimit = Math.max(5, Math.ceil((reqQty * 1.5) / queries.length));

        for (const source of sources ?? []) {
            switch (source) {
                case 'tavily':
                    fetchTasks.push(fetchWithFallback('tavily', () => fetchTavily(queries, perQueryLimit), queries));
                    break;
                case 'scraper':
                    fetchTasks.push(
                        (async () => {
                            let seedResults: TCrawlResult[] = await fetchTavily(queries.slice(0, 2), 3);
                            if (seedResults.length === 0) {
                                seedResults = await fetchGoogle(queries.slice(0, 2), 3);
                            }
                            const urls = seedResults
                                .map((result) => result.url)
                                .filter((url): url is string => url.length > 0)
                                .slice(0, 6);
                            const scraped = await scrapeUrls(urls);
                            return { type: 'scraper', results: scraped };
                        })()
                    );
                    break;
                case 'serper':
                    fetchTasks.push(fetchWithFallback('serper', () => fetchSerper(queries, 'search', perQueryLimit), queries));
                    break;
                case 'serper-news':
                    fetchTasks.push(
                        fetchWithFallback('serper-news', () => fetchSerper(queries, 'news', perQueryLimit), queries)
                    );
                    break;
                case 'youtube':
                    fetchTasks.push(fetchYouTube(queries, perQueryLimit).then((results) => ({ type: 'youtube', results })));
                    break;
                case 'brave':
                    fetchTasks.push(fetchBrave(queries).then((results) => ({ type: 'brave', results })));
                    break;
                case 'google':
                    fetchTasks.push(fetchWithFallback('google', () => fetchGoogle(queries), queries));
                    break;
                default: {
                    const unexpectedSource = String(source);
                    logger.warn(`Unknown source "${unexpectedSource}" - skipping`);
                }
            }
        }

        const settled = await Promise.allSettled(fetchTasks);
        const rawResults: TCrawlResult[] = [];

        for (const outcome of settled) {
            if (outcome.status === 'fulfilled' && outcome.value.results.length > 0) {
                const { type, results } = outcome.value;
                rawResults.push(...results);
                await crawlRepo.createCrawlResult(dbJobId, type, results);
                publishJobEvent(jobId, { type: 'partial_results', results });
                continue;
            }

            if (outcome.status === 'rejected') {
                const errorMessage = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
                logger.error('Fetcher task threw unexpectedly', { meta: { err: errorMessage, jobId } });
            }
        }

        logger.info('Crawl complete', { meta: { jobId, totalResults: rawResults.length } });

        await criticQueue.add(`critic:${jobId}`, {
            ...job.data,
            rawResults,
        });

        return { jobId, resultCount: rawResults.length };
    }
}

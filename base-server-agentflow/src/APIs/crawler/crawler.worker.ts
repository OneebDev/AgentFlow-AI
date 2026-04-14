import { CrawlerService } from './crawler.service';
import { createWorker } from '../../utils/queue';
import { EQueueName } from '../_shared/types/agents.interface';
import logger from '../../handlers/logger';
import jobRepo from '../_shared/repo/agent-job.repository';
import { EJobStatus } from '../_shared/types/agents.interface';

const crawlerService = new CrawlerService();

/**
 * Initialize the Crawler Worker.
 * This can be called during system bootstrap.
 */
export function initCrawlerWorker() {
    const worker = createWorker(EQueueName.CRAWL, async (job) => {
        return await crawlerService.processCrawlJob(job);
    }, {
        concurrency: 3,
    });

    worker.on('failed', async (job, err) => {
        if (!job?.data?.jobId) return;
        
        const dbJobId = (job.data as any)._id || job.data.jobId;
        logger.error(`Crawl job failed: ${job.data.jobId}`, { meta: { err } });
        
        await jobRepo.updateJobStatus(dbJobId, EJobStatus.FAILED, err.message);
    });

    return worker;
}

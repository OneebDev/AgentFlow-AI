import { CrawlerService } from './crawler.service';
import { createWorker } from '../../utils/queue';
import { EQueueName, EJobStatus, IAgentJobPayload } from '../_shared/types/agents.interface';
import logger from '../../handlers/logger';
import jobRepo from '../_shared/repo/agent-job.repository';
import { Job } from 'bullmq';

const crawlerService = new CrawlerService();

/**
 * Initialize the Crawler Worker.
 * This can be called during system bootstrap.
 */
export function initCrawlerWorker() {
    const worker = createWorker(EQueueName.CRAWL, (job: Job<IAgentJobPayload>) => crawlerService.processCrawlJob(job), {
        concurrency: 3,
    });

    worker.on('failed', (job, err) => {
        if (!job?.data?.jobId) return;

        const dbJobId = job.data._id || job.data.jobId;
        logger.error(`Crawl job failed: ${job.data.jobId}`, { meta: { err } });

        void jobRepo.updateJobStatus(dbJobId, EJobStatus.FAILED, err.message);
    });

    return worker;
}

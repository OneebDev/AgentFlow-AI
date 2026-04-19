import { CriticService } from './critic.service';
import { createWorker } from '../../utils/queue';
import { EQueueName, EJobStatus, IAgentJobPayload } from '../_shared/types/agents.interface';
import logger from '../../handlers/logger';
import jobRepo from '../_shared/repo/agent-job.repository';
import { Job } from 'bullmq';

const criticService = new CriticService();

/**
 * Initialize the Critic Worker.
 */
export function initCriticWorker() {
    const worker = createWorker(EQueueName.CRITIC, (job: Job<IAgentJobPayload>) => criticService.processCriticJob(job), {
        concurrency: 5,
    });

    worker.on('failed', (job, err) => {
        if (!job?.data?.jobId) return;

        const dbJobId = job.data._id || job.data.jobId;
        logger.error(`Critic job failed: ${job.data.jobId}`, { meta: { err } });

        void jobRepo.updateJobStatus(dbJobId, EJobStatus.FAILED, err.message);
    });

    return worker;
}

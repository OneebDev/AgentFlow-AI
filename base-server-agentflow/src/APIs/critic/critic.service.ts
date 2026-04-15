import { Job } from 'bullmq';
import logger from '../../handlers/logger';
import jobRepo from '../_shared/repo/agent-job.repository';
import finalRepo from '../_shared/repo/final-result.repository';
import { EJobStatus, IAgentJobPayload } from '../_shared/types/agents.interface';
import { deduplicateAndFilter, filterByIntent } from './processors/filter';
import { rankWithGemini } from './processors/ranker';
import { publishJobEvent } from '../../utils/pubsub';

export class CriticService {
    /**
     * Main processor for critic jobs.
     */
    async processCriticJob(job: Job<IAgentJobPayload>): Promise<any> {
        const { jobId, query, intent, outputFormat, outputType, language, rawResults } = job.data;
        const dbJobId = (job.data as any)._id || jobId;

        logger.info(`Critic starting evaluation for job: ${jobId}`, { meta: { rawCount: rawResults?.length } });

        // 1. Update status to CRITIQUING and push to browser immediately
        await jobRepo.updateJobStatus(dbJobId, EJobStatus.CRITIQUING);
        publishJobEvent(jobId, { type: 'status', status: 'critiquing', thought: 'summary ' });

        if (!rawResults || rawResults.length === 0) {
            await jobRepo.updateJobStatus(dbJobId, EJobStatus.FAILED, 'No results found to evaluate');
            publishJobEvent(jobId, { type: 'failed', error: 'No results found to evaluate' });
            return { jobId, status: 'FAILED', message: 'No results to evaluate' };
        }

        // 2. Filter & Deduplicate
        const deduped = deduplicateAndFilter(rawResults);
        const filtered = filterByIntent(deduped, intent || 'general', outputFormat || 'mixed');

        logger.info('Filtering done', { meta: { jobId, after: filtered.length, before: rawResults.length } });

        // 3. Rank with Gemini — pass outputType + language so the prompt adapts
        const evaluation = await rankWithGemini(
            query,
            intent      || 'general',
            outputFormat || 'mixed',
            outputType  || 'list',
            language    || 'English',
            job.data.requestedQuantity || null,
            filtered,
        );

        // 4. Save Final Result to MongoDB
        await finalRepo.createFinalResult(dbJobId.toString(), {
            bestResult: evaluation.bestResult,
            rankedList: evaluation.rankedList,
            summary:    evaluation.summary,
            keyPoints:  evaluation.keyPoints ?? [],
        });

        // 5. Update Job Status to COMPLETED and push final results to browser
        await jobRepo.updateJobStatus(dbJobId, EJobStatus.COMPLETED);
        publishJobEvent(jobId, {
            type: 'completed',
            results: {
                rankedList: evaluation.rankedList,
                bestResult: evaluation.bestResult,
                summary:    evaluation.summary,
                keyPoints:  evaluation.keyPoints ?? [],
            },
        });

        logger.info(`Critic: evaluation completed for job: ${jobId}`);
        return { jobId, ranked: evaluation.rankedList.length };
    }
}

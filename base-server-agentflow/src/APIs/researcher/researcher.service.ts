import jobRepo from '../_shared/repo/agent-job.repository';
import finalRepo from '../_shared/repo/final-result.repository';
import { EJobStatus, EQueueName } from '../_shared/types/agents.interface';
import { createQueue } from '../../utils/queue';
import { publishJobEvent } from '../../utils/pubsub';
import { IResearchRequest, IResearchResponse, TResearchFormat } from './types';

const crawlQueue = createQueue(EQueueName.CRAWL);

/**
 * Maps the user-facing format to:
 *   sources     — which fetchers the Crawler will use (in priority order)
 *   outputFormat — what the Critic filter uses to strip mismatched content
 *   intent       — semantic label forwarded to the Gemini ranker
 *
 * Routing mirrors the spec:
 *   learning / articles → Tavily (deep)  → fallback Brave
 *   general             → Serper organic → fallback Brave
 *   news                → Serper news    → fallback Brave
 *   products / shopping → Serper organic → fallback Brave
 *   videos              → YouTube (no text fallback — format-specific)
 */
function resolveFormatConfig(format: TResearchFormat): {
    sources:      string[];
    outputFormat: string;
    intent:       string;
} {
    switch (format) {
        case 'articles':
            return {
                sources:      ['tavily', 'scraper'],
                outputFormat: 'article',
                intent:       'learning',
            };
        case 'videos':
            return {
                sources:      ['youtube'],
                outputFormat: 'video',
                intent:       'learning',
            };
        case 'news':
            return {
                sources:      ['serper-news'],
                outputFormat: 'news',
                intent:       'news',
            };
        case 'products':
            return {
                sources:      ['serper'],
                outputFormat: 'mixed',
                intent:       'shopping',
            };
        default:
            return {
                sources:      ['serper'],
                outputFormat: 'mixed',
                intent:       'general',
            };
    }
}

export class ResearcherService {
    async initiateResearch(data: IResearchRequest): Promise<IResearchResponse> {
        const { sources, outputFormat, intent } = resolveFormatConfig(data.format!);

        // 1. Create Job in MongoDB
        const job = await jobRepo.createJob({
            userId: 'default_user', // This would come from auth in a real app
            query: data.topic,
            status: EJobStatus.PENDING,
            metadata: {
                format: data.format,
                language: data.language,
                outputType: data.outputType,
                depth: data.depth,
                options: data.options,
            }
        });

        const jobId = job._id.toString();

        // 2. Transition to RESEARCHING immediately and broadcast — the browser
        //    sees this within milliseconds via SSE, before any worker runs.
        await jobRepo.updateJobStatus(jobId, EJobStatus.RESEARCHING);
        publishJobEvent(jobId, { type: 'status', status: 'researching' });

        // 3. Enqueue in BullMQ — pass full format context through the pipeline
        await crawlQueue.add(`crawl:${jobId}`, {
            jobId,
            query: data.topic,
            format: data.format,
            language: data.language,
            outputType: data.outputType,
            sources,
            intent,
            outputFormat,
        });

        return {
            jobId,
            status: 'pending',
            message: `Research initiated for topic: ${data.topic}`,
        };
    }

    async getStatus(jobId: string): Promise<IResearchResponse> {
        const job = await jobRepo.findJobById(jobId);
        
        if (!job) {
            return {
                jobId,
                status: 'failed',
                message: 'Job not found',
            };
        }

        return {
            jobId,
            status: job.status.toLowerCase() as any,
            message: job.errorMessage || `Agent status: ${job.status}`,
        };
    }

    async getResults(jobId: string): Promise<any> {
        const results = await finalRepo.findByJobId(jobId);
        return results;
    }
}

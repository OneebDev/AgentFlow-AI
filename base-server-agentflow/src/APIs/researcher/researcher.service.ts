import jobRepo from '../_shared/repo/agent-job.repository';
import finalRepo from '../_shared/repo/final-result.repository';
import { EJobStatus, EQueueName } from '../_shared/types/agents.interface';
import { createQueue } from '../../utils/queue';
import { publishJobEvent } from '../../utils/pubsub';
import { IResearchRequest, IResearchResponse, TResearchFormat } from './types';
import { planResearch } from './processors/planner';

const crawlQueue = createQueue(EQueueName.CRAWL);

/**
 * Maps the user-facing format to config.
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

        // 1. Planning Phase (Agentic Brain / Antigravity Style)
        // Thinking before acting to save API costs & improve quality.
        const { thought, queries } = await planResearch(
            data.topic,
            data.format!,
            data.language || 'English'
        );

        // 2. Create Job in MongoDB
        const job = await jobRepo.createJob({
            userId: 'default_user',
            query: data.topic,
            status: EJobStatus.PENDING,
            metadata: {
                thought, 
                searchQueries: queries,
                format: data.topic,
                language: data.language,
                outputType: data.outputType,
                depth: data.depth,
                options: data.options,
            }
        });

        const jobId = job._id.toString();

        // 3. Transition to RESEARCHING
        await jobRepo.updateJobStatus(jobId, EJobStatus.RESEARCHING);
        publishJobEvent(jobId, { 
            type: 'status', 
            status: 'researching',
            thought 
        });

        // 4. Enqueue in BullMQ with strategic queries
        await crawlQueue.add(`crawl:${jobId}`, {
            jobId,
            query: data.topic,
            searchQueries: queries,
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
            message: thought, 
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

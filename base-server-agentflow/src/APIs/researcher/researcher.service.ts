import jobRepo from '../_shared/repo/agent-job.repository';
import finalRepo from '../_shared/repo/final-result.repository';
import { EJobStatus, EQueueName } from '../_shared/types/agents.interface';
import { createQueue } from '../../utils/queue';
import { publishJobEvent } from '../../utils/pubsub';
import { IResearchRequest, IResearchResponse, TResearchFormat } from './types';
import { planResearch } from './processors/planner';
import cache from '../../utils/cache';

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
                sources:      ['tavily', 'google'], // Added google as fallback if tavily is empty or has no key
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
        // 1. Autonomous Planning (Agent analyzes the prompt itself)
        const plan = await planResearch(data.topic);

        // Use AI detected values unless frontend explicitly overrides (optional)
        const finalFormat     = data.format     || plan.format;
        const finalLanguage   = data.language   || plan.language;
        const finalOutputType = data.outputType || plan.outputType;

        const { sources, outputFormat, intent } = resolveFormatConfig(finalFormat as any);

        // 2. Create Job in MongoDB
        const job = await jobRepo.createJob({
            userId: 'default_user',
            query: data.topic,
            status: EJobStatus.PENDING,
            metadata: {
                thought: plan.thought, 
                searchQueries: plan.queries,
                format: finalFormat,
                language: finalLanguage,
                outputType: finalOutputType,
                depth: data.depth,
            }
        });

        const jobId = job._id.toString();

        // 3. Transition to RESEARCHING
        await jobRepo.updateJobStatus(jobId, EJobStatus.RESEARCHING);
        publishJobEvent(jobId, { 
            type: 'status', 
            status: 'researching',
            thought: plan.thought 
        });

        if (plan.directAnswer) {
            // FAST-TRACK: Instantly return Chatbot-style answer!
            await jobRepo.updateJobStatus(jobId, EJobStatus.COMPLETED);
            const finalResult = await finalRepo.createFinalResult(jobId, {
                summary: plan.directAnswer,
                rankedList: [],
                bestResult: null
            });
            setTimeout(() => {
                publishJobEvent(jobId, { type: 'completed', results: finalResult });
            }, 500); // Small delay to let UI attach SSE
            return { jobId, status: 'completed' as any, message: 'Direct answer' };
        }

        // 4. Enqueue in BullMQ with strategic queries for deep web research
        await crawlQueue.add(`crawl:${jobId}`, {
            jobId,
            query: data.topic,
            searchQueries: plan.queries,
            format: finalFormat as any,
            language: finalLanguage,
            outputType: finalOutputType as any,
            sources,
            intent,
            outputFormat,
        });

        return {
            jobId,
            status: plan.thought as any,
            message: plan.thought, 
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

    async suggest(prompt: string): Promise<string[]> {
        const promptTrimmed = prompt?.trim();
        if (!promptTrimmed || promptTrimmed.length < 3) return [];
        
        try {
            const cacheKey = cache.buildKey('suggest', Buffer.from(promptTrimmed.toLowerCase()).toString('base64'));
            const cached = await cache.get<string[]>(cacheKey);
            if (cached) return cached;

            const openai = new (require('openai'))({ apiKey: process.env.OPENAI_API_KEY, timeout: 3000 });
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini', // Used mini model for lightning-fast keystroke suggestions
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a deep-research query architect. Given a partial or full topic, generate 5 diverse, highly specific, and distinct research angles or improved queries. Avoid generic repeats. Return ONLY a JSON array of strings.' 
                    },
                    { role: 'user', content: `Prompt: "${prompt}"` }
                ],
                response_format: { type: 'json_object' }
            });

            const parsed = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
            
            // Strictly extract an array from whatever format GPT chose to use
            let results: string[] = [];
            if (Array.isArray(parsed)) results = parsed;
            else if (Array.isArray(parsed.suggestions)) results = parsed.suggestions;
            else if (Array.isArray(parsed.queries)) results = parsed.queries;
            else if (typeof parsed === 'object') {
                const firstVal = Object.values(parsed)[0];
                if (Array.isArray(firstVal)) results = firstVal as string[];
                else results = Object.values(parsed).filter(v => typeof v === 'string') as string[];
            }
            
            const finalResults = results.slice(0, 3);
            await cache.set(cacheKey, finalResults, 3600 * 24); // Cache for 24 hours
            return finalResults;
        } catch (err) {
            return [];
        }
    }
}

import { Job } from 'bullmq';
import logger from '../../handlers/logger';
import { publishJobEvent } from '../../utils/pubsub';
import finalRepo from '../_shared/repo/final-result.repository';
import jobRepo from '../_shared/repo/agent-job.repository';
import { EJobStatus, IAgentJobPayload, IFinalResultData } from '../_shared/types/agents.interface';
import { filterByIntent, deduplicateAndFilter } from './processors/filter';
import { buildResponseContract, rankWithGemini } from './processors/ranker';

export class CriticService {
    async processCriticJob(job: Job<IAgentJobPayload>): Promise<{ jobId: string; ranked: number }> {
        const { jobId, mode, query, outputFormat, outputType, language, languageStyle, rawResults } = job.data;
        const dbJobId = job.data._id || jobId;

        logger.info(`Critic starting evaluation for job: ${jobId}`, { meta: { rawCount: rawResults?.length } });

        await jobRepo.updateJobStatus(dbJobId, EJobStatus.CRITIQUING);
        publishJobEvent(jobId, { type: 'status', status: 'critiquing', thought: 'summary' });

        const responseContract =
            job.data.responseContract ||
            buildResponseContract(
                mode || 'research',
                language || 'English',
                languageStyle || 'english',
                job.data.requestedQuantity || null,
                true
            );

        if (!rawResults || rawResults.length === 0) {
            const fallbackResult = buildNoResultsFallback(query, responseContract);
            await finalRepo.createFinalResult(dbJobId.toString(), fallbackResult);
            await jobRepo.updateJobStatus(dbJobId, EJobStatus.COMPLETED);
            publishJobEvent(jobId, { type: 'completed', results: fallbackResult });
            return { jobId, ranked: 0 };
        }

        const deduped = deduplicateAndFilter(rawResults);
        const filtered = filterByIntent(deduped, 'general', outputFormat || 'mixed');

        logger.info('Filtering done', { meta: { jobId, after: filtered.length, before: rawResults.length } });

        const evaluation = await rankWithGemini(
            query,
            mode || 'research',
            outputFormat || 'mixed',
            outputType || 'list',
            language || 'English',
            job.data.requestedQuantity || null,
            filtered,
            responseContract
        );

        await finalRepo.createFinalResult(dbJobId.toString(), evaluation);
        await jobRepo.updateJobStatus(dbJobId, EJobStatus.COMPLETED);
        publishJobEvent(jobId, { type: 'completed', results: evaluation });

        logger.info(`Critic evaluation completed for job: ${jobId}`);
        return { jobId, ranked: evaluation.rankedList.length };
    }
}

function buildNoResultsFallback(query: string, contract: NonNullable<IAgentJobPayload['responseContract']>): IFinalResultData {
    const summary = buildFallbackSummary(query, contract.mode, contract.language);

    return {
        bestResult: null,
        rankedList: [],
        summary,
        keyPoints: contract.sections,
        contract,
    };
}

function buildFallbackSummary(
    query: string,
    mode: NonNullable<IAgentJobPayload['responseContract']>['mode'],
    language: string
): string {
    const englishFallbacks: Record<NonNullable<IAgentJobPayload['responseContract']>['mode'], string> = {
        casual_chat: 'I am here and ready to help. Tell me what you would like to do next.',
        learning: `${query} is an important topic. I can still explain it step by step even when live sources are temporarily unavailable.`,
        knowledge: `${query} is a valid topic. I could not fetch web results just now, but I can still help with a practical explanation.`,
        research: `I could not gather live research sources for "${query}" right now. You can retry, or I can still provide a structured analysis based on built-in knowledge.`,
        resources: `I could not fetch the requested resources for "${query}" right now. Please retry, and I can also suggest a manual search strategy.`,
        leads: `I could not verify lead sources for "${query}" right now. Please retry, and I can still help refine the targeting criteria.`,
        scraping: `I could not gather live extraction references for "${query}" right now. I can still explain the best scraping method and workflow.`,
        business_strategy: `I could not fetch supporting market references for "${query}" right now. I can still help with a strategy framework.`,
        summary: `I could not fetch enough source material to summarize "${query}" right now.`,
        coding: `I could not gather external references for "${query}" right now, but I can still help reason through the coding task.`,
        comparison: `I could not fetch enough live data to compare "${query}" right now, but I can still give a structured comparison.`,
        planning: `I could not fetch supporting references for "${query}" right now, but I can still build a step-by-step plan.`,
    };

    if (language.toLowerCase().includes('roman urdu')) {
        return `${query} ke liye live sources abhi fetch nahi ho sake, lekin main phir bhi aap ko clear explanation ya next-step guidance de sakta hoon.`;
    }

    if (language.toLowerCase().includes('urdu')) {
        return `${query} کے لیے اس وقت لائیو ذرائع حاصل نہیں ہو سکے، لیکن میں پھر بھی آپ کو واضح وضاحت یا اگلے اقدامات بتا سکتا ہوں۔`;
    }

    if (language.toLowerCase().includes('hindi')) {
        return `${query} ke liye is waqt live sources fetch nahin ho sake, lekin main fir bhi aapko clear explanation ya next steps de sakta hoon.`;
    }

    return englishFallbacks[mode];
}

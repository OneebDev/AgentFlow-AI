import { NextFunction, Request, Response } from 'express';
import httpResponse from '../../handlers/httpResponse';
import httpError from '../../handlers/errorHandler/httpError';
import { validateSchema } from '../../utils/joi-validate';
import asyncHandler from '../../handlers/async';
import { startResearchSchema } from './validation';
import { ResearcherService } from './researcher.service';
import { IResearchRequest } from './types';
import { CustomError } from '../../utils/errors';
import { subscribeToJob } from '../../utils/pubsub';
import jobRepo from '../_shared/repo/agent-job.repository';
import finalRepo from '../_shared/repo/final-result.repository';
import { EJobStatus } from '../_shared/types/agents.interface';

const researcherService = new ResearcherService();

/**
 * Build a list of missing required clarification fields.
 * Returns an empty array if all fields are present.
 */
function getMissingClarifications(payload: IResearchRequest): string[] {
    const missing: string[] = [];
    if (!payload.format) missing.push('format — one of: articles | videos | products | news');
    if (!payload.language) missing.push('language — e.g. English, Urdu, Hindi');
    if (!payload.outputType) missing.push('outputType — one of: summary | list');
    return missing;
}

export default {
    start: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const { body } = request;

            // Payload validation
            const { error, payload } = validateSchema<IResearchRequest>(startResearchSchema, body);
            if (error) {
                return httpError(next, error, request, 422);
            }

            // ── Clarification Gate ────────────────────────────────────────────
            // Before dispatching to any agent, all three fields must be present.
            // If any are missing, stop here and ask the user — do NOT queue a job.
            const missing = getMissingClarifications(payload);
            if (missing.length > 0) {
                return httpResponse(response, request, 200, 'Clarification needed before research can begin', {
                    status: 'clarification_needed',
                    message: '❓ Please provide the missing information to proceed:',
                    missing,
                    hint: 'Re-submit your request with all three fields filled in.',
                });
            }
            // ─────────────────────────────────────────────────────────────────

            const result = await researcherService.initiateResearch(payload);
            httpResponse(response, request, 202, 'Research job initiated successfully', result);
        } catch (error: any) {
            if (error instanceof CustomError) {
                httpError(next, error, request, error.statusCode);
            } else {
                httpError(next, error, request, 500);
            }
        }
    }),

    status: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const { jobId } = request.params;
            if (!jobId) {
                return httpError(next, new Error('JobID is required'), request, 400);
            }

            const result = await researcherService.getStatus(jobId);
            httpResponse(response, request, 200, 'Job status retrieved', result);
        } catch (error) {
            httpError(next, error, request, 500);
        }
    }),

    results: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const { jobId } = request.params;
            if (!jobId) {
                return httpError(next, new Error('JobID is required'), request, 400);
            }

            const result = await researcherService.getResults(jobId);
            httpResponse(response, request, 200, 'Final results retrieved', result);
        } catch (error) {
            httpError(next, error, request, 500);
        }
    }),

    /**
     * SSE stream — real-time job events pushed to the browser.
     * Replaces polling entirely. The client opens this once after
     * job creation and receives instant status transitions:
     *   { type: 'status',    status: 'researching' | 'crawling' | 'critiquing' }
     *   { type: 'completed', results: { rankedList, bestResult, summary } }
     *   { type: 'failed',    error: string }
     */
    stream: async (request: Request, response: Response, next: NextFunction) => {
        const { jobId } = request.params;
        if (!jobId) return httpError(next, new Error('JobID is required'), request, 400);

        // SSE headers — must be set before any write
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
        response.flushHeaders();

        const send = (data: Record<string, unknown>) => {
            response.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Snapshot current state immediately so the client never misses a
        // transition that happened before the SSE connection was opened.
        try {
            const job = await jobRepo.findJobById(jobId);
            if (!job) {
                send({ type: 'failed', error: 'Job not found' });
                return response.end();
            }

            const currentStatus = job.status.toLowerCase();
            send({ type: 'status', status: currentStatus });

            if (job.status === EJobStatus.COMPLETED) {
                const results = await finalRepo.findByJobId(jobId);
                send({ type: 'completed', results });
                return response.end();
            }
            if (job.status === EJobStatus.FAILED) {
                send({ type: 'failed', error: job.errorMessage || 'Job failed' });
                return response.end();
            }
        } catch (err) {
            send({ type: 'failed', error: 'Could not read job state' });
            return response.end();
        }

        // Subscribe to live Redis events for this job
        const unsubscribe = subscribeToJob(jobId, (event) => {
            send(event);
            if (event['type'] === 'completed' || event['type'] === 'failed') {
                cleanup();
                response.end();
            }
        });

        // Heartbeat keeps the connection alive through proxies / firewalls (15 s)
        const heartbeat = setInterval(() => {
            response.write(': ping\n\n');
        }, 15000);

        const cleanup = () => {
            clearInterval(heartbeat);
            unsubscribe();
        };

        // Client disconnected (tab closed, navigate away, etc.)
        request.on('close', cleanup);
    },
};

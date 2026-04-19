import { NextFunction, Request, Response } from 'express';
import asyncHandler from '../../handlers/async';
import httpError from '../../handlers/errorHandler/httpError';
import httpResponse from '../../handlers/httpResponse';
import { CustomError } from '../../utils/errors';
import { validateSchema } from '../../utils/joi-validate';
import jobRepo from '../_shared/repo/agent-job.repository';
import { TJobEvent } from '../_shared/types/agents.interface';
import { ResearcherService } from './researcher.service';
import { IResearchRequest } from './types';
import { startResearchSchema } from './validation';
import { subscribeToJob } from '../../utils/pubsub';

const researcherService = new ResearcherService();

export default {
    start: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const { error, payload } = validateSchema<IResearchRequest>(startResearchSchema, request.body);
            if (error) {
                return httpError(next, error, request, 422);
            }

            const result = await researcherService.initiateResearch(payload);
            httpResponse(response, request, 202, 'Research job initiated successfully', result);
        } catch (error: unknown) {
            if (error instanceof CustomError) {
                httpError(next, error, request, error.statusCode);
            } else {
                httpError(next, error, request, 500);
            }
        }
    }),

    status: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        const { jobId } = request.params;
        if (!jobId) {
            return httpError(next, new Error('JobID is required'), request, 400);
        }

        const result = await researcherService.getStatus(jobId);
        httpResponse(response, request, 200, 'Job status retrieved', result);
    }),

    results: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        const { jobId } = request.params;
        if (!jobId) {
            return httpError(next, new Error('JobID is required'), request, 400);
        }

        const result = await researcherService.getResults(jobId);
        httpResponse(response, request, 200, 'Final results retrieved', result);
    }),

    stream: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        const { jobId } = request.params;
        if (!jobId) {
            return httpError(next, new Error('JobID is required'), request, 400);
        }

        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no');
        response.flushHeaders();

        const send = (data: TJobEvent): void => {
            response.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        try {
            const job = await jobRepo.findJobById(jobId);
            if (!job) {
                send({ type: 'failed', error: 'Job not found' });
                return response.end();
            }

            send({ type: 'status', status: mapStreamStatus(job.status) });

            if (job.status === 'COMPLETED') {
                send({ type: 'completed', results: await researcherService.getResults(jobId) });
                return response.end();
            }
            if (job.status === 'FAILED') {
                send({ type: 'failed', error: job.errorMessage || 'Job failed' });
                return response.end();
            }
        } catch {
            send({ type: 'failed', error: 'Could not read job state' });
            return response.end();
        }

        const unsubscribe = subscribeToJob(jobId, (event) => {
            send(event);
            if (event.type === 'completed' || event.type === 'failed') {
                cleanup();
                response.end();
            }
        });

        const heartbeat = setInterval(() => {
            response.write(': ping\n\n');
        }, 15000);

        const cleanup = (): void => {
            clearInterval(heartbeat);
            unsubscribe();
        };

        request.on('close', cleanup);
    }),

    suggest: asyncHandler(async (request: Request, response: Response) => {
        const { q } = request.query;
        if (typeof q !== 'string') {
            return httpResponse(response, request, 200, 'Empty prompt', []);
        }

        const suggestions = await researcherService.suggest(q);
        httpResponse(response, request, 200, 'Suggestions retrieved', suggestions);
    }),
};

function mapStreamStatus(status: string): 'researching' | 'crawling' | 'critiquing' {
    switch (status) {
        case 'CRAWLING':
            return 'crawling';
        case 'CRITIQUING':
            return 'critiquing';
        case 'RESEARCHING':
        case 'PENDING':
        case 'COMPLETED':
        case 'FAILED':
        default:
            return 'researching';
    }
}

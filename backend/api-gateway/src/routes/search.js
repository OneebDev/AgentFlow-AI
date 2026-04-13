/**
 * Search routes
 *
 * POST /api/v1/search          — submit a new search job
 * GET  /api/v1/search/:jobId   — poll job status + results
 * GET  /api/v1/search/:jobId/ws — WebSocket stream (handled in websocket plugin)
 */

'use strict';

const { v4: uuidv4 }        = require('uuid');
const { createLogger }       = require('@agentflow/shared/logger');
const { query }              = require('@agentflow/shared/db');
const { get: cacheGet }      = require('@agentflow/shared/cache');
const { QueueName, JobStatus, createJobPayload } = require('@agentflow/shared/types');

const log = createLogger('api-gateway:search');

const submitSchema = {
  body: {
    type: 'object',
    required: ['query'],
    properties: {
      query:  { type: 'string', minLength: 2, maxLength: 500 },
      userId: { type: 'string', maxLength: 255 },
    },
  },
};

async function searchRoutes(fastify) {
  /**
   * POST /api/v1/search
   * Accepts a user query, persists a job record, enqueues it for the Researcher.
   */
  fastify.post('/', { schema: submitSchema }, async (request, reply) => {
    const { query: userQuery, userId = 'anonymous' } = request.body;
    const jobId = uuidv4();

    // Persist job to DB
    await query(
      `INSERT INTO search_jobs (id, user_id, query, status) VALUES ($1, $2, $3, $4)`,
      [jobId, userId, userQuery, JobStatus.PENDING]
    );

    // Enqueue for Researcher Agent
    const payload = createJobPayload(jobId, userId, userQuery);
    await fastify.researchQueue.add(`research:${jobId}`, payload, { jobId });

    log.info({ jobId, userId }, 'Search job enqueued');

    reply.status(202).send({
      jobId,
      status: JobStatus.PENDING,
      message: 'Job accepted. Connect to WebSocket or poll /api/v1/search/:jobId for updates.',
      wsUrl: `/api/v1/search/${jobId}/ws`,
    });
  });

  /**
   * GET /api/v1/search/:jobId
   * Returns current status and results if completed.
   */
  fastify.get('/:jobId', async (request, reply) => {
    const { jobId } = request.params;

    // Try cache first for completed jobs
    const cached = await cacheGet(`results:${jobId}`);
    if (cached) return reply.send(cached);

    const jobResult = await query(
      `SELECT j.id, j.status, j.error_message, j.created_at, j.updated_at,
              f.best_result, f.ranked_list, f.summary, f.completed_at
       FROM search_jobs j
       LEFT JOIN final_results f ON f.job_id = j.id
       WHERE j.id = $1`,
      [jobId]
    );

    if (jobResult.rowCount === 0) {
      return reply.status(404).send({ error: 'Not Found', message: `Job ${jobId} not found` });
    }

    const row = jobResult.rows[0];
    return reply.send({
      jobId:        row.id,
      status:       row.status,
      errorMessage: row.error_message,
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
      results: row.best_result ? {
        bestResult:  row.best_result,
        rankedList:  row.ranked_list,
        summary:     row.summary,
        completedAt: row.completed_at,
      } : null,
    });
  });
}

module.exports = searchRoutes;

/**
 * Orchestration Controller
 *
 * The controller is the brain of the pipeline. It:
 *   1. Listens on the `results-queue` (Critic output)
 *   2. Persists final results to DB + cache
 *   3. Updates job status through each lifecycle transition
 *
 * It does NOT re-fan work — each agent consumes its own queue and
 * publishes to the next. The controller just closes the loop and
 * updates the status ledger (Postgres + Redis).
 *
 * Pipeline: research-queue → crawler-queue → critic-queue → results-queue
 *           [Researcher]     [Crawler]        [Critic]       [Orchestrator writes]
 */

'use strict';

const { createWorker, createQueue } = require('@agentflow/shared/queue');
const { query }                     = require('@agentflow/shared/db');
const { set: cacheSet }             = require('@agentflow/shared/cache');
const { QueueName, JobStatus }      = require('@agentflow/shared/types');
const { createLogger }              = require('@agentflow/shared/logger');

const log = createLogger('orchestrator');

const RESULT_CACHE_TTL = 3600; // 1 hour

/**
 * Processes jobs arriving on results-queue (emitted by Critic Agent).
 * Persists final output and marks the job complete.
 *
 * @param {import('bullmq').Job} job
 */
async function processResultJob(job) {
  const { jobId, bestResult, rankedList, summary } = job.data;

  log.info({ jobId }, 'Orchestrator: finalising results');

  // 1. Persist final results
  await query(
    `INSERT INTO final_results (job_id, best_result, ranked_list, summary)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [jobId, JSON.stringify(bestResult), JSON.stringify(rankedList), summary]
  );

  // 2. Mark job completed
  await query(
    `UPDATE search_jobs SET status = $1 WHERE id = $2`,
    [JobStatus.COMPLETED, jobId]
  );

  // 3. Cache result for fast polling / WS delivery
  const cachePayload = {
    jobId,
    status: JobStatus.COMPLETED,
    results: { bestResult, rankedList, summary },
  };
  await cacheSet(`results:${jobId}`, cachePayload, RESULT_CACHE_TTL);

  log.info({ jobId }, 'Orchestrator: job completed and cached');
}

/**
 * Handles failed jobs from any queue — marks the DB record as FAILED.
 * Called by each worker's `failed` event handler.
 *
 * @param {string} jobId
 * @param {string} reason
 */
async function handleJobFailure(jobId, reason) {
  log.error({ jobId, reason }, 'Orchestrator: marking job FAILED');
  try {
    await query(
      `UPDATE search_jobs SET status = $1, error_message = $2 WHERE id = $3`,
      [JobStatus.FAILED, reason, jobId]
    );
  } catch (err) {
    log.error({ err, jobId }, 'Orchestrator: could not update failure status');
  }
}

function startController() {
  // ─── Results worker (closes the pipeline) ─────────────────────────────────
  const resultsWorker = createWorker(QueueName.RESULTS, processResultJob, {
    concurrency: 10,
  });

  resultsWorker.on('failed', (job, err) => {
    if (job?.data?.jobId) handleJobFailure(job.data.jobId, err.message);
  });

  log.info('Orchestrator controller running');
  return { resultsWorker };
}

module.exports = { startController, handleJobFailure };

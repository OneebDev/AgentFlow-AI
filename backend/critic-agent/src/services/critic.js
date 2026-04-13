/**
 * Critic Service
 *
 * Consumes jobs from `critic-queue`, filters + ranks results via Gemini,
 * then publishes the final output to `results-queue` for the Orchestrator.
 */

'use strict';

const { createWorker, createQueue } = require('@agentflow/shared/queue');
const { query }                     = require('@agentflow/shared/db');
const { QueueName, JobStatus }      = require('@agentflow/shared/types');
const { createLogger }              = require('@agentflow/shared/logger');
const { deduplicateAndFilter, filterByIntent } = require('../processors/filter');
const { rankWithGemini }            = require('../processors/ranker');

const log = createLogger('critic-agent');

const resultsQueue = createQueue(QueueName.RESULTS);

/**
 * @param {import('bullmq').Job} job
 */
async function processCriticJob(job) {
  const {
    jobId, originalQuery,
    intent, outputFormat, rawResults,
  } = job.data;

  log.info({ jobId, rawCount: rawResults.length }, 'Critic: starting evaluation');

  // Update job status
  await query(
    `UPDATE search_jobs SET status = $1 WHERE id = $2`,
    [JobStatus.CRITIQUING, jobId]
  );

  // ─── Filter ───────────────────────────────────────────────────────────────
  const deduped   = deduplicateAndFilter(rawResults);
  const filtered  = filterByIntent(deduped, intent, outputFormat);

  log.info({ jobId, after: filtered.length, before: rawResults.length }, 'Filtering done');

  // ─── Rank with Gemini ─────────────────────────────────────────────────────
  const { rankedList, bestResult, summary } = await rankWithGemini(
    originalQuery, intent, outputFormat, filtered
  );

  // ─── Publish to results-queue ─────────────────────────────────────────────
  await resultsQueue.add(`results:${jobId}`, {
    jobId,
    bestResult,
    rankedList,
    summary,
  }, { jobId });

  log.info({ jobId }, 'Critic: results published to results-queue');
  return { jobId, ranked: rankedList.length };
}

function startCritic() {
  const worker = createWorker(QueueName.CRITIC, processCriticJob, {
    concurrency: 5,
  });

  worker.on('failed', async (job, err) => {
    if (!job?.data?.jobId) return;
    log.error({ jobId: job.data.jobId, err }, 'Critic job failed');
    await query(
      `UPDATE search_jobs SET status = $1, error_message = $2 WHERE id = $3`,
      [JobStatus.FAILED, err.message, job.data.jobId]
    ).catch(() => {});
  });

  log.info('Critic Agent worker started');
  return worker;
}

module.exports = { startCritic };

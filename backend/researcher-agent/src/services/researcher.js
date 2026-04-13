/**
 * Researcher Service
 *
 * Consumes jobs from `research-queue`, calls the Claude query processor,
 * persists the research plan, then enqueues the plan onto `crawl-queue`.
 */

'use strict';

const { createWorker, createQueue } = require('@agentflow/shared/queue');
const { query }                     = require('@agentflow/shared/db');
const { QueueName, JobStatus }      = require('@agentflow/shared/types');
const { createLogger }              = require('@agentflow/shared/logger');
const { analyseQuery }              = require('../processors/queryProcessor');

const log = createLogger('researcher-agent');

const crawlQueue = createQueue(QueueName.CRAWL);

/**
 * BullMQ processor function — receives a research job and outputs a crawl plan.
 * @param {import('bullmq').Job} job
 */
async function processResearchJob(job) {
  const { jobId, userId, query: userQuery } = job.data;

  log.info({ jobId }, 'Starting research');

  // 1. Mark job as RESEARCHING in DB
  await query(
    `UPDATE search_jobs SET status = $1 WHERE id = $2`,
    [JobStatus.RESEARCHING, jobId]
  );

  // 2. Analyse query with Claude
  const plan = await analyseQuery(userQuery);

  // 3. Persist research plan
  await query(
    `INSERT INTO research_plans (job_id, intent, output_format, search_queries, sources)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      jobId,
      plan.intent,
      plan.outputFormat,
      JSON.stringify(plan.searchQueries),
      JSON.stringify(plan.sources),
    ]
  );

  // 4. Enqueue crawl job with the plan
  const crawlPayload = {
    jobId,
    userId,
    originalQuery: userQuery,
    intent:        plan.intent,
    outputFormat:  plan.outputFormat,
    searchQueries: plan.searchQueries,
    sources:       plan.sources,
  };

  await crawlQueue.add(`crawl:${jobId}`, crawlPayload, { jobId });

  log.info({ jobId, intent: plan.intent }, 'Research complete — crawl job enqueued');
  return { jobId, plan };
}

function startResearcher() {
  const worker = createWorker(QueueName.RESEARCH, processResearchJob, {
    concurrency: 5,
  });

  worker.on('failed', async (job, err) => {
    if (!job?.data?.jobId) return;
    log.error({ jobId: job.data.jobId, err }, 'Research job failed');
    await query(
      `UPDATE search_jobs SET status = $1, error_message = $2 WHERE id = $3`,
      [JobStatus.FAILED, err.message, job.data.jobId]
    ).catch(() => {});
  });

  log.info('Researcher Agent worker started');
  return worker;
}

module.exports = { startResearcher };

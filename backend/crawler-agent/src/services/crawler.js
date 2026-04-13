/**
 * Crawler Service
 *
 * Consumes jobs from `crawl-queue`, dispatches to the appropriate fetchers
 * based on the research plan's `sources` array, persists raw results,
 * then enqueues a critic job.
 */

'use strict';

const { createWorker, createQueue } = require('@agentflow/shared/queue');
const { query }                     = require('@agentflow/shared/db');
const { QueueName, JobStatus }      = require('@agentflow/shared/types');
const { createLogger }              = require('@agentflow/shared/logger');
const { fetchYouTube }              = require('../fetchers/youtube');
const { fetchGoogle }               = require('../fetchers/google');
const { scrapeUrls }                = require('../fetchers/scraper');

const log = createLogger('crawler-agent');

const criticQueue = createQueue(QueueName.CRITIC);

/**
 * @param {import('bullmq').Job} job
 */
async function processCrawlJob(job) {
  const {
    jobId, userId, originalQuery,
    intent, outputFormat,
    searchQueries, sources,
  } = job.data;

  log.info({ jobId, sources }, 'Starting crawl');

  // Update job status
  await query(
    `UPDATE search_jobs SET status = $1 WHERE id = $2`,
    [JobStatus.CRAWLING, jobId]
  );

  // ─── Dispatch fetchers in parallel ──────────────────────────────────────
  const fetchTasks = [];

  if (sources.includes('youtube')) {
    fetchTasks.push(fetchYouTube(searchQueries).then((r) => ({ type: 'youtube', results: r })));
  }
  if (sources.includes('google')) {
    fetchTasks.push(fetchGoogle(searchQueries).then((r) => ({ type: 'google', results: r })));
  }
  if (sources.includes('scraper')) {
    // Scrape first page of Google results
    const googleData = await fetchGoogle(searchQueries.slice(0, 2), 3);
    const urls = googleData.map((r) => r.url).filter(Boolean).slice(0, 6);
    fetchTasks.push(scrapeUrls(urls).then((r) => ({ type: 'scraper', results: r })));
  }

  const settled = await Promise.allSettled(fetchTasks);

  const rawResults = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled' && outcome.value.results.length) {
      rawResults.push(...outcome.value.results);
      // Persist per source type
      await query(
        `INSERT INTO crawl_results (job_id, source_type, raw_data) VALUES ($1, $2, $3)`,
        [jobId, outcome.value.type, JSON.stringify(outcome.value.results)]
      );
    } else if (outcome.status === 'rejected') {
      log.error({ err: outcome.reason, jobId }, 'Fetcher error (non-fatal)');
    }
  }

  log.info({ jobId, totalResults: rawResults.length }, 'Crawl complete — enqueuing critic job');

  // ─── Enqueue Critic ────────────────────────────────────────────────────
  await criticQueue.add(`critic:${jobId}`, {
    jobId,
    userId,
    originalQuery,
    intent,
    outputFormat,
    rawResults,
  }, { jobId });

  return { jobId, resultCount: rawResults.length };
}

function startCrawler() {
  const worker = createWorker(QueueName.CRAWL, processCrawlJob, {
    concurrency: 3,   // crawling is I/O heavy; keep concurrency moderate
  });

  worker.on('failed', async (job, err) => {
    if (!job?.data?.jobId) return;
    log.error({ jobId: job.data.jobId, err }, 'Crawl job failed');
    await query(
      `UPDATE search_jobs SET status = $1, error_message = $2 WHERE id = $3`,
      [JobStatus.FAILED, err.message, job.data.jobId]
    ).catch(() => {});
  });

  log.info('Crawler Agent worker started');
  return worker;
}

module.exports = { startCrawler };

/**
 * @agentflow/shared/queue
 * BullMQ queue factory.  Returns Queue, Worker, and QueueEvents instances
 * with consistent Redis connection config and default job options.
 */

'use strict';

const { Queue, Worker, QueueEvents } = require('bullmq');
const { createLogger } = require('../logger');

const log = createLogger('queue');

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const DEFAULT_JOB_OPTIONS = {
  attempts: parseInt(process.env.QUEUE_ATTEMPTS || '3', 10),
  backoff: {
    type: 'exponential',
    delay: parseInt(process.env.QUEUE_BACKOFF_DELAY_MS || '5000', 10),
  },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
  timeout: parseInt(process.env.JOB_TIMEOUT_MS || '120000', 10),
};

/**
 * Create (or reuse) a BullMQ Queue.
 * @param {string} name  Queue name from QueueName constants
 * @returns {Queue}
 */
function createQueue(name) {
  const q = new Queue(name, {
    connection: redisConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  log.info({ queue: name }, 'Queue initialised');
  return q;
}

/**
 * Create a BullMQ Worker.
 * @param {string} name        Queue name
 * @param {Function} processor async (job) => result
 * @param {object} [options]   Extra Worker options (e.g. concurrency)
 * @returns {Worker}
 */
function createWorker(name, processor, options = {}) {
  const worker = new Worker(name, processor, {
    connection: redisConnection,
    concurrency: options.concurrency || 5,
    ...options,
  });

  worker.on('completed', (job) =>
    log.info({ queue: name, jobId: job.id }, 'Job completed'));
  worker.on('failed', (job, err) =>
    log.error({ queue: name, jobId: job?.id, err }, 'Job failed'));
  worker.on('error', (err) =>
    log.error({ queue: name, err }, 'Worker error'));

  log.info({ queue: name }, 'Worker started');
  return worker;
}

/**
 * Create QueueEvents for listening to queue-level events.
 * @param {string} name
 * @returns {QueueEvents}
 */
function createQueueEvents(name) {
  return new QueueEvents(name, { connection: redisConnection });
}

module.exports = { createQueue, createWorker, createQueueEvents, redisConnection };

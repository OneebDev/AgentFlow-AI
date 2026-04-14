import { Queue, Worker, QueueEvents, Job, DefaultJobOptions, WorkerOptions } from 'bullmq';
import logger from '../handlers/logger';

const redisConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
    attempts: parseInt(process.env.QUEUE_ATTEMPTS || '3', 10),
    backoff: {
        type: 'exponential',
        delay: parseInt(process.env.QUEUE_BACKOFF_DELAY_MS || '5000', 10),
    },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
};

/**
 * Create a BullMQ Queue.
 */
export function createQueue(name: string): Queue {
    const q = new Queue(name, {
        connection: redisConnection,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    logger.info(`Queue initialized: ${name}`);
    return q;
}

/**
 * Create a BullMQ Worker.
 */
export function createWorker(
    name: string,
    processor: (job: Job) => Promise<any>,
    options: Partial<WorkerOptions> = {}
): Worker {
    const worker = new Worker(name, processor, {
        connection: redisConnection,
        concurrency: options.concurrency || 5,
        ...options,
    });

    worker.on('completed', (job) => logger.info(`Job completed [${name}]`, { meta: { jobId: job.id } }));
    worker.on('failed', (job, err) => logger.error(`Job failed [${name}]`, { meta: { jobId: job?.id, err } }));
    worker.on('error', (err) => logger.error(`Worker error [${name}]`, { meta: { err } }));

    logger.info(`Worker started: ${name}`);
    return worker;
}

/**
 * Create QueueEvents.
 */
export function createQueueEvents(name: string): QueueEvents {
    return new QueueEvents(name, { connection: redisConnection });
}

/**
 * Redis Pub/Sub — real-time job event bus.
 *
 * Workers call publishJobEvent() to announce status changes.
 * The SSE stream endpoint calls subscribeToJob() to forward
 * those events to the browser instantly — no polling needed.
 *
 * ioredis requires a dedicated connection for subscribe mode,
 * so publisher and subscriber are always separate clients.
 */
import Redis from 'ioredis';
import logger from '../handlers/logger';
import { TJobEvent } from '../APIs/_shared/types/agents.interface';

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
};

// One shared publisher client for all outbound events.
let publisherClient: Redis | null = null;

function getPublisher(): Redis {
    if (!publisherClient) {
        publisherClient = new Redis(redisConfig);
        publisherClient.on('error', (err) => logger.error('PubSub publisher error', { meta: err }));
    }
    return publisherClient;
}

/**
 * Publish a job event to all SSE subscribers watching this jobId.
 * Fire-and-forget — workers must not block on this call.
 */
export function publishJobEvent(jobId: string, event: TJobEvent): void {
    const channel = `job:${jobId}`;
    getPublisher()
        .publish(channel, JSON.stringify(event))
        .catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error('PubSub publish failed', { meta: { err: errorMessage, jobId } });
        });
}

/**
 * Subscribe to all events for a given jobId.
 * Returns a cleanup function — call it when the SSE connection closes.
 */
export function subscribeToJob(
    jobId: string,
    onMessage: (event: TJobEvent) => void
): () => void {
    // Each subscriber needs its own dedicated connection.
    const sub = new Redis(redisConfig);
    const channel = `job:${jobId}`;

    sub.subscribe(channel).catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('PubSub subscribe failed', { meta: { err: errorMessage, jobId } });
    });

    sub.on('message', (_ch: string, raw: string) => {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (isJobEvent(parsed)) {
                onMessage(parsed);
            }
        } catch {
            // malformed message — ignore
        }
    });

    sub.on('error', (err) => logger.error('PubSub subscriber error', { meta: { err, jobId } }));

    return () => {
        sub.unsubscribe(channel).catch(() => {});
        sub.quit().catch(() => {});
    };
}

function isJobEvent(value: unknown): value is TJobEvent {
    if (!value || typeof value !== 'object' || !('type' in value)) {
        return false;
    }

    const event = value as { type?: unknown };
    return typeof event.type === 'string';
}

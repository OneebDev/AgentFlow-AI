import Redis from 'ioredis';
import logger from '../handlers/logger';

const DEFAULT_TTL_SECONDS = 3600;

let client: Redis | null = null;

const getClient = (): Redis => {
    if (!client) {
        client = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
            lazyConnect: false,
        });

        client.on('connect', () => logger.info('Redis cache connected'));
        client.on('error', (err) => logger.error('Redis cache error', { meta: err }));
    }
    return client;
};

export default {
    get: async <T>(key: string): Promise<T | null> => {
        const raw = await getClient().get(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return raw as unknown as T;
        }
    },

    set: async (key: string, value: any, ttl: number = DEFAULT_TTL_SECONDS): Promise<void> => {
        const serialised = typeof value === 'string' ? value : JSON.stringify(value);
        await getClient().setex(key, ttl, serialised);
    },

    del: async (key: string): Promise<void> => {
        await getClient().del(key);
    },

    buildKey: (namespace: string, ...parts: string[]): string => {
        return [namespace, ...parts].join(':');
    },

    getClient,
};

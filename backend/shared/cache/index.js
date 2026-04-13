/**
 * @agentflow/shared/cache
 * Redis-backed cache with get/set/del helpers.
 * Default TTL is 1 hour; callers may override per call.
 */

'use strict';

const Redis = require('ioredis');
const { createLogger } = require('../logger');

const log = createLogger('cache');
const DEFAULT_TTL_SECONDS = 3600;

let client;

function getClient() {
  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on('connect', () => log.info('Redis cache connected'));
    client.on('error', (err) => log.error({ err }, 'Redis cache error'));
  }
  return client;
}

/**
 * @param {string} key
 * @returns {Promise<object|null>}
 */
async function get(key) {
  const raw = await getClient().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * @param {string} key
 * @param {*} value
 * @param {number} [ttl]  seconds
 */
async function set(key, value, ttl = DEFAULT_TTL_SECONDS) {
  const serialised = typeof value === 'string' ? value : JSON.stringify(value);
  await getClient().setex(key, ttl, serialised);
}

/** @param {string} key */
async function del(key) {
  await getClient().del(key);
}

/** Build a namespaced cache key */
function buildKey(namespace, ...parts) {
  return [namespace, ...parts].join(':');
}

module.exports = { get, set, del, buildKey, getClient };

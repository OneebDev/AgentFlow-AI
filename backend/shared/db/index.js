/**
 * @agentflow/shared/db
 * PostgreSQL connection pool.  All services that need persistence
 * import this module and call `query()` directly.
 */

'use strict';

const { Pool } = require('pg');
const { createLogger } = require('../logger');

const log = createLogger('db');

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB       || 'agentflow',
  user:     process.env.POSTGRES_USER     || 'agentflow',
  password: process.env.POSTGRES_PASSWORD || 'agentflow_secret',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => log.debug('DB pool: new client connected'));
pool.on('error', (err) => log.error({ err }, 'DB pool idle client error'));

/**
 * Execute a parameterised query.
 * @param {string} text    SQL with $1, $2 … placeholders
 * @param {Array}  [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    log.debug({ duration: Date.now() - start, rows: result.rowCount }, 'DB query');
    return result;
  } catch (err) {
    log.error({ err, text }, 'DB query error');
    throw err;
  }
}

/** Checkout a client for multi-statement transactions */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };

'use strict';

const { pool }        = require('@agentflow/shared/db');
const { getClient }   = require('@agentflow/shared/cache');

async function healthRoutes(fastify) {
  fastify.get('/', async (_request, reply) => {
    const checks = { postgres: 'ok', redis: 'ok' };

    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch {
      checks.postgres = 'error';
    }

    try {
      await getClient().ping();
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = healthRoutes;

/**
 * API Gateway — entry point
 *
 * Responsibilities:
 *  - Accept HTTP + WebSocket connections from the frontend
 *  - Validate & authenticate requests
 *  - Enqueue search jobs onto research-queue
 *  - Stream job status updates back via WebSocket
 *  - Expose a REST endpoint for polling job results
 */

'use strict';

require('dotenv').config();

const Fastify = require('fastify');
const { createLogger }    = require('@agentflow/shared/logger');
const { createQueue, createQueueEvents } = require('@agentflow/shared/queue');
const { QueueName }       = require('@agentflow/shared/types');

const searchRoutes  = require('./routes/search');
const healthRoutes  = require('./routes/health');
const wsPlugin      = require('./plugins/websocket');

const log = createLogger('api-gateway');

async function buildApp() {
  const app = Fastify({
    logger: false,   // we use pino directly
    trustProxy: true,
  });

  // ─── Plugins ──────────────────────────────────────────────────────────────
  await app.register(require('@fastify/cors'), {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  });

  await app.register(require('@fastify/rate-limit'), {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
      statusCode: 429,
    }),
  });

  // Swagger docs (dev only)
  if (process.env.NODE_ENV !== 'production') {
    await app.register(require('@fastify/swagger'), {
      openapi: {
        info: { title: 'AgentFlow AI API', version: '1.0.0' },
      },
    });
    await app.register(require('@fastify/swagger-ui'), {
      routePrefix: '/docs',
    });
  }

  // WebSocket plugin (for real-time job status)
  await app.register(wsPlugin);

  // ─── Shared dependencies ──────────────────────────────────────────────────
  const researchQueue = createQueue(QueueName.RESEARCH);
  const resultsEvents = createQueueEvents(QueueName.RESULTS);

  // Decorate app so routes can access them
  app.decorate('researchQueue', researchQueue);
  app.decorate('resultsEvents', resultsEvents);

  // ─── Routes ───────────────────────────────────────────────────────────────
  await app.register(healthRoutes,  { prefix: '/health' });
  await app.register(searchRoutes,  { prefix: '/api/v1/search' });

  // ─── Global error handler ─────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    log.error({ err: error, url: request.url }, 'Unhandled error');
    reply.status(error.statusCode || 500).send({
      error:   error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
    });
  });

  return app;
}

async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '3000', 10);

  try {
    await app.listen({ port, host: '0.0.0.0' });
    log.info({ port }, 'API Gateway listening');
  } catch (err) {
    log.fatal({ err }, 'Failed to start API Gateway');
    process.exit(1);
  }

  const shutdown = async (signal) => {
    log.info({ signal }, 'Shutting down…');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start();

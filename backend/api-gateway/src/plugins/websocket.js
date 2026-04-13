/**
 * WebSocket plugin
 *
 * Clients connect to: ws://host/api/v1/search/:jobId/ws
 * The gateway subscribes to BullMQ QueueEvents for `results-queue` and
 * pushes status updates to connected clients as JSON frames.
 *
 * Message shape sent to clients:
 *   { type: 'status', jobId, status }
 *   { type: 'completed', jobId, results }
 *   { type: 'failed', jobId, error }
 */

'use strict';

const { createLogger }      = require('@agentflow/shared/logger');
const { createQueueEvents } = require('@agentflow/shared/queue');
const { QueueName }         = require('@agentflow/shared/types');
const { get: cacheGet }     = require('@agentflow/shared/cache');

const log = createLogger('api-gateway:ws');

// Map<jobId, Set<WebSocket>>
const subscribers = new Map();

async function wsPlugin(fastify) {
  await fastify.register(require('@fastify/websocket'));

  // ─── Subscribe to all queue events once ──────────────────────────────────
  const researchEvents = createQueueEvents(QueueName.RESEARCH);
  const crawlEvents    = createQueueEvents(QueueName.CRAWL);
  const criticEvents   = createQueueEvents(QueueName.CRITIC);
  const resultsEvents  = createQueueEvents(QueueName.RESULTS);

  function broadcast(jobId, message) {
    const sockets = subscribers.get(jobId);
    if (!sockets) return;
    const payload = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(payload);
      }
    }
  }

  researchEvents.on('active',   ({ jobId }) => broadcast(jobId, { type: 'status', jobId, status: 'RESEARCHING' }));
  crawlEvents.on('active',      ({ jobId }) => broadcast(jobId, { type: 'status', jobId, status: 'CRAWLING' }));
  criticEvents.on('active',     ({ jobId }) => broadcast(jobId, { type: 'status', jobId, status: 'CRITIQUING' }));

  resultsEvents.on('completed', async ({ jobId }) => {
    const results = await cacheGet(`results:${jobId}`);
    broadcast(jobId, { type: 'completed', jobId, results });
    // Clean up subscribers after delivery
    setTimeout(() => subscribers.delete(jobId), 5000);
  });

  resultsEvents.on('failed', ({ jobId, failedReason }) => {
    broadcast(jobId, { type: 'failed', jobId, error: failedReason });
    subscribers.delete(jobId);
  });

  // ─── WebSocket Route ──────────────────────────────────────────────────────
  fastify.get('/api/v1/search/:jobId/ws', { websocket: true }, (socket, request) => {
    const { jobId } = request.params;
    log.info({ jobId }, 'WebSocket client connected');

    if (!subscribers.has(jobId)) subscribers.set(jobId, new Set());
    subscribers.get(jobId).add(socket);

    socket.on('close', () => {
      const sockets = subscribers.get(jobId);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) subscribers.delete(jobId);
      }
      log.debug({ jobId }, 'WebSocket client disconnected');
    });

    socket.on('error', (err) => log.error({ err, jobId }, 'WebSocket error'));

    // Immediately confirm subscription
    socket.send(JSON.stringify({ type: 'subscribed', jobId }));
  });
}

module.exports = wsPlugin;

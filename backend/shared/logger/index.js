/**
 * @agentflow/shared/logger
 * Pino-based structured logger.  Each service passes its `serviceName`
 * so every log line carries a `service` field for easy filtering.
 */

'use strict';

const pino = require('pino');

/**
 * @param {string} serviceName  e.g. 'api-gateway', 'researcher-agent'
 * @returns {import('pino').Logger}
 */
function createLogger(serviceName) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { service: serviceName, pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    ...(process.env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    }),
  });
}

module.exports = { createLogger };

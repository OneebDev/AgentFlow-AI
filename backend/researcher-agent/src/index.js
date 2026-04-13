'use strict';

require('dotenv').config();

const { createLogger }   = require('@agentflow/shared/logger');
const { startResearcher } = require('./services/researcher');

const log = createLogger('researcher-agent');

async function start() {
  log.info('Starting Researcher Agent…');
  const worker = startResearcher();

  const shutdown = async (signal) => {
    log.info({ signal }, 'Researcher Agent shutting down…');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  require('@agentflow/shared/logger').createLogger('researcher-agent').fatal({ err }, 'Fatal startup error');
  process.exit(1);
});

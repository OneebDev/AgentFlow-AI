'use strict';

require('dotenv').config();

const { createLogger }    = require('@agentflow/shared/logger');
const { startController } = require('./controller');

const log = createLogger('orchestrator');

async function start() {
  log.info('Starting Orchestrator…');
  const { resultsWorker } = startController();

  const shutdown = async (signal) => {
    log.info({ signal }, 'Orchestrator shutting down…');
    await resultsWorker.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  require('@agentflow/shared/logger').createLogger('orchestrator').fatal({ err }, 'Fatal startup error');
  process.exit(1);
});

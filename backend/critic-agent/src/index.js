'use strict';

require('dotenv').config();

const { createLogger } = require('@agentflow/shared/logger');
const { startCritic }  = require('./services/critic');

const log = createLogger('critic-agent');

async function start() {
  log.info('Starting Critic Agent…');
  const worker = startCritic();

  const shutdown = async (signal) => {
    log.info({ signal }, 'Critic Agent shutting down…');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  require('@agentflow/shared/logger').createLogger('critic-agent').fatal({ err }, 'Fatal startup error');
  process.exit(1);
});

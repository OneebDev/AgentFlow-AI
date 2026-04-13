'use strict';

require('dotenv').config();

const { createLogger } = require('@agentflow/shared/logger');
const { startCrawler } = require('./services/crawler');

const log = createLogger('crawler-agent');

async function start() {
  log.info('Starting Crawler Agent…');
  const worker = startCrawler();

  const shutdown = async (signal) => {
    log.info({ signal }, 'Crawler Agent shutting down…');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  require('@agentflow/shared/logger').createLogger('crawler-agent').fatal({ err }, 'Fatal startup error');
  process.exit(1);
});

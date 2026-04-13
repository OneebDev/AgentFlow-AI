/**
 * @agentflow/shared — barrel export
 * Re-exports all shared modules so services can import either:
 *   require('@agentflow/shared')            → everything
 *   require('@agentflow/shared/queue')      → queue only
 *   require('@agentflow/shared/logger')     → logger only
 */

'use strict';

module.exports = {
  ...require('./queue'),
  ...require('./db'),
  ...require('./cache'),
  ...require('./types'),
  logger: require('./logger'),
};

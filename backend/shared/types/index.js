/**
 * @agentflow/shared/types
 * Central type definitions and job status constants shared across all agents.
 */

'use strict';

// ─── Job Status Lifecycle ────────────────────────────────────────────────────
const JobStatus = Object.freeze({
  PENDING:    'PENDING',
  RESEARCHING:'RESEARCHING',
  CRAWLING:   'CRAWLING',
  CRITIQUING: 'CRITIQUING',
  COMPLETED:  'COMPLETED',
  FAILED:     'FAILED',
});

// ─── Queue Names ─────────────────────────────────────────────────────────────
const QueueName = Object.freeze({
  RESEARCH:  'research-queue',
  CRAWL:     'crawl-queue',
  CRITIC:    'critic-queue',
  RESULTS:   'results-queue',
});

// ─── Output Formats ──────────────────────────────────────────────────────────
const OutputFormat = Object.freeze({
  VIDEO:    'video',
  ARTICLE:  'article',
  MIXED:    'mixed',
  NEWS:     'news',
});

// ─── Intent Categories ───────────────────────────────────────────────────────
const IntentCategory = Object.freeze({
  LEARNING:  'learning',
  PRODUCT:   'product',
  NEWS:      'news',
  RESEARCH:  'research',
  HOW_TO:    'how_to',
  GENERAL:   'general',
});

/**
 * Creates a standardised job payload envelope.
 * All queue messages must conform to this shape.
 *
 * @param {string} jobId   - UUID for this search session
 * @param {string} userId  - Caller identity
 * @param {string} query   - Raw user query
 * @param {object} [meta]  - Extra fields merged into payload
 * @returns {object}
 */
function createJobPayload(jobId, userId, query, meta = {}) {
  return {
    jobId,
    userId,
    query,
    createdAt: new Date().toISOString(),
    ...meta,
  };
}

module.exports = { JobStatus, QueueName, OutputFormat, IntentCategory, createJobPayload };

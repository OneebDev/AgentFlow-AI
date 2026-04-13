/**
 * API service — thin wrapper around axios for the AgentFlow backend.
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Submit a new search job.
 * @param {string} query
 * @param {string} [userId]
 * @returns {Promise<{ jobId: string, status: string, wsUrl: string }>}
 */
export async function submitSearch(query, userId = 'anonymous') {
  const { data } = await api.post('/api/v1/search', { query, userId });
  return data;
}

/**
 * Poll job status and results.
 * @param {string} jobId
 */
export async function getJobResult(jobId) {
  const { data } = await api.get(`/api/v1/search/${jobId}`);
  return data;
}

/**
 * Create a WebSocket connection for real-time job updates.
 * @param {string} jobId
 * @returns {WebSocket}
 */
export function createJobSocket(jobId) {
  const wsBase = (import.meta.env.VITE_API_URL || window.location.origin)
    .replace(/^https?/, (m) => (m === 'https' ? 'wss' : 'ws'));
  return new WebSocket(`${wsBase}/api/v1/search/${jobId}/ws`);
}

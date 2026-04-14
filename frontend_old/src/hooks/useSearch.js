/**
 * useSearch hook
 * Handles the full search lifecycle: submit → WebSocket → results.
 * Falls back to polling if WebSocket is unavailable.
 */

import { useCallback, useRef, useEffect } from 'react';
import { submitSearch, getJobResult, createJobSocket } from '../services/api';
import useSearchStore from '../store/searchStore';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

export function useSearch() {
  const store     = useSearchStore();
  const socketRef = useRef(null);
  const pollRef   = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      socketRef.current?.close();
      clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => clearInterval(pollRef.current);

  const startPolling = useCallback((jobId) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > MAX_POLL_ATTEMPTS) {
        stopPolling();
        store.setFailed('Timed out waiting for results');
        return;
      }
      try {
        const data = await getJobResult(jobId);
        store.setStatus(data.status.toLowerCase());
        if (data.status === 'COMPLETED' && data.results) {
          stopPolling();
          store.setCompleted(data.results);
        } else if (data.status === 'FAILED') {
          stopPolling();
          store.setFailed(data.errorMessage || 'Search failed');
        }
      } catch {
        // non-fatal poll error
      }
    }, POLL_INTERVAL_MS);
  }, [store]);

  const search = useCallback(async (query) => {
    if (!query.trim()) return;

    store.setQuery(query);

    try {
      const { jobId } = await submitSearch(query);
      store.startJob(jobId);

      // ─── Try WebSocket first ───────────────────────────────────────────
      let wsConnected = false;
      try {
        const ws = createJobSocket(jobId);
        socketRef.current = ws;

        ws.onopen = () => {
          wsConnected = true;
          clearInterval(pollRef.current); // cancel fallback poll if started
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'status') {
            store.setStatus(msg.status.toLowerCase());
          } else if (msg.type === 'completed') {
            ws.close();
            store.setCompleted(msg.results);
          } else if (msg.type === 'failed') {
            ws.close();
            store.setFailed(msg.error);
          }
        };

        ws.onerror = () => {
          if (!wsConnected) startPolling(jobId);
        };

        ws.onclose = () => {
          socketRef.current = null;
        };

        // Start polling as a fallback until WS confirms open
        setTimeout(() => {
          if (!wsConnected) startPolling(jobId);
        }, 1500);

      } catch {
        startPolling(jobId);
      }
    } catch (err) {
      store.setFailed(err.response?.data?.message || 'Failed to submit search');
    }
  }, [store, startPolling]);

  return { search, ...store };
}

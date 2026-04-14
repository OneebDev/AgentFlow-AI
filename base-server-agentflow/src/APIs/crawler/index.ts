import { Router } from 'express';

const router = Router();

/**
 * Crawler Agent — internal service, no public POST endpoints.
 * Jobs are consumed directly from the BullMQ crawl-queue by crawler.worker.ts.
 * This router exposes only a health check for load-balancer / ops use.
 */
router.get('/health', (_req, res) => {
    res.json({ agent: 'crawler', status: 'ok' });
});

export default router;

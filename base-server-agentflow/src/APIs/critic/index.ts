import { Router } from 'express';

const router = Router();

/**
 * Critic Agent — internal service, no public POST endpoints.
 * Jobs are consumed directly from the BullMQ critic-queue by critic.worker.ts.
 * This router exposes only a health check for load-balancer / ops use.
 */
router.get('/health', (_req, res) => {
    res.json({ agent: 'critic', status: 'ok' });
});

export default router;

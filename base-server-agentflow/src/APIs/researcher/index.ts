import { Router } from 'express';
import controller from './researcher.controller';

const router = Router();

router.route('/').post(controller.start);
router.route('/:jobId/stream').get(controller.stream);   // SSE — must be before /:jobId
router.route('/:jobId/results').get(controller.results);
router.route('/:jobId').get(controller.status);

export default router;

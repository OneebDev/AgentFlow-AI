import { Router } from 'express';
import controller from './researcher.controller';

const router = Router();

router.route('/').post(controller.start);
router.route('/suggest').get(controller.suggest);
router.route('/:jobId/stream').get(controller.stream);
router.route('/:jobId/results').get(controller.results);
router.route('/:jobId').get(controller.status);

export default router;

/**
 * File Routes
 * -----------
 * GET    /api/files?userId=
 * GET    /api/files/:id?userId=
 * POST   /api/files  body: { userId, name?, code? }
 * PATCH  /api/files/:id  body: { userId, name?, code? }
 * DELETE /api/files/:id  body: { userId }
 */

import { Router } from 'express';
import { FileController } from '../controllers/file.controller.js';

const router = Router();
const fileController = new FileController();

router.get('/', (req, res) => fileController.list(req, res));
router.get('/:id', (req, res) => fileController.get(req, res));
router.post('/', (req, res) => fileController.create(req, res));
router.patch('/:id', (req, res) => fileController.update(req, res));
router.delete('/:id', (req, res) => fileController.delete(req, res));

export const fileRouter = router;

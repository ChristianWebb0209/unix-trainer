/**
 * Project Routes
 * -------------
 * GET /api/projects       → { projects: [{ id, name }] }
 * GET /api/projects/:id  → { project: { id, name, content } }
 */

import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller.js';

const router = Router();
const projectController = new ProjectController();

router.get('/', (req, res) => projectController.list(req, res));
router.get('/:id', (req, res) => projectController.get(req, res));

export const projectRouter = router;

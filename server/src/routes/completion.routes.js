import { Router } from 'express';
import { CompletionController } from '../controllers/completion.controller.js';

/**
 * Completion Routes
 * -----------------
 * Exposes REST endpoints for problem completion data.
 *
 * GET /api/completions?userId={uuid}
 * POST /api/completions
 */

const completionController = new CompletionController();

export const completionRouter = Router();

completionRouter.get('/', (req, res) => completionController.listForUser(req, res));
completionRouter.post('/', (req, res) => completionController.upsertCompletion(req, res));


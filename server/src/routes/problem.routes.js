import { Router } from 'express';
import { ProblemController } from '../controllers/problem.controller.js';
import { ProblemService } from '../services/problem.service.js';

/**
 * Problem Routes
 * --------------
 * Exposes API endpoints for retrieving coding problems and test cases.
 *
 * Responsibilities:
 * - Route problem requests
 * - Validate IDs
 * - Apply caching middleware if present
 *
 * Must NOT:
 * - Contain business logic
 * - Access database directly
 *
 * Delegates to:
 * - ProblemController
 */

// Basic Dependency Injection setup 
const problemService = new ProblemService();
const problemController = new ProblemController(problemService);

export const problemRouter = Router();

problemRouter.get('/of-the-day', (req, res) => problemController.getProblemOfTheDay(req, res));
problemRouter.get('/:problemId', (req, res) => problemController.getProblem(req, res));
problemRouter.get('/', (req, res) => problemController.listProblems(req, res));

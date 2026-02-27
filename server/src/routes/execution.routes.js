import { Router } from 'express';
import { ExecutionController } from '../controllers/execution.controller.js';
import { ExecutionService } from '../services/execution.service.js';
import { ContainerService } from '../services/container.service.js';
import { ValidationService } from '../services/validation.service.js';
import { ProblemService } from '../services/problem.service.js';

/**
 * Execution Routes
 * ----------------
 * Defines endpoints for running user code and retrieving execution results.
 *
 * Responsibilities:
 * - Accept submission requests
 * - Route execution requests to ExecutionController
 * - Validate request shape
 *
 * Must NOT:
 * - Run code
 * - Create containers
 * - Fetch problems
 *
 * Agent notes:
 * - All heavy logic belongs in controller/service layers
 * - Routes should be declarative only
 */

// Basic Dependency Injection setup
const containerService = new ContainerService();
const validationService = new ValidationService();
const problemService = new ProblemService();
const executionService = new ExecutionService(containerService, validationService, problemService);
const executionController = new ExecutionController(executionService);

export const executionRouter = Router();

executionRouter.post('/:problemId/submit', (req, res) => executionController.executeSubmission(req, res));

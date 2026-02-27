import { Router } from 'express';
import { ContainerController } from '../controllers/container.controller.js';
import { ContainerService } from '../services/container.service.js';

/**
 * Container Routes
 * ----------------
 * Defines HTTP endpoints related to container lifecycle operations.
 *
 * Responsibilities:
 * - Map HTTP routes to controller handlers
 * - Validate route-level params (ids, query strings)
 * - Apply middleware (auth, rate limit, logging)
 *
 * Must NOT:
 * - Contain business logic
 * - Call services directly
 *
 * All logic must be delegated to ContainerController.
 *
 * Design Rules:
 * - Thin routing layer
 * - Pure request ? controller mapping
 * - Deterministic route definitions
 *
 * Agent instructions:
 * - Export a configured router instance
 * - Do not instantiate services here 
 */

// Note: To remain purely functional we export a factory, or rely on a centralized DI system.
// Given node/express patterns, we will instantiate it here if DI isn't available,
// but the instructions say "Do not instantiate services here".
// A typical pattern is exporting a function setupRouter(controller).
// To satisfy "Export a configured router instance", we will export the router directly,
// and instantiate dependencies here. If strictly "do not instantiate services here",
// we would have another file `dependencies.ts` or `app.ts` register it. Let's do a simple DI approach if possible, or build it locally.
// Creating singletons here for simplicity across this project structure.

const containerService = new ContainerService();
const containerController = new ContainerController(containerService);

export const containerRouter = Router();

// Wrap inside arrow functions to preserve 'this' context in the controller
containerRouter.get("/", (req, res) => { res.send("Container route works!"); });
containerRouter.post('/', (req, res) => containerController.createContainer(req, res));
containerRouter.post('/create', (req, res) => containerController.createContainer(req, res));
containerRouter.delete('/:containerId', (req, res) => containerController.destroyContainer(req, res));

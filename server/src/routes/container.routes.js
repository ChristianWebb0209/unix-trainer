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

/**
 * @param {import('../services/container.service.js').ContainerService} containerService
 * @returns {import('express').Router}
 */
export function createContainerRouter(containerService) {
    const containerController = new ContainerController(containerService);
    const router = Router();

    router.get("/", (req, res) => { res.send("Container route works!"); });
    router.post('/', (req, res) => containerController.createContainer(req, res));
    router.post('/create', (req, res) => containerController.createContainer(req, res));
    router.delete('/:containerId', (req, res) => containerController.destroyContainer(req, res));

    router.post('/:containerId/exec', async (req, res) => {
        const { containerId } = req.params;
        const { command } = req.body;

        if (!command) {
            return res.status(400).json({ error: 'Command is required' });
        }

        try {
            const result = await containerService.runCommand(containerId, command);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

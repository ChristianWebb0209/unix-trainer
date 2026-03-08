import { randomUUID } from 'crypto';
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
 * @param {import('../services/file.service.js').FileService} fileService
 * @returns {import('express').Router}
 */
export function createContainerRouter(containerService, fileService) {
    const containerController = new ContainerController(containerService, fileService);
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

    router.get('/:containerId/outputs', async (req, res) => {
        const { containerId } = req.params;
        try {
            const files = await containerService.listOutputFiles(containerId);
            res.json({ files });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:containerId/outputs/:filename', async (req, res) => {
        const { containerId, filename } = req.params;
        try {
            const base64 = await containerService.getOutputFileContent(containerId, filename);
            if (!base64) {
                return res.status(404).json({ error: 'File not found' });
            }
            const buf = Buffer.from(base64, 'base64');
            const ext = filename.split('.').pop()?.toLowerCase() || '';
            const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] || 'application/octet-stream';
            res.set('Content-Type', mime);
            res.send(buf);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/:containerId/sync-workspace', async (req, res) => {
        const { containerId } = req.params;
        const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : null;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required in body' });
        }
        try {
            const containerFiles = await containerService.readWorkspaceFromContainer(containerId);
            const existing = await fileService.getFilesForUser(userId);
            const byName = new Map(existing.map((f) => [f.name, f]));
            const merged = containerFiles.map(({ name, code }) => {
                const prev = byName.get(name);
                return prev ? { ...prev, code } : { id: randomUUID(), name, code };
            });
            await fileService.setFilesForUser(userId, merged);
            res.status(200).json({ files: merged });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

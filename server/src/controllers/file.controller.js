/**
 * File Controller
 * ---------------
 * REST for playground files: list, get, create, update, delete.
 * Expects userId from query (list) or body (create/update).
 */

import { FileService } from '../services/file.service.js';

const fileService = new FileService();

export class FileController {
  async list(req, res) {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : null;
      if (!userId) {
        res.status(400).json({ error: 'userId query parameter is required' });
        return;
      }
      const { files } = await fileService.listByUser(userId);
      res.status(200).json({ files });
    } catch (err) {
      console.error('[FileController] list error:', err?.message ?? err);
      res.status(500).json({ error: 'Failed to list files' });
    }
  }

  async get(req, res) {
    try {
      const { id } = req.params;
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : null;
      if (!userId) {
        res.status(400).json({ error: 'userId query parameter is required' });
        return;
      }
      const file = await fileService.getById(id, userId);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      res.status(200).json({ file });
    } catch (err) {
      console.error('[FileController] get error:', err?.message ?? err);
      res.status(500).json({ error: 'Failed to get file' });
    }
  }

  async create(req, res) {
    try {
      const { userId, name, code } = req.body ?? {};
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const file = await fileService.create({
        userId,
        name: name ?? 'untitled',
        code: code ?? '',
      });
      res.status(201).json({ file });
    } catch (err) {
      console.error('[FileController] create error:', err?.message ?? err);
      res.status(500).json({ error: 'Failed to create file' });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const { userId, name, code } = req.body ?? {};
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const file = await fileService.update(id, userId, { name, code });
      res.status(200).json({ file });
    } catch (err) {
      if (err?.message?.includes('Invalid')) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error('[FileController] update error:', err?.message ?? err);
      res.status(500).json({ error: 'Failed to update file' });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : null;
      if (!userId) {
        res.status(400).json({ error: 'userId is required in body' });
        return;
      }
      await fileService.delete(id, userId);
      res.status(204).send();
    } catch (err) {
      if (err?.message?.includes('Invalid')) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error('[FileController] delete error:', err?.message ?? err);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  }
}

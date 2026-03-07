/**
 * Project Controller
 * ------------------
 * GET /api/projects → list project ids/names
 * GET /api/projects/:id → get one project (.md content)
 */

import { ProjectService } from '../services/project.service.js';

const projectService = new ProjectService();

export class ProjectController {
  async list(req, res) {
    try {
      const { projects } = await projectService.list();
      res.status(200).json({ projects });
    } catch (err) {
      console.error('[ProjectController] list error:', err?.message ?? err);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  }

  async get(req, res) {
    try {
      const { id } = req.params;
      const project = await projectService.getById(id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.status(200).json({ project });
    } catch (err) {
      console.error('[ProjectController] get error:', err?.message ?? err);
      res.status(500).json({ error: 'Failed to get project' });
    }
  }
}

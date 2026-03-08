/**
 * Help File Controller
 * ---------------------
 * GET /api/help-files       → { helpFiles: [{ id, name }] }
 * GET /api/help-files/:id  → { helpFile: { id, name, content } }
 */

import { HelpFileService } from "../services/helpFile.service.js";

const helpFileService = new HelpFileService();

export class HelpFileController {
  async list(req, res) {
    try {
      const { helpFiles } = await helpFileService.list();
      res.status(200).json({ helpFiles });
    } catch (err) {
      console.error("[HelpFileController] list error:", err?.message ?? err);
      res.status(500).json({ error: "Failed to list help files" });
    }
  }

  async get(req, res) {
    try {
      const { id } = req.params;
      const helpFile = await helpFileService.getById(id);
      if (!helpFile) {
        res.status(404).json({ error: "Help file not found" });
        return;
      }
      res.status(200).json({ helpFile });
    } catch (err) {
      console.error("[HelpFileController] get error:", err?.message ?? err);
      res.status(500).json({ error: "Failed to get help file" });
    }
  }
}

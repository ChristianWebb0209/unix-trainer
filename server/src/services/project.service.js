/**
 * Project Service
 * ---------------
 * Reads playground projects from public.projects table (synced from .md files).
 */

import { query } from "../config/database.config.js";

export class ProjectService {
  async list() {
    try {
      const res = await query(
        "SELECT id, name FROM public.projects ORDER BY name ASC"
      );
      return { projects: res.rows ?? [] };
    } catch (err) {
      console.error("[ProjectService] list error:", err.message);
      return { projects: [] };
    }
  }

  async getById(id) {
    if (!id || typeof id !== "string") return null;
    const safeId = id.replace(/[^a-z0-9-_]/gi, "");
    if (!safeId) return null;
    try {
      const res = await query(
        "SELECT id, name, content FROM public.projects WHERE id = $1",
        [safeId]
      );
      const row = res.rows?.[0];
      return row ? { id: row.id, name: row.name, content: row.content ?? "" } : null;
    } catch (err) {
      console.error("[ProjectService] getById error:", err.message);
      return null;
    }
  }
}

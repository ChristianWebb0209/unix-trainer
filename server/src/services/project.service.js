/**
 * Project Service
 * ---------------
 * Reads playground projects from public.projects table (synced from .md files).
 */

import { query } from "../config/database.config.js";
import { listLocalMarkdown, getLocalMarkdown } from "./local-markdown.js";

export class ProjectService {
  async list() {
    try {
      const res = await query(
        "SELECT id, name FROM public.projects ORDER BY name ASC"
      );
      const rows = res.rows ?? [];
      return { projects: rows.length > 0 ? rows : listLocalMarkdown("projects") };
    } catch (err) {
      console.warn("[ProjectService] list falling back to local files:", err.message);
      return { projects: listLocalMarkdown("projects") };
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
      return row
        ? { id: row.id, name: row.name, content: row.content ?? "" }
        : getLocalMarkdown("projects", safeId);
    } catch (err) {
      console.warn("[ProjectService] getById falling back to local files:", err.message);
      return getLocalMarkdown("projects", safeId);
    }
  }
}

/**
 * Help File Service
 * -----------------
 * Reads help docs from public.help_files table (synced from .md files).
 */

import { query } from "../config/database.config.js";

export class HelpFileService {
  async list() {
    try {
      const res = await query(
        "SELECT id, name FROM public.help_files ORDER BY name ASC"
      );
      return { helpFiles: res.rows ?? [] };
    } catch (err) {
      console.error("[HelpFileService] list error:", err.message);
      return { helpFiles: [] };
    }
  }

  async getById(id) {
    if (!id || typeof id !== "string") return null;
    const safeId = id.replace(/[^a-z0-9-_]/gi, "");
    if (!safeId) return null;
    try {
      const res = await query(
        "SELECT id, name, content FROM public.help_files WHERE id = $1",
        [safeId]
      );
      const row = res.rows?.[0];
      return row ? { id: row.id, name: row.name, content: row.content ?? "" } : null;
    } catch (err) {
      console.error("[HelpFileService] getById error:", err.message);
      return null;
    }
  }
}

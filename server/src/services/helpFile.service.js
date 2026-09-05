/**
 * Help File Service
 * -----------------
 * Reads help docs from public.help_files table (synced from .md files).
 */

import { query } from "../config/database.config.js";
import { listLocalMarkdown, getLocalMarkdown } from "./local-markdown.js";

export class HelpFileService {
  async list() {
    try {
      const res = await query(
        "SELECT id, name FROM public.help_files ORDER BY name ASC"
      );
      const rows = res.rows ?? [];
      return { helpFiles: rows.length > 0 ? rows : listLocalMarkdown("help-files") };
    } catch (err) {
      console.warn("[HelpFileService] list falling back to local files:", err.message);
      return { helpFiles: listLocalMarkdown("help-files") };
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
      return row
        ? { id: row.id, name: row.name, content: row.content ?? "" }
        : getLocalMarkdown("help-files", safeId);
    } catch (err) {
      console.warn("[HelpFileService] getById falling back to local files:", err.message);
      return getLocalMarkdown("help-files", safeId);
    }
  }
}

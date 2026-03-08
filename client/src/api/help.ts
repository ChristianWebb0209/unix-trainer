/**
 * Help files API with local caching.
 * Cache key: help_doc_{slug}. Stale after 24h; we still show cache and revalidate in background.
 */
import { apiUrl } from "../services/apiOrigin";

const CACHE_PREFIX = "help_doc_";
const CACHE_LIST_KEY = "help_list";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface HelpFileSummary {
  id: string;
  name: string;
}

export interface HelpFile {
  id: string;
  name: string;
  content: string;
}

interface CachedDoc {
  content: string;
  name: string;
  fetchedAt: number;
}

interface CachedList {
  helpFiles: HelpFileSummary[];
  fetchedAt: number;
}

function getCachedDoc(slug: string): HelpFile | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slug);
    if (!raw) return null;
    const parsed: CachedDoc = JSON.parse(raw);
    if (!parsed.content) return null;
    return {
      id: slug,
      name: parsed.name ?? slug,
      content: parsed.content,
    };
  } catch {
    return null;
  }
}

function setCachedDoc(slug: string, doc: HelpFile): void {
  try {
    const entry: CachedDoc = {
      content: doc.content,
      name: doc.name,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify(entry));
  } catch {
    // ignore quota or disabled storage
  }
}

export async function listHelpFiles(): Promise<{ helpFiles: HelpFileSummary[] }> {
  try {
    const cached = localStorage.getItem(CACHE_LIST_KEY);
    if (cached) {
      const parsed: CachedList = JSON.parse(cached);
      if (parsed.helpFiles?.length && Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
        return { helpFiles: parsed.helpFiles };
      }
    }
  } catch {
    // ignore
  }

  const res = await fetch(apiUrl("/api/help-files"));
  if (!res.ok) throw new Error(`Failed to list help files: ${res.status}`);
  const data = (await res.json()) as { helpFiles: HelpFileSummary[] };

  try {
    localStorage.setItem(
      CACHE_LIST_KEY,
      JSON.stringify({ helpFiles: data.helpFiles, fetchedAt: Date.now() })
    );
  } catch {
    // ignore
  }

  return data;
}

export async function getHelpFile(id: string): Promise<HelpFile> {
  const cached = getCachedDoc(id);
  if (cached && Date.now() - (localStorage.getItem(CACHE_PREFIX + id) ? JSON.parse(localStorage.getItem(CACHE_PREFIX + id)!).fetchedAt : 0) < CACHE_TTL_MS) {
    // Return cache and revalidate in background
    void fetch(apiUrl(`/api/help-files/${encodeURIComponent(id)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { helpFile?: HelpFile } | null) => {
        if (data?.helpFile) setCachedDoc(id, data.helpFile);
      })
      .catch(() => {});
    return cached;
  }

  const res = await fetch(apiUrl(`/api/help-files/${encodeURIComponent(id)}`));
  if (!res.ok) throw new Error(`Failed to get help file: ${res.status}`);
  const data = (await res.json()) as { helpFile: HelpFile };
  const doc = data.helpFile;
  setCachedDoc(id, doc);
  return doc;
}

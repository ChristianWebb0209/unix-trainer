/**
 * Playground files API (user_id, name, code).
 */
import { apiUrl } from "../services/apiOrigin";

export interface PlaygroundFile {
  id: string;
  name: string;
  code: string;
  created_at?: string;
  updated_at?: string;
}

export interface ListFilesResponse {
  files: PlaygroundFile[];
}

function getUserId(): string | null {
  try {
    const stored = window.localStorage.getItem("user_id")?.trim();
    return stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)
      ? stored
      : null;
  } catch {
    return null;
  }
}

export async function listFiles(): Promise<ListFilesResponse> {
  const userId = getUserId();
  if (!userId) return { files: [] };
  const res = await fetch(`/api/files?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`Failed to list files: ${res.status}`);
  return res.json();
}

export async function getFile(id: string): Promise<{ file: PlaygroundFile }> {
  const userId = getUserId();
  if (!userId) throw new Error("Log in to open files");
  const res = await fetch(apiUrl(`/api/files/${id}?userId=${encodeURIComponent(userId)}`));
  if (!res.ok) throw new Error(`Failed to get file: ${res.status}`);
  return res.json();
}

export async function createFile(params: { name?: string; code?: string }): Promise<{ file: PlaygroundFile }> {
  const userId = getUserId();
  if (!userId) throw new Error("Log in to create files");
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      name: params.name ?? "untitled",
      code: params.code ?? "",
    }),
  });
  if (!res.ok) throw new Error(`Failed to create file: ${res.status}`);
  return res.json();
}

export async function updateFile(
  id: string,
  params: { name?: string; code?: string }
): Promise<{ file: PlaygroundFile }> {
  const userId = getUserId();
  if (!userId) throw new Error("Log in to update files");
  const res = await fetch(apiUrl(`/api/files/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, ...params }),
  });
  if (!res.ok) throw new Error(`Failed to update file: ${res.status}`);
  return res.json();
}

export async function deleteFile(id: string): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new Error("Log in to delete files");
  const res = await fetch(apiUrl(`/api/files/${id}`), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(`Failed to delete file: ${res.status}`);
}

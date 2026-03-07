/**
 * Playground projects API (.md files on server).
 */

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  content: string;
}

export interface ListProjectsResponse {
  projects: ProjectSummary[];
}

export async function listProjects(): Promise<ListProjectsResponse> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`);
  return res.json();
}

export async function getProject(id: string): Promise<{ project: Project }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to get project: ${res.status}`);
  return res.json();
}

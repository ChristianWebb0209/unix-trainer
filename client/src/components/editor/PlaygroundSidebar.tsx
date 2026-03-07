import { useState, useEffect, useCallback, useRef } from "react";
import type { PlaygroundFile } from "../../api/files";
import type { ProjectSummary, Project } from "../../api/projects";
import {
  listFiles,
  createFile,
  updateFile,
  deleteFile,
  getFile,
} from "../../api/files";
import { listProjects, getProject } from "../../api/projects";
import * as problemConfig from "problem-config";

type TabKind = "files" | "projects";

export interface PlaygroundSidebarProps {
  /** Currently selected file id (for Files tab). */
  selectedFileId: string | null;
  /** Current editor code (so we can save before switch). */
  code: string;
  /** Current language (for export extension). */
  selectedLanguage: string;
  /** Default code for auto-created first file (workspace default language starter). */
  defaultCodeForNewFile?: string;
  /** Callback when user selects a file: load its code. */
  onSelectFile: (file: PlaygroundFile) => void | Promise<void>;
  /** Callback when code should be updated (e.g. after creating/selecting a file). */
  onCodeChange: (code: string) => void;
  /** Callback when selected file id changes (including clear). */
  onSelectedFileIdChange: (id: string | null) => void;
}

export default function PlaygroundSidebar({
  selectedFileId,
  code,
  selectedLanguage,
  defaultCodeForNewFile,
  onSelectFile,
  onCodeChange,
  onSelectedFileIdChange,
}: PlaygroundSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabKind>("files");
  const [files, setFiles] = useState<PlaygroundFile[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [focusedFileId, setFocusedFileId] = useState<string | null>(null);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<PlaygroundFile | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: PlaygroundFile } | null>(null);
  const didAutoCreateRef = useRef(false);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const filesListRef = useRef<HTMLDivElement>(null);

  const loadFiles = useCallback(async () => {
    setError(null);
    try {
      const { files: list } = await listFiles();
      if (list.length === 0 && defaultCodeForNewFile != null && !didAutoCreateRef.current) {
        didAutoCreateRef.current = true;
        try {
          const { file } = await createFile({
            name: "untitled",
            code: defaultCodeForNewFile,
          });
          setFiles([file]);
          onSelectFile(file);
          onCodeChange(file.code);
          onSelectedFileIdChange(file.id);
        } catch (createErr) {
          setFiles([]);
          setError(createErr instanceof Error ? createErr.message : "Failed to create file");
        }
      } else {
        setFiles(list);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
      setFiles([]);
    }
  }, [defaultCodeForNewFile, onSelectFile, onCodeChange, onSelectedFileIdChange]);

  const loadProjects = useCallback(async () => {
    setError(null);
    try {
      const { projects: list } = await listProjects();
      setProjects(list);
      setSelectedProject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "files") void loadFiles();
    else void loadProjects();
  }, [activeTab, loadFiles, loadProjects]);

  useEffect(() => {
    if (selectedFileId) setFocusedFileId(selectedFileId);
  }, [selectedFileId]);

  useEffect(() => {
    if (isCreatingNew) newFileInputRef.current?.focus();
  }, [isCreatingNew]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== "files") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const targetId = focusedFileId ?? selectedFileId;
        if (!targetId) return;
        const file = files.find((f) => f.id === targetId);
        if (file && !editingNameId && !isCreatingNew) {
          e.preventDefault();
          setDeleteConfirmFile(file);
        }
      }
      if (e.key === "Escape") {
        setContextMenu(null);
        setDeleteConfirmFile(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, focusedFileId, selectedFileId, files, editingNameId, isCreatingNew]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, []);

  const startCreateNew = () => {
    setIsCreatingNew(true);
    setNewFileName("");
    setError(null);
    setTimeout(() => newFileInputRef.current?.focus(), 0);
  };

  const commitCreateNew = async () => {
    const name = newFileName.trim() || "untitled";
    setIsCreatingNew(false);
    setNewFileName("");
    setLoading(true);
    setError(null);
    try {
      const { file } = await createFile({
        name,
        code: defaultCodeForNewFile ?? "",
      });
      setFiles((prev) => [file, ...prev]);
      onSelectFile(file);
      onCodeChange(file.code);
      onSelectedFileIdChange(file.id);
      setFocusedFileId(file.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create file");
    } finally {
      setLoading(false);
    }
  };

  const cancelCreateNew = () => {
    setIsCreatingNew(false);
    setNewFileName("");
  };

  const handleOpenFile = async (file: PlaygroundFile) => {
    try {
      const { file: full } = await getFile(file.id);
      onSelectFile(full);
      onCodeChange(full.code);
      onSelectedFileIdChange(full.id);
      setFocusedFileId(full.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open file");
    }
  };

  const startEditName = (file: PlaygroundFile) => {
    setEditingNameId(file.id);
    setEditingNameValue(file.name);
  };

  const saveEditName = async () => {
    if (!editingNameId) return;
    const value = editingNameValue.trim() || "untitled";
    setEditingNameId(null);
    try {
      const updated = await updateFile(editingNameId, { name: value });
      setFiles((prev) =>
        prev.map((f) => (f.id === updated.file.id ? { ...f, name: updated.file.name } : f))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    }
  };

  const handleDeleteFileById = async (id: string) => {
    setDeleteConfirmFile(null);
    setLoading(true);
    try {
      await deleteFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (selectedFileId === id) {
        onSelectedFileIdChange(null);
        onCodeChange("");
      }
      if (focusedFileId === id) setFocusedFileId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  const handleExportFile = async (file: PlaygroundFile) => {
    setContextMenu(null);
    let codeToExport = "";
    if (selectedFileId === file.id) {
      codeToExport = code;
    } else {
      try {
        const { file: full } = await getFile(file.id);
        codeToExport = full.code;
      } catch {
        setError("Failed to load file for export");
        return;
      }
    }
    const lang = problemConfig.PROBLEM_LANGUAGES[selectedLanguage as keyof typeof problemConfig.PROBLEM_LANGUAGES];
    const ext = (lang?.exportExtension as string) ?? ".txt";
    const filename = file.name.replace(/\.[^/.]+$/, "") + ext;
    const blob = new Blob([codeToExport], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectProject = async (p: ProjectSummary) => {
    try {
      const { project } = await getProject(p.id);
      setSelectedProject(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        padding: "1rem",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          gap: "0.5rem",
          marginBottom: "0.75rem",
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "0.5rem",
        }}
      >
        <button
          type="button"
          className={`editor-tab-button ${activeTab === "files" ? "editor-tab-button--selected" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          Files
        </button>
        <button
          type="button"
          className={`editor-tab-button ${activeTab === "projects" ? "editor-tab-button--selected" : ""}`}
          onClick={() => setActiveTab("projects")}
        >
          Projects
        </button>
      </div>

      {error && (
        <div
          style={{
            flexShrink: 0,
            padding: "0.5rem",
            marginBottom: "0.5rem",
            borderRadius: "6px",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            color: "var(--danger-color)",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {activeTab === "files" && (
        <>
          <div style={{ flexShrink: 0, marginBottom: "0.5rem" }}>
            <button
              type="button"
              onClick={startCreateNew}
              disabled={loading || isCreatingNew}
              style={{
                width: "100%",
                padding: "0.4rem 0.75rem",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                cursor: loading || isCreatingNew ? "not-allowed" : "pointer",
              }}
            >
              + New file
            </button>
          </div>
          <div ref={filesListRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {isCreatingNew && (
              <div
                style={{
                  padding: "0.5rem 0.4rem",
                  marginBottom: "0.25rem",
                  borderRadius: "6px",
                  border: "1px solid var(--accent-color)",
                  backgroundColor: "var(--bg-tertiary)",
                }}
              >
                <input
                  ref={newFileInputRef}
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitCreateNew();
                    if (e.key === "Escape") cancelCreateNew();
                  }}
                  onBlur={() => {
                    if (newFileName.trim()) void commitCreateNew();
                    else cancelCreateNew();
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="File name"
                  style={{
                    width: "100%",
                    padding: "0.2rem 0.4rem",
                    fontSize: "0.9rem",
                    border: "none",
                    borderRadius: "4px",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}
            {files.length === 0 && !loading && !isCreatingNew && (
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                No files yet. Create one or log in to see saved files.
              </p>
            )}
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => setFocusedFileId(file.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  void handleOpenFile(file);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, file });
                }}
                tabIndex={0}
                style={{
                  padding: "0.5rem 0.4rem",
                  marginBottom: "0.25rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  backgroundColor:
                    (focusedFileId === file.id || selectedFileId === file.id)
                      ? "var(--bg-tertiary)"
                      : "transparent",
                  border:
                    (focusedFileId === file.id || selectedFileId === file.id)
                      ? "1px solid var(--accent-color)"
                      : "1px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                {editingNameId === file.id ? (
                  <input
                    type="text"
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value)}
                    onBlur={saveEditName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEditName();
                      if (e.key === "Escape") setEditingNameId(null);
                    }}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: "0.2rem 0.4rem",
                      fontSize: "0.9rem",
                      border: "1px solid var(--accent-color)",
                      borderRadius: "4px",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    style={{ flex: 1, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis" }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEditName(file);
                    }}
                    title="Double-click to rename"
                  >
                    {file.name}
                  </span>
                )}
                {editingNameId !== file.id && (
                  <>
                    <button
                      type="button"
                      aria-label="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName(file);
                      }}
                      style={{
                        padding: "0.2rem",
                        border: "none",
                        background: "none",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmFile(file);
                      }}
                      style={{
                        padding: "0.2rem",
                        border: "none",
                        background: "none",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {deleteConfirmFile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          onClick={() => setDeleteConfirmFile(null)}
        >
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "8px",
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              minWidth: "280px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: "0 0 1rem", fontSize: "0.95rem" }}>
              Delete <strong>{deleteConfirmFile.name}</strong>?
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmFile(null)}
                style={{
                  padding: "0.4rem 0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteFileById(deleteConfirmFile.id)}
                style={{
                  padding: "0.4rem 0.75rem",
                  border: "1px solid var(--danger-color)",
                  borderRadius: "6px",
                  background: "var(--danger-color)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 50,
            padding: "0.25rem 0",
            borderRadius: "6px",
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-secondary)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            minWidth: "120px",
          }}
        >
          <button
            type="button"
            onClick={() => void handleExportFile(contextMenu.file)}
            style={{
              display: "block",
              width: "100%",
              padding: "0.4rem 0.75rem",
              border: "none",
              background: "none",
              color: "var(--text-primary)",
              fontSize: "0.9rem",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            Export
          </button>
        </div>
      )}

      {activeTab === "projects" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flexShrink: 0, overflowY: "auto", marginBottom: "0.5rem" }}>
            {projects.length === 0 && (
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>No projects yet.</p>
            )}
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => handleSelectProject(p)}
                style={{
                  padding: "0.5rem 0.4rem",
                  marginBottom: "0.25rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  backgroundColor:
                    selectedProject?.id === p.id ? "var(--bg-tertiary)" : "transparent",
                  border:
                    selectedProject?.id === p.id
                      ? "1px solid var(--accent-color)"
                      : "1px solid transparent",
                  fontSize: "0.9rem",
                }}
              >
                {p.name}
              </div>
            ))}
          </div>
          {selectedProject && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "0.75rem",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-tertiary)",
                fontSize: "0.9rem",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {selectedProject.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

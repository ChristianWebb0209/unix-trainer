import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
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

const READ_ONLY_EXTENSIONS: Extension[] = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

/** Renders full markdown project content with CodeMirror for fenced code blocks. */
function ProjectContentBody({ content, codeTheme }: { content: string; codeTheme: Extension }) {
  const components = useMemo((): Components => {
    return {
      code({ className, children, ...props }) {
        const code = String(children).replace(/\n$/, "");
        const isBlock = code.includes("\n") || (className != null && /language-/.test(className));
        if (isBlock && code.trim()) {
          return (
            <div
              style={{
                margin: "0.75rem 0",
                borderRadius: "6px",
                overflow: "hidden",
                border: "1px solid var(--border-color)",
                fontSize: "0.9rem",
              }}
            >
              <CodeMirror
                value={code}
                height="120px"
                theme={codeTheme}
                extensions={READ_ONLY_EXTENSIONS}
                basicSetup={{ lineNumbers: false, foldGutter: false }}
                style={{ fontSize: "0.9rem" }}
              />
            </div>
          );
        }
        return (
          <code
            style={{
              padding: "0.15em 0.35em",
              borderRadius: "4px",
              fontSize: "0.9em",
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
            }}
            {...props}
          >
            {children}
          </code>
        );
      },
      p: ({ children }) => <p style={{ marginBottom: "0.9rem" }}>{children}</p>,
      ul: ({ children }) => <ul style={{ marginBottom: "0.9rem", paddingLeft: "1.25rem" }}>{children}</ul>,
      ol: ({ children }) => <ol style={{ marginBottom: "0.9rem", paddingLeft: "1.25rem" }}>{children}</ol>,
      h1: ({ children }) => <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>{children}</h1>,
      h2: ({ children }) => <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.4rem" }}>{children}</h2>,
      h3: ({ children }) => <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>{children}</h3>,
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-color)" }}>
          {children}
        </a>
      ),
      blockquote: ({ children }) => (
        <blockquote style={{ margin: "0.75rem 0", paddingLeft: "1rem", borderLeft: "4px solid var(--border-color)", color: "var(--text-secondary)" }}>
          {children}
        </blockquote>
      ),
    };
  }, [codeTheme]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

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
  /** Code editor theme for rendering code blocks in Projects tab. */
  codeTheme?: Extension;
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
  codeTheme,
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
  /** Cache full file content by id so we can switch between files instantly without refetching. */
  const fileCacheRef = useRef<Map<string, PlaygroundFile>>(new Map());
  const handleOpenFileRef = useRef<(file: PlaygroundFile) => Promise<void>>(async () => {});

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
        list.forEach((f) => {
          if (f.code !== undefined) fileCacheRef.current.set(f.id, { ...f });
        });
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
      if (e.key === "Escape") {
        setContextMenu(null);
        setDeleteConfirmFile(null);
        return;
      }
      if (activeTab !== "files" || editingNameId || isCreatingNew) return;
      if (!filesListRef.current?.contains(document.activeElement ?? null)) return;

      if (e.key === "Delete") {
        const targetId = focusedFileId ?? selectedFileId;
        if (!targetId) return;
        const file = files.find((f) => f.id === targetId);
        if (file) {
          e.preventDefault();
          setDeleteConfirmFile(file);
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (files.length === 0) return;
        e.preventDefault();
        const idx = files.findIndex((f) => f.id === (focusedFileId ?? selectedFileId));
        const nextIdx = e.key === "ArrowDown"
          ? (idx < 0 ? 0 : Math.min(idx + 1, files.length - 1))
          : (idx <= 0 ? files.length - 1 : idx - 1);
        const target = files[nextIdx];
        if (target) {
          setFocusedFileId(target.id);
          void handleOpenFileRef.current(target);
          setTimeout(() => {
            const el = filesListRef.current?.querySelector(`[data-file-id="${target.id}"]`);
            if (el && el instanceof HTMLElement) el.focus();
          }, 0);
        }
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
      fileCacheRef.current.set(file.id, { ...file });
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
    const cache = fileCacheRef.current;

    // Before switching: persist current editor content into cache for the previously selected file
    if (selectedFileId && selectedFileId !== file.id) {
      const prevEntry = files.find((f) => f.id === selectedFileId);
      cache.set(selectedFileId, {
        id: selectedFileId,
        name: prevEntry?.name ?? "untitled",
        code,
      });
    }

    const cached = cache.get(file.id);
    if (cached) {
      onSelectFile(cached);
      onCodeChange(cached.code);
      onSelectedFileIdChange(cached.id);
      setFocusedFileId(cached.id);
      return;
    }

    try {
      const { file: full } = await getFile(file.id);
      cache.set(full.id, { ...full });
      onSelectFile(full);
      onCodeChange(full.code);
      onSelectedFileIdChange(full.id);
      setFocusedFileId(full.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open file");
    }
  };
  handleOpenFileRef.current = handleOpenFile;

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
      const existing = fileCacheRef.current.get(editingNameId);
      if (existing) fileCacheRef.current.set(editingNameId, { ...existing, name: updated.file.name });
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
      fileCacheRef.current.delete(id);
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
      const cached = fileCacheRef.current.get(file.id);
      if (cached) {
        codeToExport = cached.code;
      } else {
        try {
          const { file: full } = await getFile(file.id);
          fileCacheRef.current.set(full.id, { ...full });
          codeToExport = full.code;
        } catch {
          setError("Failed to load file for export");
          return;
        }
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
                padding: "0.35rem 0.65rem",
                borderRadius: "999px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                cursor: loading || isCreatingNew ? "not-allowed" : "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              + New file
            </button>
          </div>
          <div
            ref={filesListRef}
            style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setFocusedFileId(null);
            }}
          >
            {isCreatingNew && (
              <div
                style={{
                  padding: "0.35rem 0.65rem",
                  marginBottom: 0,
                  borderRadius: "999px",
                  border: "1px solid var(--accent-color)",
                  backgroundColor: "var(--bg-tertiary)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
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
            {files.map((file) => {
              const isSelected = selectedFileId === file.id;
              const isFocused = focusedFileId === file.id;
              return (
              <div
                key={file.id}
                data-file-id={file.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setFocusedFileId(file.id);
                  if (!isSelected) void handleOpenFile(file);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEditName(file);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, file });
                }}
                tabIndex={0}
                style={{
                  padding: "0.35rem 0.65rem",
                  marginBottom: 0,
                  borderRadius: "999px",
                  cursor: "pointer",
                  backgroundColor: isSelected
                    ? "var(--accent-color)"
                    : isFocused
                      ? "var(--bg-tertiary)"
                      : "transparent",
                  color: isSelected ? "var(--button-text)" : "var(--text-primary)",
                  border: isSelected
                    ? "1px solid var(--accent-color)"
                    : isFocused
                      ? "1px solid var(--border-color)"
                      : "1px solid transparent",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
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
            );
            })}
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
              }}
            >
              {codeTheme ? (
                <ProjectContentBody content={selectedProject.content} codeTheme={codeTheme} />
              ) : (
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                  {selectedProject.content}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

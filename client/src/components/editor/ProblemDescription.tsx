import { useMemo, useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { ProblemSummary, ProblemCompletionState } from "../../api/problems";

/** Same deselected look as the language tag for all tags in the problem description. */
const tagDeselectedStyle = {
  backgroundColor: "var(--language-tag-bg, rgba(148, 163, 184, 0.2))",
  color: "var(--language-tag-text, inherit)",
  border: "1px solid var(--border-color)",
} as const;
import type { ValidationResult } from "../../types/validation";

const READ_ONLY_EXTENSIONS: Extension[] = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

const NO_SOLUTION_PLACEHOLDER =
  "No solution is available yet. We'll add official solutions in a future update.";

type TabKind = "problem" | "solution";

/** Reusable body: parses markdown-like text (``` blocks, **bold*, *italic*, Input:/Output:) and renders. Code blocks use read-only CodeMirror with the given theme. */
function ResolvedContentBody({
  content,
  codeTheme,
}: {
  content: string;
  codeTheme: Extension;
}) {
  const hintContainerRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  const hintsMatch = content.match(/\{hints:\s*([^}]+)\}/i);
  const hintsText = hintsMatch ? hintsMatch[1].trim() : "";
  const mainText = hintsMatch ? content.replace(hintsMatch[0], "").trim() : content;

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const onToggle = () => {
      if (details.open && hintContainerRef.current) {
        requestAnimationFrame(() => {
          hintContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });
      }
    };
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, [hintsText]);

  const nodes = useMemo(() => {
    const renderRichText = (text: string): ReactNode[] => {
      const parts = text.split(/```/);
      const out: ReactNode[] = [];
      parts.forEach((part, idx) => {
        if (idx % 2 === 1) {
          out.push(
            <div
              key={`code-${idx}`}
              style={{
                margin: "0.75rem 0",
                borderRadius: "6px",
                overflow: "hidden",
                border: "1px solid var(--border-color)",
                fontSize: "0.9rem",
              }}
              className="problem-description-inline-code"
            >
              <CodeMirror
                value={part.trim()}
                height="100px"
                theme={codeTheme}
                extensions={READ_ONLY_EXTENSIONS}
                basicSetup={{ lineNumbers: false, foldGutter: false }}
                style={{ fontSize: "0.9rem" }}
              />
            </div>
          );
        } else {
          const paragraphs = part
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean);
          paragraphs.forEach((p, pIdx) => {
            const raw = p;
            const lower = raw.toLowerCase();
            if (lower.startsWith("input:") || lower.startsWith("output:")) {
              const [label, ...restParts] = raw.split(":");
              const rest = restParts.join(":").trim();
              out.push(
                <div
                  key={`io-${idx}-${pIdx}`}
                  style={{
                    margin: "1rem 0 0.75rem",
                    padding: "0.6rem 0.8rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(148, 163, 184, 0.12)",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "baseline",
                    gap: "0.5rem",
                    fontSize: "1.02rem",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 650,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontSize: "0.9rem",
                    }}
                  >
                    {label}:
                  </span>
                  {rest && <span>{rest}</span>}
                </div>
              );
            } else {
              const withBold = raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
              const withItalics = withBold.replace(/\*(.+?)\*/g, "<em>$1</em>");
              out.push(
                <p
                  key={`p-${idx}-${pIdx}`}
                  style={{ marginBottom: "0.9rem" }}
                  dangerouslySetInnerHTML={{ __html: withItalics }}
                />
              );
            }
          });
        }
      });
      return out;
    };
    return mainText ? renderRichText(mainText) : [];
  }, [mainText, codeTheme]);

  return (
    <>
      {nodes}
      {hintsText && (
        <details
          ref={detailsRef}
          style={{
            marginTop: "1.25rem",
            borderTop: "1px dashed var(--border-color)",
            paddingTop: "0.75rem",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              padding: "0.35rem 0.7rem",
              borderRadius: "999px",
              fontSize: "0.95rem",
              ...tagDeselectedStyle,
            }}
          >
            Show hint
          </summary>
          <div
            ref={hintContainerRef}
            style={{
              marginTop: "0.75rem",
              fontSize: "0.95rem",
              padding: "0.75rem 0",
            }}
          >
            {hintsText}
          </div>
        </details>
      )}
    </>
  );
}

const truncateTitle = (title: string, maxLen: number) =>
  title.length > maxLen ? `${title.slice(0, maxLen)}...` : title;

type Workspace = string;

export interface ProblemDescriptionProps {
  selectedProblem: ProblemSummary | null;
  problemTitle: string;
  /** Problem instructions (schema: instructions). Rendered as markdown; ``` blocks shown in read-only code editor. */
  problemDescription: string;
  visibleProblems: ProblemSummary[];
  completionStatuses: Record<string, ProblemCompletionState>;
  onSelectProblem: (problem: ProblemSummary) => void;
  lastValidationResult: ValidationResult | null;
  codeTheme: Extension;
  /** Reference solution (schema: solution). Null when not available. Same rendering as description (code blocks in read-only CodeMirror). */
  solution: string | null;
  workspace?: Workspace;
  isPlaygroundMode?: boolean;
  onGoToPlayground?: () => void;
  /** True while full problem data is being fetched (show Loading... in description area). */
  isLoading?: boolean;
}

export default function ProblemDescription({
  selectedProblem,
  problemTitle,
  problemDescription,
  visibleProblems,
  completionStatuses,
  onSelectProblem,
  lastValidationResult,
  codeTheme,
  solution,
  workspace: _unusedWorkspace,
  isPlaygroundMode,
  onGoToPlayground,
  isLoading = false,
}: ProblemDescriptionProps) {
  void _unusedWorkspace;
  const [activeTab, setActiveTab] = useState<TabKind>("problem");
  const validationResultRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const SCROLL_STORAGE_KEY_PREFIX = "editor_problem_scroll_";

  useEffect(() => {
    if (!lastValidationResult) return;
    const el = validationResultRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [lastValidationResult]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !selectedProblem?.id) return;
    const key = `${SCROLL_STORAGE_KEY_PREFIX}${selectedProblem.id}_${activeTab}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const scrollTop = parseInt(saved, 10);
        if (Number.isFinite(scrollTop)) {
          requestAnimationFrame(() => {
            el.scrollTop = scrollTop;
          });
        }
      }
    } catch {
      // ignore
    }
  }, [selectedProblem?.id, activeTab]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !selectedProblem?.id) return;
    const key = `${SCROLL_STORAGE_KEY_PREFIX}${selectedProblem.id}_${activeTab}`;
    try {
      localStorage.setItem(key, String(el.scrollTop));
    } catch {
      // ignore
    }
  }, [selectedProblem?.id, activeTab]);

  return (
    <div
      className="problem-description"
      style={{
        padding: "2rem",
        height: "100%",
        boxSizing: "border-box",
        fontSize: "1rem",
        lineHeight: 1.6,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Prev/Next nav */}
      {selectedProblem && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "stretch",
            marginBottom: "0.75rem",
            paddingBottom: "0.5rem",
            borderBottom: "1px solid rgba(148,163,184,0.4)",
            overflow: "hidden",
          }}
        >
          <div style={{ flex: 1, display: "flex" }}>
            {(() => {
              const idx = visibleProblems.findIndex((p) => p.id === selectedProblem.id);
              if (idx <= 0) {
                return (
                  <div style={{ visibility: "hidden", pointerEvents: "none" }}>
                    <button type="button" aria-hidden />
                  </div>
                );
              }
              const prev = visibleProblems[idx - 1];
              const prevCompleted = completionStatuses[prev.id];
              return (
                <button
                  type="button"
                  onClick={() => onSelectProblem(prev)}
                  className="editor-problem-nav-button"
                >
                  <div className="editor-problem-nav-meta">
                    <span style={{ fontSize: "0.9rem" }}>← Previous</span>
                    <span
                      className="editor-difficulty-pill-small"
                      style={tagDeselectedStyle}
                    >
                      {prev.difficulty}
                    </span>
                    {prevCompleted && (
                      <span
                        className="editor-completion-pill"
                        style={{
                          backgroundColor:
                            prevCompleted === "completed"
                              ? "var(--status-completed-bg)"
                              : "var(--status-attempted-bg)",
                          color:
                            prevCompleted === "completed"
                              ? "var(--status-completed-text)"
                              : "var(--status-attempted-text)",
                          border: `1px solid ${
                            prevCompleted === "completed"
                              ? "var(--status-completed-border)"
                              : "var(--status-attempted-border)"
                          }`,
                        }}
                      >
                        {prevCompleted === "completed" ? "+" : "-"}
                      </span>
                    )}
                  </div>
                  <div className="editor-problem-nav-title">
                    {truncateTitle(prev.title, 22)}
                  </div>
                </button>
              );
            })()}
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            {(() => {
              const idx = visibleProblems.findIndex((p) => p.id === selectedProblem.id);
              if (idx === -1 || idx >= visibleProblems.length - 1) {
                return (
                  <div style={{ visibility: "hidden", pointerEvents: "none" }}>
                    <button type="button" aria-hidden />
                  </div>
                );
              }
              const next = visibleProblems[idx + 1];
              const nextCompleted = completionStatuses[next.id];
              return (
                <button
                  type="button"
                  onClick={() => onSelectProblem(next)}
                  className="editor-problem-nav-button"
                >
                  <div className="editor-problem-nav-meta">
                    <span style={{ fontSize: "0.9rem" }}>Next →</span>
                    <span
                      className="editor-difficulty-pill-small"
                      style={tagDeselectedStyle}
                    >
                      {next.difficulty}
                    </span>
                    {nextCompleted && (
                      <span
                        className="editor-completion-pill"
                        style={{
                          backgroundColor:
                            nextCompleted === "completed"
                              ? "var(--status-completed-bg)"
                              : "var(--status-attempted-bg)",
                          color:
                            nextCompleted === "completed"
                              ? "var(--status-completed-text)"
                              : "var(--status-attempted-text)",
                          border: `1px solid ${
                            nextCompleted === "completed"
                              ? "var(--status-completed-border)"
                              : "var(--status-attempted-border)"
                          }`,
                        }}
                      >
                        {nextCompleted === "completed" ? "+" : "-"}
                      </span>
                    )}
                  </div>
                  <div className="editor-problem-nav-title">
                    {truncateTitle(next.title, 22)}
                  </div>
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Title + difficulty/completion tags */}
      <div style={{ flexShrink: 0, marginBottom: "1.1rem" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "1.3rem",
            letterSpacing: "0.02em",
            wordBreak: "break-word",
          }}
        >
          {problemTitle || "Select a problem"}
        </h3>
        {selectedProblem && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
            <span
              style={{
                padding: "0.2rem 0.7rem",
                borderRadius: "999px",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                ...tagDeselectedStyle,
              }}
            >
              {selectedProblem.difficulty}
            </span>
            <span
              style={{
                padding: "0.2rem 0.7rem",
                borderRadius: "999px",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                backgroundColor: "var(--language-tag-bg, rgba(148, 163, 184, 0.2))",
                color: "var(--language-tag-text, inherit)",
                border: "1px solid var(--border-color)",
              }}
            >
              {selectedProblem.language}
            </span>
            {completionStatuses[selectedProblem.id] && (
              <span
                style={{
                  padding: "0.2rem 0.7rem",
                  borderRadius: "999px",
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  backgroundColor:
                    completionStatuses[selectedProblem.id] === "completed"
                      ? "var(--status-completed-bg)"
                      : "var(--status-attempted-bg)",
                  color:
                    completionStatuses[selectedProblem.id] === "completed"
                      ? "var(--status-completed-text)"
                      : "var(--status-attempted-text)",
                  border: `1px solid ${
                    completionStatuses[selectedProblem.id] === "completed"
                      ? "var(--status-completed-border)"
                      : "var(--status-attempted-border)"
                  }`,
                }}
              >
                {completionStatuses[selectedProblem.id] === "completed"
                  ? "Completed"
                  : "Attempted"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Scrollable main content: problem/solution body + validation */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          marginBottom: "0.5rem",
        }}
      >
        {/* Problem (instructions) or Solution (reference solution); both support markdown and ``` code blocks */}
        {activeTab === "problem" && selectedProblem && isLoading && (
          <p className="problem-description-loading" style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>
            Loading
            <span className="problem-description-loading-dots" aria-hidden>
              <span>.</span><span>.</span><span>.</span>
            </span>
          </p>
        )}
        {!problemDescription && activeTab === "problem" && !isLoading && (
          <p style={{ color: "var(--text-secondary)" }}>Select a problem from the <strong>Problems</strong> menu above to view its description.</p>
        )}
        {activeTab === "problem" && problemDescription && !isLoading && (
          <ResolvedContentBody content={problemDescription} codeTheme={codeTheme} />
        )}
        {activeTab === "solution" && (
          <>
            {solution === null || solution === "" ? (
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontStyle: "italic",
                  marginTop: "0.5rem",
                }}
              >
                {NO_SOLUTION_PLACEHOLDER}
              </p>
            ) : (
              <ResolvedContentBody content={solution} codeTheme={codeTheme} />
            )}
          </>
        )}

        {/* Validation result */}
        {lastValidationResult && (
        <div
          ref={validationResultRef}
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            backgroundColor: lastValidationResult.passed
              ? "var(--status-completed-bg)"
              : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${
              lastValidationResult.passed ? "var(--status-completed-border)" : "var(--danger-color)"
            }`,
            fontSize: "0.9rem",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            {lastValidationResult.passed ? "All tests passed" : "Validation result"}
          </div>
          <div style={{ marginBottom: "0.5rem" }}>{lastValidationResult.summary}</div>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", listStyle: "disc" }}>
            {lastValidationResult.tests.map((t) => (
              <li key={t.id} style={{ marginBottom: "0.25rem" }}>
                <span
                  style={{
                    color: t.passed ? "var(--status-completed-text)" : "var(--danger-color)",
                  }}
                >
                  {t.passed ? "Passed" : "Failed"}: {t.id}
                </span>
                {t.message && !t.passed && (
                  <pre
                    style={{
                      margin: "0.25rem 0 0",
                      fontSize: "0.8rem",
                      whiteSpace: "pre-wrap",
                      overflow: "auto",
                    }}
                  >
                    {t.message}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>

      {/* Problem / Solution toggle at bottom; Playground button to the right */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "1.25rem",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className={`editor-tab-button ${activeTab === "problem" ? "editor-tab-button--selected" : ""}`}
          onClick={() => setActiveTab("problem")}
        >
          Problem
        </button>
        <button
          type="button"
          className={`editor-tab-button ${activeTab === "solution" ? "editor-tab-button--selected" : ""}`}
          onClick={() => setActiveTab("solution")}
        >
          Solution
        </button>
        {onGoToPlayground && !isPlaygroundMode && (
          <button
            type="button"
            className="editor-tab-button"
            onClick={onGoToPlayground}
            style={{ marginLeft: "auto" }}
          >
            Playground
          </button>
        )}
      </div>
    </div>
  );
}

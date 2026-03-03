import { useEffect, useMemo, useRef, useState } from "react";
import { listProblems, type Difficulty, type ProblemSummary, type ProblemLanguage, type ProblemCompletionState } from "../api/problems";

type Workspace = "unix" | "cuda";

interface SidebarProps {
    selectedProblemId?: string | null;
    onSelectProblem?: (problem: ProblemSummary) => void;
    onProblemsLoaded?: (problems: ProblemSummary[], workspace: Workspace) => void;
    completionStatuses?: Record<string, ProblemCompletionState>;
    workspace?: Workspace;
    showHeader?: boolean;
}

export default function Sidebar({ selectedProblemId, onSelectProblem, onProblemsLoaded, completionStatuses, workspace = "unix", showHeader = true }: SidebarProps) {
    const [search, setSearch] = useState("");
    // Default difficulty view should focus on Learn tier first instead of Easy.
    const [difficulty, setDifficulty] = useState<"all" | Difficulty>("learn");
    const [language, setLanguage] = useState<"all" | ProblemLanguage>("all");
    const [problems, setProblems] = useState<ProblemSummary[]>([]);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const listContainerRef = useRef<HTMLDivElement | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filters = useMemo(() => {
        const baseLanguage = language;
        const effectiveLanguage: "all" | ProblemLanguage =
            workspace === "cuda" ? "cuda" : baseLanguage;

        return {
            search: search.trim() ? search.trim() : undefined,
            difficulty: difficulty === "all" ? undefined : difficulty,
            language: effectiveLanguage,
        };
    }, [search, difficulty, language, workspace]);

    const allowedLanguagesForWorkspace: Record<Workspace, ProblemLanguage[]> = {
        unix: ["unix", "awk", "bash", "any"],
        cuda: ["cuda"],
    };

    const FILTER_STORAGE_KEY = `sidebar_filters_v1_${workspace}`;

    // Load persisted search / difficulty / language filters when Sidebar mounts.
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                search?: string;
                difficulty?: "all" | Difficulty;
                language?: "all" | ProblemLanguage;
            };
            if (typeof parsed.search === "string") {
                setSearch(parsed.search);
            }
            if (parsed.difficulty === "all" || ["learn", "easy", "medium", "hard"].includes(parsed.difficulty as string)) {
                setDifficulty(parsed.difficulty as "all" | Difficulty);
            }
            if (
                parsed.language === "all" ||
                ["unix", "awk", "bash", "cuda", "any"].includes(parsed.language as string)
            ) {
                setLanguage(parsed.language as "all" | ProblemLanguage);
            }
        } catch {
            // ignore invalid persisted state
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace]);

    // Persist filters so closing/opening the problems dropdown keeps the same query.
    useEffect(() => {
        try {
            const payload = JSON.stringify({ search, difficulty, language });
            window.localStorage.setItem(FILTER_STORAGE_KEY, payload);
        } catch {
            // ignore quota / storage issues
        }
    }, [search, difficulty, language, FILTER_STORAGE_KEY]);

    useEffect(() => {
        let active = true;
        const fetchProblems = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await listProblems({ ...filters, limit: 50, page: 1 });
                if (!active) return;
                const allowed = data.problems.filter((p) =>
                    allowedLanguagesForWorkspace[workspace].includes(p.language)
                );

                // Ensure difficulty ordering is Learn → Easy → Medium → Hard even if server changes.
                const difficultyOrder: Record<Difficulty, number> = {
                    learn: 0,
                    easy: 1,
                    medium: 2,
                    hard: 3,
                };
                allowed.sort((a, b) => {
                    const da = difficultyOrder[a.difficulty];
                    const db = difficultyOrder[b.difficulty];
                    if (da !== db) return da - db;
                    return a.id.localeCompare(b.id);
                });

                setProblems(allowed);
                setTotalCount(data.total ?? allowed.length);
                onProblemsLoaded?.(allowed, workspace);
                try {
                    window.localStorage.setItem("problems_cache_v1", JSON.stringify(data.problems));
                } catch {
                    // ignore cache write errors
                }
            } catch (err) {
                if (!active) return;
                setError("Unable to load problems.");
                setProblems([]);
                console.error(err);
            } finally {
                if (active) setLoading(false);
            }
        };

        // Load from cache first (if available), but re-apply current filters
        try {
            const cached = window.localStorage.getItem("problems_cache_v1");
            if (cached) {
                const all = JSON.parse(cached) as ProblemSummary[];
                const filtered = all.filter((p) => {
                    if (!allowedLanguagesForWorkspace[workspace].includes(p.language)) {
                        return false;
                    }
                    if (filters.search) {
                        const lower = filters.search.toLowerCase();
                        if (!p.title.toLowerCase().includes(lower) && !p.id.toLowerCase().includes(lower)) {
                            return false;
                        }
                    }
                    if (filters.difficulty && p.difficulty !== filters.difficulty) {
                        return false;
                    }
                    if (filters.language && filters.language !== "all" && p.language !== filters.language) {
                        return false;
                    }
                    return true;
                });
                setProblems(filtered);
                if (totalCount === null) {
                    setTotalCount(all.length);
                }
                onProblemsLoaded?.(filtered, workspace);
            }
        } catch {
            // ignore parse errors
        }

        fetchProblems();
        return () => {
            active = false;
        };
    }, [filters]);

    // When selected problem changes, scroll it into view (centered) within the list
    useEffect(() => {
        if (!selectedProblemId || !listContainerRef.current) return;
        const container = listContainerRef.current;
        const el = container.querySelector<HTMLElement>(`[data-problem-id="${selectedProblemId}"]`);
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: "auto" });
    }, [selectedProblemId, problems.length]);

    return (
        <div
            style={{
                width: "100%",
                backgroundColor: "var(--bg-secondary)",
                borderRight: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                padding: "1rem",
                boxSizing: "border-box",
                overflow: "hidden"
            }}
        >
            {showHeader && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h2 style={{ margin: 0 }}>Problems</h2>
                </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1, overflow: "hidden" }}>
                {/* Search & filters (fixed at top) */}
                <div style={{ flexShrink: 0 }}>
                        <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                            Search
                        </label>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name"
                            style={{
                                width: "100%",
                                padding: "0.4rem 0.5rem",
                                borderRadius: "4px",
                                border: "1px solid var(--border-color)",
                                backgroundColor: "var(--bg-tertiary)",
                                color: "var(--text-primary)",
                            }}
                        />
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
                                    Difficulty
                                </label>
                                <select
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value as "all" | Difficulty)}
                                    style={{
                                        width: "100%",
                                        padding: "0.35rem",
                                        borderRadius: "4px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-tertiary)",
                                        color: "var(--text-primary)",
                                    }}
                                >
                                    <option value="all">All</option>
                                    <option value="learn">Learn</option>
                                    <option value="easy">Easy</option>
                                    <option value="medium">Medium</option>
                                    <option value="hard">Hard</option>
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
                                    Language
                                </label>
                                <select
                                    value={workspace === "cuda" ? "cuda" : language}
                                    onChange={(e) => setLanguage(e.target.value as "all" | ProblemLanguage)}
                                    disabled={workspace === "cuda"}
                                    style={{
                                        width: "100%",
                                        padding: "0.35rem",
                                        borderRadius: "4px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-tertiary)",
                                        color: "var(--text-primary)",
                                        opacity: workspace === "cuda" ? 0.7 : 1,
                                        cursor: workspace === "cuda" ? "not-allowed" : "pointer",
                                    }}
                                >
                                    {workspace === "cuda" ? (
                                        <option value="cuda">CUDA</option>
                                    ) : (
                                        <>
                                            <option value="all">All</option>
                                            <option value="unix">Unix</option>
                                            <option value="awk">Awk</option>
                                            <option value="bash">Bash</option>
                                            <option value="any">Any</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>
                        {totalCount !== null && (
                            <div
                                style={{
                                    marginTop: "0.45rem",
                                    fontSize: "0.75rem",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                Showing <strong>{problems.length}</strong> of <strong>{totalCount}</strong>
                            </div>
                        )}
                </div>

                {/* Scrollable problems list */}
                <div
                    ref={listContainerRef}
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        overscrollBehavior: "contain",
                        marginTop: "0.75rem",
                        paddingRight: "0.25rem",
                    }}
                >
                        {loading && <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Loading problems...</div>}
                        {!loading && error && <div style={{ fontSize: "0.9rem", color: "var(--accent-hover)" }}>{error}</div>}
                        {!loading && !error && problems.length === 0 && (
                            <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>No problems found.</div>
                        )}
                        {!loading && !error && problems.length > 0 && (
                            <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
                                {problems.map((problem, index) => {
                                    const number = String(index + 1).padStart(2, "0");
                                    const status = completionStatuses?.[problem.id];
                                    const isSelected = selectedProblemId === problem.id;
                                    const difficultyColors: Record<Difficulty, { bg: string; text: string }> = {
                                        learn: { bg: "#06b6d4", text: "#e0f2f1" },
                                        easy: { bg: "#1b5e20", text: "#dcedc8" },
                                        medium: { bg: "#f9a825", text: "#1b1b1b" },
                                        hard: { bg: "#b71c1c", text: "#ffcdd2" },
                                    };
                                    const languageColors: Record<ProblemLanguage, { bg: string; text: string }> = {
                                        awk: { bg: "#1565c0", text: "#e3f2fd" },
                                        bash: { bg: "#5d4037", text: "#efebe9" },
                                        unix: { bg: "#00695c", text: "#e0f2f1" },
                                        cuda: { bg: "#0f766e", text: "#e0f2f1" },
                                        any: { bg: "#424242", text: "#e0e0e0" },
                                    };
                                    return (
                                    <li
                                        key={problem.id}
                                        data-problem-id={problem.id}
                                        style={{
                                            padding: "0.6rem 0.5rem",
                                            borderBottom: "1px solid var(--border-color)",
                                            cursor: "pointer",
                                            color: "var(--text-primary)",
                                            backgroundColor: isSelected ? "var(--bg-tertiary)" : "transparent",
                                            borderRadius: "8px",
                                            marginBottom: "0.3rem",
                                            boxShadow: isSelected ? "0 0 0 1px var(--accent-color)" : "none",
                                            position: "relative",
                                        }}
                                        title={`${problem.title} (${problem.difficulty}, ${problem.language})`}
                                        onClick={() => onSelectProblem?.(problem)}
                                    >
                                        {isSelected && (
                                            <div
                                                style={{
                                                    position: "absolute",
                                                    left: 0,
                                                    top: 0,
                                                    bottom: 0,
                                                    width: "3px",
                                                    borderRadius: "3px 0 0 3px",
                                                    backgroundColor: "var(--accent-color)",
                                                }}
                                            />
                                        )}
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", minWidth: "2ch", textAlign: "right" }}>
                                                {number}
                                            </span>
                                            {status && (
                                                <span
                                                    aria-label={status === "completed" ? "Completed" : "Attempted"}
                                                    title={status === "completed" ? "+" : "-"}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        width: "18px",
                                                        height: "18px",
                                                        borderRadius: "50%",
                                                        border: `2px solid ${status === "completed" ? "#4caf50" : "#ffeb3b"}`,
                                                        color: status === "completed" ? "#4caf50" : "#ffeb3b",
                                                        fontSize: "0.75rem",
                                                        boxSizing: "border-box",
                                                    }}
                                                >
                                                    {status === "completed" ? "+" : "-"}
                                                </span>
                                            )}
                                            <span style={{ fontSize: "0.95rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {problem.title}
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                                            <span
                                                style={{
                                                    padding: "0.15rem 0.45rem",
                                                    borderRadius: "6px",
                                                    fontSize: "0.7rem",
                                                    backgroundColor: difficultyColors[problem.difficulty].bg,
                                                    color: difficultyColors[problem.difficulty].text,
                                                }}
                                            >
                                                {problem.difficulty}
                                            </span>
                                            <span
                                                style={{
                                                    padding: "0.15rem 0.45rem",
                                                    borderRadius: "6px",
                                                    fontSize: "0.7rem",
                                                    backgroundColor: languageColors[problem.language].bg,
                                                    color: languageColors[problem.language].text,
                                                }}
                                            >
                                                {problem.language}
                                            </span>
                                        </div>
                                    </li>
                                );
                                })}
                            </ul>
                        )}
                </div>
            </div>
        </div>
    );
}

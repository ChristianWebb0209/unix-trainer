import { useEffect, useMemo, useRef, useState } from "react";
import { primaryPillUnselected } from "../../uiStyles";
import { listProblems, type Difficulty, type ProblemSummary, type ProblemLanguage, type ProblemCompletionState } from "../../api/problems";
import * as problemConfig from "problem-config";

type Workspace = ReturnType<typeof problemConfig.getWorkspaceIds>[number];

export interface ProblemDropdownProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    selectedProblemId: string | null;
    onSelectProblem: (problem: ProblemSummary) => void | Promise<void>;
    onProblemsLoaded: (problems: ProblemSummary[], workspace: Workspace) => void;
    completionStatuses: Record<string, ProblemCompletionState>;
    workspace: Workspace;
    isPlaygroundMode?: boolean;
    onGoToPlayground?: () => void;
}

const FILTER_STORAGE_KEY_PREFIX = "problems_dropdown_filters_v1_";

const DIFFICULTY_COLORS: Record<Difficulty, { bg: string; text: string }> = {
    learn: { bg: "#06b6d4", text: "#e0f2f1" },
    easy: { bg: "#1b5e20", text: "#dcedc8" },
    medium: { bg: "#f9a825", text: "#1b1b1b" },
    hard: { bg: "#b71c1c", text: "#ffcdd2" },
};

const LANGUAGE_PALETTE = [
    { bg: "#1565c0", text: "#e3f2fd" },
    { bg: "#5d4037", text: "#efebe9" },
    { bg: "#00695c", text: "#e0f2f1" },
    { bg: "#555555", text: "#e8e8e8" },
    { bg: "#659ad2", text: "#e3f2fd" },
    { bg: "#dea584", text: "#1a1a1a" },
    { bg: "#0f766e", text: "#e0f2f1" },
    { bg: "#ac1e2c", text: "#ffebee" },
    { bg: "#0071c5", text: "#e3f2fd" },
    { bg: "#424242", text: "#e0e0e0" },
];

function getLanguageColors(): Record<string, { bg: string; text: string }> {
    const ids = problemConfig.PROBLEM_LANGUAGE_IDS as string[];
    const out: Record<string, { bg: string; text: string }> = {};
    ids.forEach((id, i) => {
        out[id] = LANGUAGE_PALETTE[i % LANGUAGE_PALETTE.length];
    });
    return out;
}

const LANGUAGE_COLORS = getLanguageColors();

function getLanguageLabel(langId: string): string {
    const entry = (problemConfig.PROBLEM_LANGUAGES as Record<string, { label?: string }>)[langId];
    return entry?.label ?? langId;
}

function getDifficultyLabel(d: string): string {
    return d.charAt(0).toUpperCase() + d.slice(1);
}

export default function ProblemDropdown({
    isOpen,
    onOpenChange,
    selectedProblemId,
    onSelectProblem,
    onProblemsLoaded,
    completionStatuses,
    workspace,
    isPlaygroundMode,
    onGoToPlayground,
}: ProblemDropdownProps) {
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
    const listContainerRef = useRef<HTMLDivElement | null>(null);

    const [search, setSearch] = useState("");
    const [difficulty, setDifficulty] = useState<"all" | Difficulty>("learn");
    const [language, setLanguage] = useState<"all" | ProblemLanguage>("all");
    const [problems, setProblems] = useState<ProblemSummary[]>([]);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const PAGE_SIZE = 10;
    const totalPages = totalCount !== null ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 0;

    const getWorkspaceLanguages = (ws: Workspace): ProblemLanguage[] =>
        (problemConfig.getLanguagesForWorkspace(ws) as ProblemLanguage[]) ?? [];

    const filters = useMemo(
        () => ({
            search: search.trim() || undefined,
            difficulty: difficulty === "all" ? undefined : difficulty,
            language,
        }),
        [search, difficulty, language]
    );

    const storageKey = `${FILTER_STORAGE_KEY_PREFIX}${workspace}`;

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                search?: string;
                difficulty?: "all" | Difficulty;
                language?: "all" | ProblemLanguage;
                page?: number;
            };
            if (typeof parsed.search === "string") setSearch(parsed.search);
            if (parsed.difficulty === "all" || problemConfig.DIFFICULTIES.includes(parsed.difficulty as Difficulty)) {
                setDifficulty(parsed.difficulty as "all" | Difficulty);
            }
            const wsLangs = getWorkspaceLanguages(workspace);
            if (parsed.language === "all" || wsLangs.includes(parsed.language as ProblemLanguage)) {
                setLanguage(parsed.language as "all" | ProblemLanguage);
            }
            if (typeof parsed.page === "number" && parsed.page >= 1) setPage(parsed.page);
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace]);

    useEffect(() => {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({ search, difficulty, language, page }));
        } catch {
            // ignore
        }
    }, [storageKey, search, difficulty, language, page]);

    // Reset to page 1 only when filters or workspace change (not when just opening the dropdown)
    const prevFilterKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const key = JSON.stringify({ ...filters, workspace });
        if (prevFilterKeyRef.current !== null && prevFilterKeyRef.current !== key) {
            setPage(1);
        }
        prevFilterKeyRef.current = key;
    }, [filters, workspace]);

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        const fetchProblems = async () => {
            setLoading(true);
            setError(null);
            try {
                const wsLangs = getWorkspaceLanguages(workspace);
                const data = await listProblems({
                    ...filters,
                    languageIn: wsLangs as ProblemLanguage[],
                    limit: PAGE_SIZE,
                    page,
                });
                if (!active) return;
                const wsLangsForFilter = getWorkspaceLanguages(workspace);
                const allowed = data.problems.filter((p) => wsLangsForFilter.includes(p.language));
                allowed.sort((a, b) => {
                    const da = problemConfig.DIFFICULTY_ORDER[a.difficulty];
                    const db = problemConfig.DIFFICULTY_ORDER[b.difficulty];
                    if (da !== db) return da - db;
                    return a.id.localeCompare(b.id);
                });
                setProblems(allowed);
                setTotalCount(data.total ?? allowed.length);
                onProblemsLoaded(allowed, workspace);
            } catch (err) {
                if (!active) return;
                setError("Unable to load problems.");
                setProblems([]);
                console.error(err);
            } finally {
                if (active) setLoading(false);
            }
        };
        fetchProblems();
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when dropdown opens, filters, workspace or page change
    }, [isOpen, filters, workspace, page]);

    // Clamp page to valid range when total count is known (e.g. after filter change or restore from storage)
    useEffect(() => {
        if (totalPages > 0 && page > totalPages) setPage(totalPages);
    }, [totalPages, page]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (overlayRef.current?.contains(target)) return;
            if (toggleButtonRef.current?.contains(target)) return;
            onOpenChange(false);
        };
        window.addEventListener("mousedown", handleClick);
        return () => window.removeEventListener("mousedown", handleClick);
    }, [isOpen, onOpenChange]);

    const handleSelect = async (p: ProblemSummary) => {
        await onSelectProblem(p);
    };

    return (
        <>
            <button
                ref={toggleButtonRef}
                type="button"
                onClick={() => onOpenChange(!isOpen)}
                style={{ marginLeft: "0.5rem", ...primaryPillUnselected }}
            >
                Problems {isOpen ? "▲" : "▼"}
            </button>
            {isOpen && (
                <div
                    ref={overlayRef}
                    style={{
                        position: "fixed",
                        top: "40px",
                        left: 0,
                        zIndex: 25,
                        display: "flex",
                        alignItems: "flex-start",
                    }}
                >
                    <div
                        style={{
                            marginLeft: "12rem",
                            marginTop: "0.5rem",
                            width: "360px",
                            height: "70vh",
                            borderRadius: "10px",
                            boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
                            overflow: "hidden",
                            backgroundColor: "var(--bg-secondary)",
                            display: "flex",
                            flexDirection: "column",
                            padding: "1rem",
                            boxSizing: "border-box",
                        }}
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1, overflow: "hidden" }}>
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
                                            {[...problemConfig.DIFFICULTIES].map((d) => (
                                                <option key={d} value={d}>
                                                    {getDifficultyLabel(d)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
                                            Language
                                        </label>
                                        <select
                                            value={language}
                                            onChange={(e) => setLanguage(e.target.value as "all" | ProblemLanguage)}
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
                                            {getWorkspaceLanguages(workspace)
                                                .filter((langId) => langId !== "any")
                                                .map((langId) => (
                                                    <option key={langId} value={langId}>
                                                        {getLanguageLabel(langId)}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                </div>
                                {totalCount !== null && totalCount > 0 && (
                                    <div
                                        style={{
                                            marginTop: "0.45rem",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.5rem",
                                            fontSize: "0.75rem",
                                            color: "var(--text-secondary)",
                                        }}
                                    >
                                        <span>
                                            {(page - 1) * PAGE_SIZE + 1}–
                                            {Math.min(page * PAGE_SIZE, totalCount)} of <strong>{totalCount}</strong>
                                        </span>
                                        <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                            <button
                                                type="button"
                                                aria-label="Previous page"
                                                disabled={page <= 1}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPage((p) => Math.max(1, p - 1));
                                                }}
                                                style={{
                                                    padding: "0.2rem 0.35rem",
                                                    fontSize: "0.75rem",
                                                    lineHeight: 1,
                                                    border: "1px solid var(--border-color)",
                                                    borderRadius: "4px",
                                                    background: page <= 1 ? "var(--bg-tertiary)" : "var(--bg-primary)",
                                                    color: page <= 1 ? "var(--text-secondary)" : "var(--text-primary)",
                                                    cursor: page <= 1 ? "not-allowed" : "pointer",
                                                    opacity: page <= 1 ? 0.6 : 1,
                                                }}
                                            >
                                                ‹
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Next page"
                                                disabled={page >= totalPages}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPage((p) => Math.min(totalPages, p + 1));
                                                }}
                                                style={{
                                                    padding: "0.2rem 0.35rem",
                                                    fontSize: "0.75rem",
                                                    lineHeight: 1,
                                                    border: "1px solid var(--border-color)",
                                                    borderRadius: "4px",
                                                    background: page >= totalPages ? "var(--bg-tertiary)" : "var(--bg-primary)",
                                                    color: page >= totalPages ? "var(--text-secondary)" : "var(--text-primary)",
                                                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                                                    opacity: page >= totalPages ? 0.6 : 1,
                                                }}
                                            >
                                                ›
                                            </button>
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div
                                ref={listContainerRef}
                                style={{
                                    flex: 1,
                                    overflowY: "auto",
                                    overscrollBehavior: "contain",
                                    marginTop: "0.75rem",
                                    paddingLeft: "0.25rem",
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
                                            const number = String((page - 1) * PAGE_SIZE + index + 1).padStart(2, "0");
                                            const status = completionStatuses?.[problem.id];
                                            const isSelected = selectedProblemId === problem.id;
                                            const isCompleted = status === "completed";
                                            return (
                                                <li
                                                    key={problem.id}
                                                    data-problem-id={problem.id}
                                                    style={{
                                                        padding: "0.6rem 0.5rem",
                                                        borderBottom: isSelected ? undefined : "1px solid var(--border-color)",
                                                        cursor: "pointer",
                                                        color: "var(--text-primary)",
                                                        backgroundColor: isCompleted
                                                            ? "rgba(22, 163, 74, 0.15)"
                                                            : isSelected
                                                                ? "var(--bg-tertiary)"
                                                                : "transparent",
                                                        borderRadius: "8px",
                                                        marginBottom: "0.3rem",
                                                        border: isSelected
                                                            ? "1px solid var(--accent-color)"
                                                            : "1px solid transparent",
                                                        boxShadow: isCompleted ? "0 0 0 1px rgba(22,163,74,0.8)" : "none",
                                                        boxSizing: "border-box",
                                                    }}
                                                    title={`${problem.title} (${problem.difficulty}, ${problem.language})`}
                                                    onClick={() => void handleSelect(problem)}
                                                >
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", minWidth: "2ch", textAlign: "right" }}>
                                                            {number}
                                                        </span>
                                                        {status && (
                                                            <span
                                                                aria-label={status === "completed" ? "Completed" : "Attempted"}
                                                                title={status === "completed" ? "Completed" : "Attempted"}
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
                                                                {status === "completed" ? "✓" : "•"}
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
                                                                backgroundColor: DIFFICULTY_COLORS[problem.difficulty].bg,
                                                                color: DIFFICULTY_COLORS[problem.difficulty].text,
                                                            }}
                                                        >
                                                            {problem.difficulty}
                                                        </span>
                                                        <span
                                                            style={{
                                                                padding: "0.15rem 0.45rem",
                                                                borderRadius: "6px",
                                                                fontSize: "0.7rem",
                                                                backgroundColor: (LANGUAGE_COLORS[problem.language] ?? LANGUAGE_PALETTE[LANGUAGE_PALETTE.length - 1]).bg,
                                                                color: (LANGUAGE_COLORS[problem.language] ?? LANGUAGE_PALETTE[LANGUAGE_PALETTE.length - 1]).text,
                                                            }}
                                                        >
                                                            {getLanguageLabel(problem.language)}
                                                        </span>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                            {onGoToPlayground && !isPlaygroundMode && (
                                <div
                                    style={{
                                        flexShrink: 0,
                                        borderTop: "1px solid var(--border-color)",
                                        paddingTop: "0.75rem",
                                        marginTop: "0.25rem",
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => onGoToPlayground()}
                                        style={{
                                            width: "100%",
                                            padding: "0.5rem 0.75rem",
                                            borderRadius: "8px",
                                            border: "1px solid var(--border-color)",
                                            background: "var(--bg-tertiary)",
                                            color: "var(--text-primary)",
                                            fontSize: "0.9rem",
                                            cursor: "pointer",
                                            textAlign: "center",
                                        }}
                                    >
                                        Open Playground
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

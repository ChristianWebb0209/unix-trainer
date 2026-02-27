import { useContext, useEffect, useMemo, useState } from "react";
import { ThemeContext } from "../contexts/ThemeContext";
import { listProblems, type Difficulty, type ProblemSummary, type ProblemType } from "../api/problems";

interface SidebarProps {
    onLogin?: () => void;
    containerId: string | null;
    selectedProblemId?: string | null;
    onSelectProblem?: (problem: ProblemSummary) => void;
    onProblemsLoaded?: (problems: ProblemSummary[]) => void;
}

export default function Sidebar({ onLogin, containerId, selectedProblemId, onSelectProblem, onProblemsLoaded }: SidebarProps) {
    const { theme, toggleTheme } = useContext(ThemeContext);
    const [collapsed, setCollapsed] = useState(false);
    const [search, setSearch] = useState("");
    const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
    const [type, setType] = useState<"all" | ProblemType>("all");
    const [problems, setProblems] = useState<ProblemSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filters = useMemo(() => {
        return {
            search: search.trim() ? search.trim() : undefined,
            difficulty: difficulty === "all" ? undefined : difficulty,
            type: type === "all" ? undefined : type,
        };
    }, [search, difficulty, type]);

    useEffect(() => {
        let active = true;
        const fetchProblems = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await listProblems({ ...filters, limit: 50, page: 1 });
                if (!active) return;
                setProblems(data.problems);
                onProblemsLoaded?.(data.problems);
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
    }, [filters]);

    return (
        <div
            style={{
                width: collapsed ? "60px" : "250px",
                backgroundColor: "var(--bg-secondary)",
                borderRight: "1px solid var(--border-color)",
                transition: "width 0.3s ease",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                padding: collapsed ? "1rem 0" : "1rem",
                boxSizing: "border-box",
                overflow: "hidden"
            }}
        >
            <div style={{ display: "flex", justifyContent: collapsed ? "center" : "space-between", alignItems: "center", marginBottom: "1rem" }}>
                {!collapsed && <h2 style={{ margin: 0 }}>Problems</h2>}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    style={{ padding: "0.2rem 0.5rem", fontSize: "1.2rem", backgroundColor: "transparent", color: "var(--text-primary)", border: "none" }}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? ">>" : "<<"}
                </button>
            </div>

            {!collapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1, overflow: "hidden" }}>
                    <div>
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
                                    <option value="easy">Easy</option>
                                    <option value="medium">Medium</option>
                                    <option value="hard">Hard</option>
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>
                                    Type
                                </label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value as "all" | ProblemType)}
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
                                    <option value="unix">Unix</option>
                                    <option value="awk">Awk</option>
                                    <option value="bash">Bash</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {loading && <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Loading problems...</div>}
                        {!loading && error && <div style={{ fontSize: "0.9rem", color: "var(--accent-hover)" }}>{error}</div>}
                        {!loading && !error && problems.length === 0 && (
                            <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>No problems found.</div>
                        )}
                        {!loading && !error && problems.length > 0 && (
                            <ul style={{ listStyleType: "none", padding: 0, margin: 0 }}>
                                {problems.map((problem, index) => {
                                    const number = String(index + 1).padStart(2, "0");
                                    const isSelected = selectedProblemId === problem.id;
                                    const difficultyColors: Record<Difficulty, { bg: string; text: string }> = {
                                        easy: { bg: "#1b5e20", text: "#dcedc8" },
                                        medium: { bg: "#f9a825", text: "#1b1b1b" },
                                        hard: { bg: "#b71c1c", text: "#ffcdd2" },
                                    };
                                    const typeColors: Record<ProblemType, { bg: string; text: string }> = {
                                        awk: { bg: "#1565c0", text: "#e3f2fd" },
                                        bash: { bg: "#5d4037", text: "#efebe9" },
                                        unix: { bg: "#00695c", text: "#e0f2f1" },
                                    };
                                    return (
                                    <li
                                        key={problem.id}
                                        style={{
                                            padding: "0.6rem 0.5rem",
                                            borderBottom: "1px solid var(--border-color)",
                                            cursor: "pointer",
                                            color: "var(--text-primary)",
                                            backgroundColor: isSelected ? "var(--bg-tertiary)" : "transparent",
                                            borderRadius: "6px",
                                            marginBottom: "0.3rem",
                                        }}
                                        title={`${problem.title} (${problem.difficulty}, ${problem.type})`}
                                        onClick={() => onSelectProblem?.(problem)}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", minWidth: "2ch" }}>
                                                {number}
                                            </span>
                                            <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>{problem.title}</span>
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
                                                    backgroundColor: typeColors[problem.type].bg,
                                                    color: typeColors[problem.type].text,
                                                }}
                                            >
                                                {problem.type}
                                            </span>
                                        </div>
                                    </li>
                                );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {collapsed && <div style={{ flex: 1 }} />} {/* Spacer */}

            {!collapsed && onLogin && (
                <div style={{ marginTop: "auto" }}>
                    <button onClick={onLogin} style={{ width: "100%", backgroundColor: "var(--accent-color)" }}>
                        Login & Initialize Terminal
                    </button>
                    {containerId && (
                        <div style={{ marginTop: "1rem", color: "var(--accent-hover)", fontSize: "0.9rem" }}>
                            <p style={{ margin: "0" }}>Connected Container ID:</p>
                            <code>{containerId.slice(0, 12)}</code>
                        </div>
                    )}
                </div>
            )}

            <div style={{ marginTop: collapsed ? "auto" : "2rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem", display: "flex", justifyContent: collapsed ? "center" : "space-between", alignItems: "center" }}>
                {!collapsed && <span>Theme</span>}
                <button onClick={toggleTheme} style={{ padding: "0.4rem 0.8rem", backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }} title="Toggle Theme">
                    {theme === "dark" ? "moon" : "sun"}
                </button>
            </div>
        </div>
    );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProblemOfTheDay } from "../api/problems";
import { getProblemOfTheDay } from "../api/problems";

export default function Home() {
    const navigate = useNavigate();
    const [pod, setPod] = useState<ProblemOfTheDay | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const problem = await getProblemOfTheDay();
                if (!active) return;
                setPod(problem);
            } catch (e) {
                if (!active) return;
                console.error(e);
                setError("Unable to load today's problem.");
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, []);

    const difficultyColors: Record<string, { bg: string; text: string }> = {
        learn: { bg: "#06b6d4", text: "#e0f2f1" },
        easy: { bg: "#1b5e20", text: "#dcedc8" },
        medium: { bg: "#f9a825", text: "#1b1b1b" },
        hard: { bg: "#b71c1c", text: "#ffcdd2" },
    };

    const languageLabel = (lang: string) => {
        switch (lang) {
            case "bash":
                return "Bash";
            case "awk":
                return "Awk";
            case "unix":
                return "Unix Shell";
            case "any":
            default:
                return "Any Shell";
        }
    };

    const ensureAuthedAndGoToEditor = () => {
        let userId: string | null = null;
        try {
            const stored = window.localStorage.getItem("user_id");
            userId = stored && stored.trim() ? stored.trim() : null;
        } catch {
            userId = null;
        }

        if (!userId && !import.meta.env.DEV) {
            navigate("/account");
        } else {
            navigate("/editor/unix");
        }
    };

    const handleLoginClick = () => {
        navigate("/account");
    };

    const handleStart = () => {
        ensureAuthedAndGoToEditor();
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                background: "radial-gradient(circle at top, #1f2933 0, #111827 55%, #020617 100%)",
                color: "var(--text-primary)",
            }}
        >
            <header
                style={{
                    padding: "1.25rem 3rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-secondary)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div
                        style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "8px",
                            background: "linear-gradient(135deg, #22c55e, #0ea5e9)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: "0.9rem",
                        }}
                    >
                        UT
                    </div>
                    <span style={{ fontWeight: 600, letterSpacing: "0.06em", fontSize: "0.9rem" }}>UNIX TRAINER</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button
                        onClick={handleLoginClick}
                        style={{
                            padding: "0.3rem 0.9rem",
                            fontSize: "0.8rem",
                            borderRadius: "999px",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "transparent",
                            color: "var(--text-secondary)",
                        }}
                    >
                        Log in
                    </button>
                    <button
                        onClick={handleLoginClick}
                        style={{
                            padding: "0.3rem 0.9rem",
                            fontSize: "0.8rem",
                            borderRadius: "999px",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "var(--accent-color)",
                            color: "var(--button-text)",
                        }}
                    >
                        Sign up
                    </button>
                </div>
            </header>

            <main style={{ flex: 1, padding: "2rem 3rem 3rem", display: "flex", gap: "2.5rem", alignItems: "stretch" }}>
                {/* Left: Hero + CTAs */}
                <section style={{ flex: 3, display: "flex", flexDirection: "column", gap: "2rem" }}>
                    <div style={{ maxWidth: "640px" }}>
                        <h1
                            style={{
                                fontSize: "2.6rem",
                                lineHeight: 1.1,
                                marginBottom: "1rem",
                            }}
                        >
                            Learn Unix the way it&apos;s meant to be used — in a real shell.
                        </h1>
                        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", maxWidth: "540px" }}>
                            Spin up an isolated container, run real commands, and master Bash, Awk, and Unix tooling
                            through focused micro‑challenges.
                        </p>
                        <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", alignItems: "center" }}>
                            <button
                                onClick={handleStart}
                                style={{
                                    padding: "0.7rem 1.5rem",
                                    fontSize: "0.95rem",
                                    borderRadius: "999px",
                                    border: "1px solid var(--border-color)",
                                    backgroundColor: "var(--accent-color)",
                                    color: "var(--button-text)",
                                }}
                            >
                                Start practicing
                            </button>
                            <button
                                onClick={handleStart}
                                style={{
                                    padding: "0.7rem 1.3rem",
                                    fontSize: "0.9rem",
                                    borderRadius: "999px",
                                    backgroundColor: "transparent",
                                    border: "1px solid var(--border-color)",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                View all problems
                            </button>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                            gap: "1rem",
                            maxWidth: "780px",
                        }}
                    >
                        <FeatureCard
                            title="Real containers"
                            body="Every run happens inside an isolated Docker container so you can experiment freely."
                        />
                        <FeatureCard
                            title="Focused problems"
                            body="Short, targeted exercises for Bash, Awk, and core Unix tools — no fluff."
                        />
                        <FeatureCard
                            title="Built for muscle memory"
                            body="Run code, inspect output in the terminal, and iterate like you would on a real server."
                        />
                    </div>
                </section>

                {/* Right: Problem of the Day */}
                <aside
                    style={{
                        flex: 2,
                        minWidth: "260px",
                        maxWidth: "420px",
                        background:
                            "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8))",
                        borderRadius: "16px",
                        border: "1px solid rgba(148,163,184,0.35)",
                        padding: "1.5rem 1.7rem",
                        boxShadow: "0 18px 40px rgba(15,23,42,0.7)",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Problem of the day</h2>
                        <span
                            style={{
                                fontSize: "0.75rem",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: "var(--text-secondary)",
                            }}
                        >
                            updates daily
                        </span>
                    </div>

                    <div style={{ marginTop: "1.25rem", flex: 1 }}>
                        {loading && (
                            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Loading today&apos;s challenge…</p>
                        )}
                        {!loading && error && (
                            <p style={{ fontSize: "0.9rem", color: "#f97373" }}>{error}</p>
                        )}
                        {!loading && !error && pod && (
                            <>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                    <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{pod.title}</h3>
                                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                                        <span
                                            style={{
                                                padding: "0.15rem 0.5rem",
                                                borderRadius: "999px",
                                                fontSize: "0.7rem",
                                                letterSpacing: "0.06em",
                                                textTransform: "uppercase",
                                                backgroundColor:
                                                    difficultyColors[pod.difficulty].bg,
                                                color: difficultyColors[pod.difficulty].text,
                                            }}
                                        >
                                            {pod.difficulty}
                                        </span>
                                        <span
                                            style={{
                                                padding: "0.15rem 0.5rem",
                                                borderRadius: "999px",
                                                fontSize: "0.7rem",
                                                backgroundColor: "rgba(30,64,175,0.35)",
                                                color: "#bfdbfe",
                                            }}
                                        >
                                            {languageLabel(pod.language)}
                                        </span>
                                    </div>
                                </div>
                                <p
                                    style={{
                                        marginTop: "0.9rem",
                                        fontSize: "0.9rem",
                                        color: "var(--text-secondary)",
                                    }}
                                >
                                    {truncateInstructions(pod.instructions)}
                                </p>
                            </>
                        )}
                        {!loading && !error && !pod && (
                            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                                No problems are available yet. Check back soon.
                            </p>
                        )}
                    </div>

                    <button
                        onClick={handleStart}
                        style={{
                            marginTop: "1.25rem",
                            width: "100%",
                            padding: "0.75rem 1rem",
                            borderRadius: "999px",
                            fontSize: "0.95rem",
                        }}
                    >
                        Solve today&apos;s problem
                    </button>
                </aside>
            </main>
        </div>
    );
}

function truncateInstructions(instructions: string, maxChars = 180): string {
    if (!instructions) return "";
    const clean = instructions.replace(/\{hints:[^}]*\}/i, "").trim();
    if (clean.length <= maxChars) return clean;
    return clean.slice(0, maxChars).trimEnd() + "…";
}

function FeatureCard({ title, body }: { title: string; body: string }) {
    return (
        <div
            style={{
                padding: "1rem 1.1rem",
                borderRadius: "12px",
                border: "1px solid rgba(148,163,184,0.4)",
                background:
                    "radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 55%)",
            }}
        >
            <h3 style={{ margin: 0, fontSize: "0.95rem", marginBottom: "0.35rem" }}>{title}</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>{body}</p>
        </div>
    );
}

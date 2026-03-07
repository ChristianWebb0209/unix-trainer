import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import TextType from "../components/effects/TextType.tsx";
import * as problemConfig from "problem-config";
import type { ProblemOfTheDay, Difficulty } from "../api/problems";
import { getProblemOfTheDay } from "../api/problems";
import { DIFFICULTY_TAG_STYLES } from "../uiStyles";
import technologies from "../assets/technologies.json";
import systemsIcon from "../assets/icons/systems-icon.svg";
import gpuIcon from "../assets/icons/gpu-icon.svg";

type WorkspaceId = ReturnType<typeof problemConfig.getWorkspaceIds>[number];

type Technology = {
    id: string;
    title: string;
    description: string;
    languages: string[];
    workspace: WorkspaceId;
    icon: string; // filename from technologies.json
};

export default function Home() {
    const navigate = useNavigate();
    const [pod, setPod] = useState<ProblemOfTheDay | null>(null);
    const [podStarterCode, setPodStarterCode] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [homeCode, setHomeCode] = useState("");
    const techs = useMemo(() => technologies as Technology[], []);
    const ICON_MAP: Record<string, string> = useMemo(
        () => ({
            "systems-icon.svg": systemsIcon,
            "gpu-icon.svg": gpuIcon,
        }),
        []
    );

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const problem = await getProblemOfTheDay();
                if (!active) return;
                setPod(problem);

                // Fetch full problem details so we can get starterCode for the inline editor.
                try {
                    const res = await fetch(`/api/problems/${problem.id}`);
                    if (active && res.ok) {
                        const data = (await res.json()) as {
                            problem?: { starterCode?: string };
                        };
                        const starter =
                            typeof data.problem?.starterCode === "string" ? data.problem.starterCode : "";
                        if (starter) {
                            setPodStarterCode(starter);
                            setHomeCode(prev => (prev ? prev : starter));
                        }
                    }
                } catch (detailsErr) {
                    // Non-fatal: inline editor will just start empty if details fail.
                    console.error("Failed to load full POD details", detailsErr);
                }
            } catch (e) {
                if (!active) return;
                console.error(e);
                setError("Unable to load today's problem.");
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => {
            active = false;
        };
    }, []);

    const languageLabel = (lang: string) => {
        const entry = problemConfig.PROBLEM_LANGUAGES[
            lang as keyof typeof problemConfig.PROBLEM_LANGUAGES
        ];
        return entry?.label ?? lang;
    };

    const workspaceForLanguage = (lang: string): WorkspaceId => {
        const [first] = problemConfig.getWorkspacesForLanguage(
            lang as keyof typeof problemConfig.PROBLEM_LANGUAGES
        );
        return (first as WorkspaceId) ?? (problemConfig.DEFAULT_WORKSPACE as WorkspaceId);
    };

    const goToEditorAsGuest = (initialFromHome?: {
        problemId?: string;
        code?: string;
        workspace?: WorkspaceId;
    }) => {
        const fallbackWorkspace = problemConfig.DEFAULT_WORKSPACE as WorkspaceId;
        const workspace = initialFromHome?.workspace ?? fallbackWorkspace;
        navigate(`/editor/${workspace}`, {
            state: {
                initialProblemId: initialFromHome?.problemId,
                initialCode: initialFromHome?.code,
            },
        });
    };

    const handleLoginClick = () => {
        navigate("/account");
    };

    const handleContinueAsGuest = () => {
        navigate("/choose-technology");
    };

    const handleRunPodCode = () => {
        if (!pod) {
            goToEditorAsGuest();
            return;
        }
        const workspace = workspaceForLanguage(pod.language);
        const codeForNav = homeCode || podStarterCode;
        goToEditorAsGuest({ problemId: pod.id, code: codeForNav, workspace });
    };

    const handlePodCardClick = () => {
        if (!pod) return;
        const workspace = workspaceForLanguage(pod.language);
        const codeForNav = homeCode || podStarterCode;
        goToEditorAsGuest({ problemId: pod.id, code: codeForNav, workspace });
    };

    return (
        <div className="home-page">
            <main className="home-main">
                {/* Hero */}
                <section className="home-hero">
                    <div className="home-hero-title-wrap">
                                <h1 className="home-hero-title">
                            <TextType
                                text={[
                                    "Learn what LeetCode doesn't teach.",
                                    "Real GPU kernels.",
                                    "Master CUDA, C++, and tensors.",
                                ]}
                                typingSpeed={57}
                                deletingSpeed={63}
                                pauseDuration={1400}
                                showCursor
                                cursorCharacter="▎"
                                cursorBlinkDuration={0.5}
                            />
                        </h1>
                    </div>


                    {/* Technologies band */}
                    {/* Divider above marquee */}
                    <div className="home-divider" />

                    <div className="tech-marquee" style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
                        <div className="tech-marquee-track">
                            {[...techs, ...techs, ...techs, ...techs].map((tech, idx) => {
                                const iconSrc = ICON_MAP[tech.icon];
                                return (
                                    <div className="tech-marquee-item" key={`${tech.id}-${idx}`}>
                                        {iconSrc && (
                                            <img
                                                src={iconSrc}
                                                alt={tech.title}
                                                className="tech-marquee-icon home-tech-icon"
                                            />
                                        )}
                                        <span className="tech-marquee-label home-tech-label">
                                            {tech.title}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Divider below marquee */}
                    <div className="home-divider" />

                    {/* CTAs */}
                    <div className="home-cta-row">
                        <button
                            onClick={handleContinueAsGuest}
                            className="home-cta-primary"
                        >
                            Continue as Guest
                        </button>
                        <button
                            onClick={handleLoginClick}
                            className="home-cta-secondary"
                        >
                            Sign In / Create Account
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="home-divider" />
                </section>

                {/* Problem of the Day + inline editor */}
                <section>
                    <div className="home-pod-header">
                        <div>
                            <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Problem of the Day</h2>
                            <p className="home-pod-subtitle">
                                A single focused GPU challenge, refreshed daily.
                            </p>
                        </div>
                        <span className="home-pod-badge">
                            updates daily
                        </span>
                    </div>

                    {/* Full-width problem card (clickable) */}
                    <button
                        type="button"
                        onClick={handlePodCardClick}
                        className="home-pod-card"
                        style={{ cursor: pod ? "pointer" : "default" }}
                    >
                        <div className="home-pod-card-body">
                            {loading && (
                                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                                    Loading today&apos;s challenge…
                                </p>
                            )}
                            {!loading && error && (
                                <p style={{ fontSize: "0.9rem", color: "var(--danger-color)" }}>{error}</p>
                            )}
                            {!loading && !error && pod && (
                                <>
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: "1rem",
                                            alignItems: "flex-start",
                                        }}
                                    >
                                        <div>
                                            <h3 className="home-pod-title">
                                                {pod.title}
                                            </h3>
                                            <p className="home-pod-description">
                                                {truncateInstructions(pod.instructions)}
                                            </p>
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                                            <span
                                                className="editor-difficulty-pill-small"
                                                style={{
                                                    backgroundColor: DIFFICULTY_TAG_STYLES[pod.difficulty as Difficulty].bg,
                                                    color: DIFFICULTY_TAG_STYLES[pod.difficulty as Difficulty].text,
                                                    textAlign: "right",
                                                }}
                                            >
                                                {pod.difficulty}
                                            </span>
                                            <span
                                                style={{
                                                    padding: "0.15rem 0.6rem",
                                                    borderRadius: "999px",
                                                    fontSize: "0.7rem",
                                                    backgroundColor: "rgba(30,64,175,0.35)",
                                                    color: "#bfdbfe",
                                                    textAlign: "right",
                                                }}
                                            >
                                                {languageLabel(pod.language)}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                            {!loading && !error && !pod && (
                                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                                    No problems are available yet. Check back soon.
                                </p>
                            )}
                        </div>
                    </button>

                    {/* Inline CodeMirror editor */}
                    <div className="home-inline-editor">
                        <div className="home-inline-editor-header">
                            <span className="home-inline-editor-subtitle">
                                Try your solution here. We&apos;ll move it into the editor when you run it.
                            </span>
                            <button
                                onClick={handleRunPodCode}
                                className="home-inline-editor-run"
                            >
                                Run in workspace
                            </button>
                        </div>
                        <div style={{ height: "260px" }}>
                            <CodeMirror
                                value={homeCode}
                                onChange={setHomeCode}
                                height="260px"
                                theme={oneDark}
                                extensions={[python()]}
                                style={{ fontSize: "15px" }}
                            />
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer className="home-footer">
                    <span>
                        Check Tensor Trainer out (it&apos;s open source!):{" "}
                        <a
                            href="https://github.com/ChristianWebb0209/unix-trainer"
                            target="_blank"
                            rel="noreferrer"
                            className="home-footer-link"
                        >
                            github
                        </a>
                    </span>
                    <span>
                        Check my page out:{" "}
                        <a
                            href="https://www.linkedin.com/in/christian-webb-76530928a/"
                            target="_blank"
                            rel="noreferrer"
                            className="home-footer-link"
                        >
                            linkedin
                        </a>
                    </span>
                </footer>
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

// FeatureCard was used in a previous version of the home layout and is currently unused.

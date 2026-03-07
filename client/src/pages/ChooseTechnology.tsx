import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import technologies from "../assets/technologies.json";
import systemsIcon from "../assets/icons/systems-icon.svg";
import gpuIcon from "../assets/icons/gpu-icon.svg";
import AppHeader from "../components/ui/AppHeader";
import * as problemConfig from "problem-config";

type WorkspaceId = ReturnType<typeof problemConfig.getWorkspaceIds>[number];

type Technology = {
    id: string;
    title: string;
    description: string;
    languages: string[];
    workspace: WorkspaceId;
    icon: string; // filename from technologies.json, e.g. "systems-icon.svg"
};

const ICON_MAP: Record<string, string> = {
    "systems-icon.svg": systemsIcon,
    "gpu-icon.svg": gpuIcon,
};

export default function ChooseTechnology() {
    const navigate = useNavigate();
    const techs = useMemo(() => technologies as Technology[], []);

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
            }}
        >
            <AppHeader>
                <span style={{ marginLeft: "0.75rem", fontSize: "0.85rem" }}>Choose technology</span>
            </AppHeader>

            <main
                style={{
                    flex: 1,
                    padding: "2rem 3rem 3rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2rem",
                    maxWidth: "1100px",
                    margin: "0 auto",
                }}
            >
                <section>
                    <h1
                        style={{
                            fontSize: "2rem",
                            margin: 0,
                            marginBottom: "0.5rem",
                        }}
                    >
                        What do you want to practice?
                    </h1>
                    <p
                        style={{
                            fontSize: "0.95rem",
                            color: "var(--text-secondary)",
                            maxWidth: "620px",
                        }}
                    >
                        Pick a workspace. We&apos;ll spin up an isolated environment tuned for that style of work.
                    </p>
                </section>

                <section
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: "1.5rem",
                    }}
                >
                    {techs.map((tech) => (
                        <button
                            key={tech.id}
                            onClick={() => navigate(`/editor/${tech.workspace}`)}
                            style={{
                                textAlign: "left",
                                borderRadius: "16px",
                                border: "1px solid rgba(148,163,184,0.45)",
                                background:
                                    "radial-gradient(circle at top left, rgba(15,23,42,0.95), rgba(15,23,42,0.9))",
                                padding: "1.4rem 1.5rem",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.8rem",
                                boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
                                transition:
                                    "transform 0.15s ease-out, box-shadow 0.15s ease-out, border-color 0.15s ease-out",
                            }}
                            onMouseEnter={(e) => {
                                const btn = e.currentTarget as HTMLButtonElement;
                                btn.style.transform = "translateY(-3px)";
                                btn.style.boxShadow = "0 26px 50px rgba(0,0,0,0.75)";
                                btn.style.borderColor = "var(--accent-color)";
                                const img = btn.querySelector("img");
                                if (img) {
                                    (img as HTMLImageElement).style.transform = "scale(1.08)";
                                }
                            }}
                            onMouseLeave={(e) => {
                                const btn = e.currentTarget as HTMLButtonElement;
                                btn.style.transform = "translateY(0)";
                                btn.style.boxShadow = "0 18px 40px rgba(0,0,0,0.6)";
                                btn.style.borderColor = "rgba(148,163,184,0.45)";
                                const img = btn.querySelector("img");
                                if (img) {
                                    (img as HTMLImageElement).style.transform = "scale(1)";
                                }
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.75rem",
                                }}
                            >
                                <div
                                    style={{
                                        width: "56px",
                                        height: "56px",
                                        borderRadius: "16px",
                                        backgroundColor:
                                            tech.workspace === "kernel"
                                                ? "rgba(56,189,248,0.1)"
                                                : "rgba(248,113,113,0.1)",
                                        border: "1px solid rgba(148,163,184,0.6)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        overflow: "hidden",
                                    }}
                                >
                                    <img
                                        src={ICON_MAP[tech.icon]}
                                        alt={tech.title}
                                        style={{
                                            width: "70%",
                                            height: "70%",
                                            objectFit: "contain",
                                            transition: "transform 0.18s ease-out",
                                        }}
                                    />
                                </div>
                                <div>
                                    <h2
                                        style={{
                                            margin: 0,
                                            fontSize: "1.1rem",
                                        }}
                                    >
                                        {tech.title}
                                    </h2>
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: "0.8rem",
                                            color: "var(--text-secondary)",
                                        }}
                                    >
                                        {tech.languages.join(" · ")}
                                    </p>
                                </div>
                            </div>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: "0.9rem",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                {tech.description}
                            </p>
                            <span
                                style={{
                                    marginTop: "0.25rem",
                                    fontSize: "0.8rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                {tech.workspace === "kernel" ? "Kernel Lab" : "Tensor Lab"}
                            </span>
                        </button>
                    ))}
                </section>
            </main>
        </div>
    );
}


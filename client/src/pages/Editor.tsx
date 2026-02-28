import { useState, useContext, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { Panel, PanelGroup } from "react-resizable-panels";
import Sidebar from "../components/Sidebar";
import ResizeHandle from "../components/ResizeHandle";
import { ThemeContext } from "../contexts/ThemeContext";
import type { ProblemSummary } from "../api/problems";

interface Language {
    id: string;
    name: string;
}

interface TerminalEntry {
    command: string;
    output: string;
    isError: boolean;
}

const DEFAULT_CODE: Record<string, string> = {
    bash: '# Write your bash code here\necho "Hello from CodeMirror!"',
    awk: '# Write your awk code here\n{print $2}',
    unix: '# Write your unix command here\necho "Hello, World!"',
    python: '# Write your python code here\nprint("Hello, World!")',
    javascript: '// Write your javascript code here\nconsole.log("Hello, World!");',
    alpine: '# Write your alpine shell code here\necho "Hello from Alpine!"',
};

export default function Editor() {
    const [code, setCode] = useState("# Write your bash code here\necho \"Hello from CodeMirror!\"");
    const [containerId, setContainerId] = useState<string | null>(null);
    const [isCreatingContainer, setIsCreatingContainer] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [runOutput, setRunOutput] = useState<string | null>(null);
    const [runError, setRunError] = useState<string | null>(null);
    const [selectedProblem, setSelectedProblem] = useState<ProblemSummary | null>(null);
    const [problemDescription, setProblemDescription] = useState<string>("");
    const [problemTitle, setProblemTitle] = useState<string>("");
    const [languages, setLanguages] = useState<Language[]>([]);
    const [selectedLanguage, setSelectedLanguage] = useState<string>("bash");
    const [terminalInput, setTerminalInput] = useState("");
    const [terminalHistory, setTerminalHistory] = useState<TerminalEntry[]>([]);
    const [isExecutingTerminal, setIsExecutingTerminal] = useState(false);
    const terminalEndRef = useRef<HTMLDivElement>(null);
    const { theme } = useContext(ThemeContext);
    const activeProblemId = selectedProblem?.id;

    const createContainer = async () => {
        setIsCreatingContainer(true);
        try {
            const response = await fetch("/api/containers", {
                method: "POST",
            });
            const data = await response.json();
            if (data.containerId) {
                setContainerId(data.containerId);
            }
        } catch (err) {
            console.error("Login failed or container creation failed", err);
        } finally {
            setIsCreatingContainer(false);
        }
    };

    const handleRunCode = async () => {
        if (!activeProblemId) {
            setRunError("Select a problem first.");
            return;
        }
        setIsRunning(true);
        setRunError(null);
        setRunOutput(null);
        try {
            const response = await fetch(`/api/executions/${activeProblemId}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code,
                    language: selectedLanguage,
                    containerId: containerId, // Use persistent container
                }),
            });
            const data = await response.json();
            const stdout = data?.result?.stdout ?? "";
            const stderr = data?.result?.stderr ?? "";
            const verdict = data?.status ? `Status: ${data.status}` : "Status: unknown";
            const errorText = data?.error ? `Error: ${data.error}` : "";
            const combined = [verdict, stdout && `STDOUT:\n${stdout}`, stderr && `STDERR:\n${stderr}`, errorText]
                .filter(Boolean)
                .join("\n\n");
            setRunOutput(combined || "No output received.");
        } catch (err) {
            console.error("Run failed", err);
            setRunError("Run failed. Check server logs.");
        } finally {
            setIsRunning(false);
        }
    };

    const loadProblem = async (problemId: string) => {
        try {
            const response = await fetch(`/api/problems/${problemId}`);
            const data = await response.json();
            if (data?.problem) {
                setProblemTitle(data.problem.title ?? "");
                setProblemDescription(data.problem.description ?? "");
            }
        } catch (err) {
            console.error("Failed to load problem", err);
        }
    };

    const handleSelectProblem = async (problem: ProblemSummary) => {
        setSelectedProblem(problem);
        await loadProblem(problem.id);

        // Auto-switch language based on problem ID prefix
        const problemId = problem.id.toLowerCase();
        for (const lang of languages) {
            if (problemId.startsWith(lang.id)) {
                setSelectedLanguage(lang.id);
                setCode(DEFAULT_CODE[lang.id] || DEFAULT_CODE.bash);
                break;
            }
        }
    };

    // Fetch available languages on mount
    useEffect(() => {
        const fetchLanguages = async () => {
            try {
                const response = await fetch("/api/executions/languages");
                const data = await response.json();
                setLanguages(data);
            } catch (err) {
                console.error("Failed to fetch languages", err);
            }
        };
        fetchLanguages();
    }, []);

    // Auto-scroll terminal to bottom
    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [terminalHistory]);

    // Execute terminal command
    const executeTerminalCommand = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!terminalInput.trim() || !containerId || isExecutingTerminal) return;

        const command = terminalInput.trim();
        setTerminalInput("");
        setIsExecutingTerminal(true);

        try {
            const response = await fetch(`/api/containers/${containerId}/exec`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command }),
            });
            const result = await response.json();
            const output = result.stdout || result.stderr || "(no output)";
            const isError = result.exitCode !== 0;
            
            setTerminalHistory(prev => [
                ...prev,
                { command, output, isError }
            ]);
        } catch (err) {
            setTerminalHistory(prev => [
                ...prev,
                { command, output: `Error: ${err}`, isError: true }
            ]);
        } finally {
            setIsExecutingTerminal(false);
        }
    };

    useEffect(() => {
        if (!containerId && !isCreatingContainer) {
            createContainer();
        }
    }, [containerId, isCreatingContainer]);

    return (
        <div className="editor-page" style={{ display: "flex", height: "100vh", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>

            {/* Sidebar Component */}
            <Sidebar
                containerId={containerId}
                selectedProblemId={selectedProblem?.id ?? null}
                onSelectProblem={handleSelectProblem}
                onProblemsLoaded={(problems) => {
                    if (!selectedProblem && problems.length > 0) {
                        handleSelectProblem(problems[0]);
                    }
                }}
            />

            {/* Main Resizable Area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Top Navbar Simulation if needed */}
                <div style={{ height: "40px", backgroundColor: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", padding: "0 1rem", gap: "1rem" }}>
                    <span>Editor Workspace</span>
                    <select
                        value={selectedLanguage}
                        onChange={(e) => {
                            setSelectedLanguage(e.target.value);
                            setCode(DEFAULT_CODE[e.target.value] || DEFAULT_CODE.bash);
                        }}
                        style={{
                            marginLeft: "auto",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "var(--bg-primary)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                        }}
                    >
                        {languages.map((lang) => (
                            <option key={lang.id} value={lang.id}>
                                {lang.name}
                            </option>
                        ))}
                    </select>
                </div>

                <PanelGroup direction="horizontal" style={{ flex: 1 }}>

                    {/* Middle: Problem Description */}
                    <Panel defaultSize={30} minSize={20}>
                        <div className="problem-description" style={{ padding: "2rem", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
                            <h3>{problemTitle || "Select a problem"}</h3>
                            {problemDescription ? (
                                <p>{problemDescription}</p>
                            ) : (
                                <p>Choose a problem from the left to view its description.</p>
                            )}
                        </div>
                    </Panel>

                    <ResizeHandle />

                    {/* Right: Editor & Terminal */}
                    <Panel defaultSize={70} minSize={30}>
                        <PanelGroup direction="vertical">

                            {/* Top: Code Editor */}
                            <Panel defaultSize={70} minSize={20}>
                                <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                                    <CodeMirror
                                        value={code}
                                        height="100%"
                                        theme={theme === "light" ? "light" : oneDark} // fallback for light theme exists default, but oneDark is better
                                        extensions={[python()]}
                                        onChange={(val: string) => setCode(val)}
                                        style={{ fontSize: "16px", height: "100%" }}
                                    />
                                    <button
                                        onClick={handleRunCode}
                                        disabled={isRunning}
                                        style={{
                                            position: "absolute",
                                            bottom: "10px",
                                            left: "10px",
                                            padding: "0.35rem 0.8rem",
                                            borderRadius: "4px",
                                            border: "1px solid var(--border-color)",
                                            backgroundColor: "var(--accent-color)",
                                            color: "var(--text-primary)",
                                            cursor: "pointer",
                                            zIndex: 10
                                        }}
                                    >
                                        {isRunning ? "Running..." : "Run Code"}
                                    </button>
                                </div>
                            </Panel>

                            <ResizeHandle />

                            {/* Bottom: Interactive Terminal */}
                            <Panel defaultSize={30} minSize={15}>
                                <div className="terminal-area" style={{ height: "100%", backgroundColor: "#1a1a1a", padding: "1rem", fontFamily: "monospace", overflowY: "auto", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                        <h4 style={{ margin: 0, color: "#aaa" }}>Terminal</h4>
                                        <span style={{ color: "#666", fontSize: "12px" }}>
                                            {containerId ? `container-${containerId.slice(0, 8)}` : "No container"}
                                        </span>
                                    </div>
                                    
                                    {/* Terminal Output History */}
                                    <div style={{ flex: 1, overflowY: "auto", marginBottom: "0.5rem" }}>
                                        {terminalHistory.map((entry, index) => (
                                            <div key={index} style={{ marginBottom: "0.5rem" }}>
                                                <div style={{ color: "#4ade80" }}>
                                                    <span style={{ color: "#9ca3af" }}>$ </span>
                                                    {entry.command}
                                                </div>
                                                <pre style={{ 
                                                    color: entry.isError ? "#f87171" : "#e5e7eb", 
                                                    whiteSpace: "pre-wrap", 
                                                    margin: "0.25rem 0 0 0",
                                                    fontFamily: "monospace",
                                                    fontSize: "13px"
                                                }}>{entry.output}</pre>
                                            </div>
                                        ))}
                                        <div ref={terminalEndRef} />
                                    </div>

                                    {/* Run Code Output */}
                                    {(runError || runOutput) && (
                                        <div style={{ borderTop: "1px solid #333", paddingTop: "0.5rem", marginBottom: "0.5rem" }}>
                                            <div style={{ color: "#fbbf24", marginBottom: "0.25rem", fontSize: "12px" }}>Run Code Output:</div>
                                            {runError && (
                                                <pre style={{ color: "#f87171", whiteSpace: "pre-wrap", margin: 0, fontSize: "13px" }}>{runError}</pre>
                                            )}
                                            {runOutput && (
                                                <pre style={{ color: "#9fd3ff", whiteSpace: "pre-wrap", margin: 0, fontSize: "13px" }}>{runOutput}</pre>
                                            )}
                                        </div>
                                    )}

                                    {/* Terminal Input */}
                                    <form onSubmit={executeTerminalCommand} style={{ display: "flex", alignItems: "center" }}>
                                        <span style={{ color: "#4ade80", marginRight: "0.5rem" }}>$</span>
                                        <input
                                            type="text"
                                            value={terminalInput}
                                            onChange={(e) => setTerminalInput(e.target.value)}
                                            placeholder={containerId ? "Type a command..." : "Container starting..."}
                                            disabled={!containerId || isExecutingTerminal}
                                            style={{
                                                flex: 1,
                                                background: "transparent",
                                                border: "none",
                                                color: "#e5e7eb",
                                                fontFamily: "monospace",
                                                fontSize: "14px",
                                                outline: "none"
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={!containerId || isExecutingTerminal || !terminalInput.trim()}
                                            style={{
                                                background: "#374151",
                                                border: "none",
                                                color: "#e5e7eb",
                                                padding: "0.25rem 0.75rem",
                                                borderRadius: "4px",
                                                cursor: "pointer",
                                                fontSize: "12px",
                                                marginLeft: "0.5rem"
                                            }}
                                        >
                                            {isExecutingTerminal ? "..." : "Run"}
                                        </button>
                                    </form>
                                </div>
                            </Panel>

                        </PanelGroup>
                    </Panel>

                </PanelGroup>
            </div>
        </div>
    );
}

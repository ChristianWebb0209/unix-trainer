import { useState, useContext, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { Panel, PanelGroup } from "react-resizable-panels";
import { Terminal } from "@xterm/xterm";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import Sidebar from "../components/Sidebar";
import ResizeHandle from "../components/ResizeHandle";
import { ThemeContext } from "../contexts/ThemeContext";
import { buildRunCommand, TERMINAL_LANGUAGES, isSupportedLanguage } from "../services/codeExecution";
import type { ProblemSummary } from "../api/problems";

const DEFAULT_CODE: Record<string, string> = {
    bash: '# Write your bash code here\necho "Hello from CodeMirror!"',
    awk: '# Write your awk code here\n{print $2}',
    unix: '# Write your unix command here\necho "Hello, World!"',
};

export default function Editor() {
    const [code, setCode] = useState("# Write your bash code here\necho \"Hello from CodeMirror!\"");
    const [containerId, setContainerId] = useState<string | null>(null);
    const [isCreatingContainer, setIsCreatingContainer] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [selectedProblem, setSelectedProblem] = useState<ProblemSummary | null>(null);
    const [problemDescription, setProblemDescription] = useState<string>("");
    const [problemTitle, setProblemTitle] = useState<string>("");
    const [selectedLanguage, setSelectedLanguage] = useState<string>("bash");
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalWsRef = useRef<WebSocket | null>(null);
    const pendingRunRef = useRef<{ code: string; language: string } | null>(null);
    const { theme } = useContext(ThemeContext);

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
            console.error("Container creation failed", err);
        } finally {
            setIsCreatingContainer(false);
        }
    };

    const destroyContainer = async (id: string) => {
        if (!id) return;
        terminalWsRef.current = null;
        try {
            await fetch(`/api/containers/${id}`, { method: "DELETE" });
        } catch (err) {
            console.error("Container destroy failed", err);
        }
    };

    const handleRunCode = async () => {
        if (!isSupportedLanguage(selectedLanguage)) {
            return;
        }
        const runCmd = buildRunCommand(selectedLanguage, code);
        const payload = runCmd + "\r\n";

        const tryInject = () => {
            const ws = terminalWsRef.current;
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(payload);
                setIsRunning(false);
                return true;
            }
            return false;
        };

        if (tryInject()) return;
        pendingRunRef.current = { code, language: selectedLanguage };
        setIsRunning(true);

        if (!containerId) {
            await createContainer();
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

        const problemType = (problem.type || "").toLowerCase();
        if (isSupportedLanguage(problemType)) {
            setSelectedLanguage(problemType);
            setCode(DEFAULT_CODE[problemType] || DEFAULT_CODE.bash);
        }
    };

    // xterm.js PTY terminal - connects to container via WebSocket
    useEffect(() => {
        if (!containerId || !terminalContainerRef.current) return;

        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsHost = window.location.host;
        const wsUrl = `${wsProtocol}//${wsHost}/api/containers/${containerId}/terminal`;

        const socket = new WebSocket(wsUrl);
        terminalWsRef.current = socket;
        let term: Terminal | null = null;
        let fitAddon: FitAddon | null = null;
        let resizeObserver: ResizeObserver | null = null;

        const cleanup = () => {
            terminalWsRef.current = null;
            resizeObserver?.disconnect();
            resizeObserver = null;
            if (term) {
                term.dispose();
                term = null;
            }
            fitAddon = null;
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                socket.close();
            }
        };

        socket.onopen = () => {
            if (!terminalContainerRef.current) return;
            term = new Terminal({
                cursorBlink: true,
                fontSize: 13,
                fontFamily: "monospace",
                theme: { background: "#1a1a1a", foreground: "#e5e7eb" },
            });
            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.loadAddon(new AttachAddon(socket));
            term.open(terminalContainerRef.current);
            fitAddon.fit();

            resizeObserver = new ResizeObserver(() => fitAddon?.fit());
            resizeObserver.observe(terminalContainerRef.current);

            const pending = pendingRunRef.current;
            if (pending && isSupportedLanguage(pending.language)) {
                const runCmd = buildRunCommand(pending.language, pending.code);
                socket.send(runCmd + "\r\n");
                pendingRunRef.current = null;
                setIsRunning(false);
            }
        };

        socket.onerror = () => {
            if (terminalContainerRef.current && !term) {
                terminalContainerRef.current.innerHTML =
                    '<div style="color:#f87171;padding:1rem;">Failed to connect. Is Docker running?</div>';
            }
        };

        socket.onclose = () => cleanup();

        return () => cleanup();
    }, [containerId]);

    // Destroy container when leaving editor page
    useEffect(() => {
        return () => {
            if (containerId) {
                destroyContainer(containerId);
            }
        };
    }, [containerId]);

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
                        {TERMINAL_LANGUAGES.map((lang) => (
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
                                        disabled={isRunning || isCreatingContainer}
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
                                        {isCreatingContainer ? "Starting..." : isRunning ? "Running..." : "Run Code"}
                                    </button>
                                </div>
                            </Panel>

                            <ResizeHandle />

                            {/* Bottom: Interactive Terminal (real PTY via WebSocket) */}
                            <Panel defaultSize={30} minSize={15}>
                                <div className="terminal-area" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 1rem", backgroundColor: "#252525", borderBottom: "1px solid #333", flexShrink: 0 }}>
                                        <h4 style={{ margin: 0, color: "#aaa", fontSize: "14px" }}>Terminal</h4>
                                        <span style={{ color: "#666", fontSize: "12px" }}>
                                            {containerId ? `container-${containerId.slice(0, 8)}` : "Click Run Code to start"}
                                        </span>
                                    </div>
                                    {containerId ? (
                                        <div
                                            ref={terminalContainerRef}
                                            style={{
                                                flex: 1,
                                                minHeight: 0,
                                                padding: "0.5rem",
                                            }}
                                        />
                                    ) : (
                                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#666", gap: "0.5rem" }}>
                                            <span>Click <strong>Run Code</strong> to launch the terminal</span>
                                            <span style={{ fontSize: "12px" }}>Output will appear here</span>
                                        </div>
                                    )}
                                </div>
                            </Panel>

                        </PanelGroup>
                    </Panel>

                </PanelGroup>
            </div>
        </div>
    );
}

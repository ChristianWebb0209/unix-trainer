import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { Panel, PanelGroup } from "react-resizable-panels";
import { Terminal } from "@xterm/xterm";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import Sidebar from "../components/Sidebar";
import ResizeHandle from "../components/ResizeHandle";
import { buildRunCommand, TERMINAL_LANGUAGES, isSupportedLanguage, toBase64 } from "../services/codeExecution";
import type { ProblemSummary, ProblemLanguage, ProblemCompletionState, Difficulty, ProblemCompletion } from "../api/problems";
import { fetchProblemCompletions, saveProblemProgress } from "../api/problems";

const DEFAULT_CODE: Record<string, string> = {
    bash: '# Write your bash code here\necho "Hello from CodeMirror!"',
    awk: '# Write your awk code here\n# Paste/type input in the terminal, then press Ctrl-D (EOF)\nBEGIN { print "AWK ready. Provide input to process." }\n{ print $2 }',
    unix: '# Write your unix command here\necho "Hello, World!"',
    cuda: `// Simple host-only CUDA program compiled with nvcc
#include <cstdio>

int main() {
    printf("Hello from CUDA host code!\\n");
    return 0;
}
`,
};

type Workspace = "unix" | "cuda";

type ProblemTestCase = {
    input?: string | null;
    expected_stdout?: string | null;
};
const CLIENT_ID_KEY = "editor_client_id";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DIFFICULTY_TAG_STYLES: Record<Difficulty, { bg: string; text: string }> = {
    learn: { bg: "#06b6d4", text: "#e0f2f1" },
    easy: { bg: "#1b5e20", text: "#dcedc8" },
    medium: { bg: "#f9a825", text: "#1b1b1b" },
    hard: { bg: "#b71c1c", text: "#ffcdd2" },
};

const getClientId = (): string => {
    try {
        const existing = window.localStorage.getItem(CLIENT_ID_KEY);
        if (existing && existing.trim()) return existing.trim();
        const generated =
            (typeof crypto !== "undefined" && "randomUUID" in crypto && crypto.randomUUID()) ||
            `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(CLIENT_ID_KEY, generated);
        return generated;
    } catch {
        return "anonymous";
    }
};

export default function Editor() {
    const navigate = useNavigate();
    const params = useParams();
    const rawWorkspace = typeof params.workspace === "string" ? params.workspace.toLowerCase() : "unix";
    const workspace: Workspace = rawWorkspace === "cuda" ? "cuda" : "unix";
    const [code, setCode] = useState("# Write your bash code here\necho \"Hello from CodeMirror!\"");
    const [containerId, setContainerId] = useState<string | null>(null);
    const [isCreatingContainer, setIsCreatingContainer] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [selectedProblem, setSelectedProblem] = useState<ProblemSummary | null>(null);
    const [problemDescription, setProblemDescription] = useState<string>("");
    const [problemTitle, setProblemTitle] = useState<string>("");
    const [selectedLanguage, setSelectedLanguage] = useState<string>(workspace === "cuda" ? "cuda" : "bash");
    const [lockedLanguage, setLockedLanguage] = useState<ProblemLanguage | null>(null);
    const [completionStatuses, setCompletionStatuses] = useState<Record<string, ProblemCompletionState>>({});
    const [completionDetails, setCompletionDetails] = useState<Record<string, ProblemCompletion>>({});
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [visibleProblems, setVisibleProblems] = useState<ProblemSummary[]>([]);
    const [isSidebarOverlayOpen, setIsSidebarOverlayOpen] = useState(false);
    const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
    const [activeCudaView, setActiveCudaView] = useState<"terminal" | "webgl">("terminal");
    const [problemTests, setProblemTests] = useState<ProblemTestCase[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalWsRef = useRef<WebSocket | null>(null);
    const pendingRunRef = useRef<{ code: string; language: string } | null>(null);
    const cacheUserIdRef = useRef<string | null>(null);
    const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const sidebarOverlayRef = useRef<HTMLDivElement | null>(null);
    const sidebarToggleButtonRef = useRef<HTMLButtonElement | null>(null);
    const debounceSaveTimeoutRef = useRef<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const primaryPillBase = {
        padding: "0.2rem 0.7rem",
        fontSize: "0.8rem",
        borderRadius: "999px",
        border: "1px solid var(--border-color)",
    } as const;

    const primaryPillSelected = {
        ...primaryPillBase,
        backgroundColor: "var(--accent-color)",
        color: "var(--button-text)",
    } as const;

    const primaryPillUnselected = {
        ...primaryPillBase,
        backgroundColor: "var(--bg-tertiary)",
        color: "var(--text-secondary)",
    } as const;

    // Bump cache key version so old local completion state does not incorrectly mark problems as attempted.
    const COMPLETION_CACHE_PREFIX = "problem_completions_v2_";

    const loadUserIdFromStorage = () => {
        try {
            const stored = window.localStorage.getItem("user_id");
            const trimmed = stored && stored.trim() ? stored.trim() : null;
            if (!trimmed) return null;
            // Only accept well-formed UUIDs; otherwise treat as unauthenticated.
            return UUID_REGEX.test(trimmed) ? trimmed : null;
        } catch {
            return null;
        }
    };

    const loadCachedCompletions = (userId: string) => {
        try {
            const raw = window.localStorage.getItem(`${COMPLETION_CACHE_PREFIX}${userId}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Record<string, ProblemCompletionState>;
            return parsed;
        } catch {
            return null;
        }
    };

    const persistCachedCompletions = (userId: string, data: Record<string, ProblemCompletionState>) => {
        try {
            window.localStorage.setItem(`${COMPLETION_CACHE_PREFIX}${userId}`, JSON.stringify(data));
        } catch {
            // ignore write errors (e.g., quota exceeded)
        }
    };

    const createContainer = async (): Promise<string | null> => {
        setIsCreatingContainer(true);
        try {
            const response = await fetch("/api/containers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ workspace, clientId: getClientId() }),
            });
            const data = await response.json();
            if (data.containerId) {
                setContainerId(data.containerId);
                return data.containerId as string;
            }
            return null;
        } catch (err) {
            console.error("Container creation failed", err);
            return null;
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

    const runInTerminal = async () => {
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

    const runInWebGL = () => {
        if (workspace !== "cuda") return;
        const canvas = webglCanvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext("webgl");
        if (!gl) {
            console.error("WebGL not supported in this browser.");
            return;
        }

        const vertexSrc = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

        const fragmentSrc = code;

        const compile = (type: number, src: string) => {
            const shader = gl.createShader(type);
            if (!shader) throw new Error("Failed to create shader");
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const info = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
                gl.deleteShader(shader);
                throw new Error(info);
            }
            return shader;
        };

        try {
            const vs = compile(gl.VERTEX_SHADER, vertexSrc);
            const fs = compile(gl.FRAGMENT_SHADER, fragmentSrc);

            const program = gl.createProgram();
            if (!program) throw new Error("Failed to create program");
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const info = gl.getProgramInfoLog(program) || "Unknown program link error";
                gl.deleteProgram(program);
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                throw new Error(info);
            }

            gl.useProgram(program);

            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
                gl.STATIC_DRAW
            );

            const posLoc = gl.getAttribLocation(program, "aPos");
            if (posLoc !== -1) {
                gl.enableVertexAttribArray(posLoc);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            }

            const timeLoc = gl.getUniformLocation(program, "u_time");
            const resLoc = gl.getUniformLocation(program, "u_resolution");

            const render = (t: number) => {
                gl.viewport(0, 0, canvas.width, canvas.height);
                if (timeLoc) gl.uniform1f(timeLoc, t * 0.001);
                if (resLoc) gl.uniform2f(resLoc, canvas.width, canvas.height);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                requestAnimationFrame(render);
            };

            requestAnimationFrame(render);
        } catch (err) {
            console.error("WebGL program error:", err);
        }
    };

    const buildValidationCommand = (language: string, userCode: string, testInput: string): string => {
        const codeEncoded = toBase64(userCode);
        const inputEncoded = toBase64(testInput);

        if (language === "awk") {
            return `echo ${codeEncoded} | base64 -d > /tmp/exec.awk && echo ${inputEncoded} | base64 -d | /bin/awk -f /tmp/exec.awk`;
        }
        if (language === "bash") {
            return `echo ${codeEncoded} | base64 -d > /tmp/exec.sh && echo ${inputEncoded} | base64 -d | /bin/bash /tmp/exec.sh`;
        }
        // Default to POSIX sh for unix / other shells
        return `echo ${codeEncoded} | base64 -d > /tmp/exec.sh && echo ${inputEncoded} | base64 -d | /bin/sh /tmp/exec.sh`;
    };

    const runTestsForCurrentSolution = async () => {
        if (!selectedProblem || problemTests.length === 0) {
            return { allPassed: false, passedCount: 0, total: 0 };
        }
        if (!isSupportedLanguage(selectedLanguage)) {
            return { allPassed: false, passedCount: 0, total: problemTests.length };
        }

        let id = containerId;
        if (!id) {
            id = await createContainer();
        }
        if (!id) {
            return { allPassed: false, passedCount: 0, total: problemTests.length };
        }

        let passed = 0;
        for (const test of problemTests) {
            const input = typeof test.input === "string" ? test.input : "";
            const expected = typeof test.expected_stdout === "string" ? test.expected_stdout : "";
            const command = buildValidationCommand(selectedLanguage, code, input);

            try {
                const res = await fetch(`/api/containers/${id}/exec`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ command }),
                });
                if (!res.ok) {
                    return { allPassed: false, passedCount: passed, total: problemTests.length };
                }
                const data = await res.json();
                const actual = String(data.stdout ?? "");
                const exitCode = typeof data.exitCode === "number" ? data.exitCode : 0;
                if (exitCode !== 0 || actual !== expected) {
                    return { allPassed: false, passedCount: passed, total: problemTests.length };
                }
                passed += 1;
            } catch (err) {
                console.error("Validation run failed", err);
                return { allPassed: false, passedCount: passed, total: problemTests.length };
            }
        }

        return { allPassed: true, passedCount: passed, total: problemTests.length };
    };

    const markProblemCompleted = async () => {
        const userId = cacheUserIdRef.current ?? loadUserIdFromStorage();
        cacheUserIdRef.current = userId;
        if (!userId || !selectedProblem) return;

        try {
            const completion = await saveProblemProgress({
                userId,
                problemId: selectedProblem.id,
                solutionCode: code,
                language: selectedLanguage,
                completed: true,
            });
            const completed = Boolean(completion.completed_at);
            recordProgressLocally(completion.problem_id, completed);
            setCompletionDetails(prev => ({ ...prev, [completion.problem_id]: completion }));
        } catch (err) {
            console.error("Failed to mark problem completed", err);
        }
    };

    const handleRunCode = async () => {
        // Best-effort save of current attempt whenever the user runs code.
        await saveProgress("run");

        if (selectedProblem && problemTests.length > 0 && isSupportedLanguage(selectedLanguage)) {
            setIsValidating(true);
            try {
                const result = await runTestsForCurrentSolution();
                if (result.allPassed) {
                    setShowCelebration(true);
                    void markProblemCompleted();
                    window.setTimeout(() => setShowCelebration(false), 3500);
                }
            } finally {
                setIsValidating(false);
            }
        }

        if (workspace === "cuda" && activeCudaView === "webgl") {
            runInWebGL();
        } else {
            await runInTerminal();
        }
    };

    const loadProblem = async (problemId: string) => {
        try {
            const response = await fetch(`/api/problems/${problemId}`);
            if (!response.ok) {
                console.error("Failed to load problem", problemId, "status:", response.status);
                setProblemTests([]);
                return null;
            }
            let data: unknown;
            try {
                data = await response.json();
            } catch (jsonErr) {
                console.error("Failed to parse problem JSON", jsonErr);
                setProblemTests([]);
                return null;
            }
            const asAny = data as { problem?: { title?: string; instructions?: string; starterCode?: string; language?: string; tests?: ProblemTestCase[] } };
            if (asAny?.problem) {
                setProblemTitle(asAny.problem.title ?? "");
                setProblemDescription(asAny.problem.instructions ?? "");
                const tests = Array.isArray(asAny.problem.tests) ? (asAny.problem.tests as ProblemTestCase[]) : [];
                setProblemTests(tests);
                return {
                    starterCode: typeof asAny.problem.starterCode === "string" ? asAny.problem.starterCode : undefined,
                    language: asAny.problem.language as string | undefined,
                };
            }
            setProblemTests([]);
            return null;
        } catch (err) {
            console.error("Failed to load problem", err);
            setProblemTests([]);
            return null;
        }
    };

    // Initial load of completion statuses, using localStorage cache first, then Supabase via API.
    useEffect(() => {
        const userId = loadUserIdFromStorage();
        cacheUserIdRef.current = userId;
        if (!userId) {
            // In non-dev environments, redirect to account page when unauthenticated.
            navigate("/account");
            return;
        }

        let cancelled = false;
        const loadFromApi = async () => {
            try {
                const completions = await fetchProblemCompletions(userId);
                if (cancelled) return;
                const next: Record<string, ProblemCompletionState> = {};
                const details: Record<string, ProblemCompletion> = {};
                for (const c of completions) {
                    const state: ProblemCompletionState = c.completed_at ? "completed" : "attempted";
                    next[c.problem_id] = state;
                    details[c.problem_id] = c;
                }
                setCompletionStatuses(next);
                setCompletionDetails(details);
                persistCachedCompletions(userId, next);
            } catch (err) {
                console.error("Failed to load problem completions", err);
            }
        };

        void loadFromApi();
        return () => {
            cancelled = true;
        };
    }, []);

    const recordProgressLocally = (problemId: string, completed: boolean | undefined) => {
        const userId = cacheUserIdRef.current;
        if (!userId) return;

        setCompletionStatuses(prev => {
            const current = prev[problemId];
            const nextState: ProblemCompletionState =
                completed || current === "completed" ? "completed" : "attempted";
            const updatedStatuses = { ...prev, [problemId]: nextState };
            persistCachedCompletions(userId, updatedStatuses);
            return updatedStatuses;
        });
    };

    const saveProgress = async (reason: "debounce" | "switch" | "unload" | "run") => {
        const userId = cacheUserIdRef.current ?? loadUserIdFromStorage();
        cacheUserIdRef.current = userId;

        if (!userId || !selectedProblem) {
            return;
        }
        // Never save or classify attempts unless there are local edits to persist.
        if (!hasUnsavedChanges) {
            return;
        }

        try {
            setSaveStatus("saving");
            const completion = await saveProblemProgress({
                userId,
                problemId: selectedProblem.id,
                solutionCode: code,
                language: selectedLanguage,
                completed: false,
            });
            const completed = Boolean(completion.completed_at);
            recordProgressLocally(completion.problem_id, completed);
            setCompletionDetails(prev => ({ ...prev, [completion.problem_id]: completion }));
            setLastSavedAt(new Date());
            setHasUnsavedChanges(false);
            setSaveStatus("idle");
        } catch (err) {
            // For autosaves we just log; UI remains responsive.
            console.error(`Failed to save problem progress (${reason})`, err);
            setSaveStatus("error");
        }
    };

    const handleHomeClick = async () => {
        await saveProgress("switch");
        navigate("/");
    };

    const handleWorkspaceChange = async (next: Workspace) => {
        if (next === workspace) return;
        await saveProgress("switch");
        setSelectedProblem(null);
        setProblemTitle("");
        setProblemDescription("");
        setIsTerminalExpanded(false);
        setActiveCudaView("terminal");
        navigate(`/editor/${next}`);
    };

    const handleSelectProblem = async (problem: ProblemSummary) => {
        if (selectedProblem && selectedProblem.id !== problem.id) {
            await saveProgress("switch");
        }

        setSelectedProblem(problem);
        const loaded = await loadProblem(problem.id);

        const lang = (problem.language || loaded?.language || "any").toLowerCase() as ProblemLanguage;
        if (lang === "any") {
            setLockedLanguage(null);
            return;
        }

        if (isSupportedLanguage(lang)) {
            setSelectedLanguage(lang);
            const existing = completionDetails[problem.id];
            if (existing && typeof existing.solution_code === "string" && existing.solution_code.trim().length > 0) {
                setCode(existing.solution_code);
            } else if (loaded?.starterCode) {
                setCode(loaded.starterCode);
            } else {
                setCode(DEFAULT_CODE[lang] || DEFAULT_CODE.bash);
            }
            setLockedLanguage(lang);
        } else {
            setLockedLanguage(null);
        }
    };

    // Ticking clock for "Last saved: X ago" label
    useEffect(() => {
        const id = window.setInterval(() => {
            setNow(Date.now());
        }, 5_000);
        return () => window.clearInterval(id);
    }, []);

    // Save progress when the browser tab is closed or refreshed.
    useEffect(() => {
        if (!selectedProblem) return;

        const handler = () => {
            const userId = cacheUserIdRef.current ?? loadUserIdFromStorage();
            cacheUserIdRef.current = userId;

            if (!userId) {
                return;
            }

            try {
                const payload = {
                    userId,
                    problemId: selectedProblem.id,
                    solutionCode: code,
                    language: selectedLanguage,
                    completed: false,
                };
                const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
                if (navigator.sendBeacon) {
                    navigator.sendBeacon("/api/completions", blob);
                }
            } catch {
                // best-effort only
            }
        };

        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [selectedProblem, code, selectedLanguage]);

    // Clear pending debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceSaveTimeoutRef.current !== null) {
                window.clearTimeout(debounceSaveTimeoutRef.current);
            }
        };
    }, []);

    // Close problems dropdown when clicking outside
    useEffect(() => {
        if (!isSidebarOverlayOpen) return;
        const handleClick = (event: MouseEvent) => {
            const overlay = sidebarOverlayRef.current;
            const toggle = sidebarToggleButtonRef.current;
            const target = event.target as Node | null;
            if (!overlay || !target) return;
            if (overlay.contains(target)) return;
            if (toggle && toggle.contains(target)) return;
            setIsSidebarOverlayOpen(false);
        };
        window.addEventListener("mousedown", handleClick);
        return () => window.removeEventListener("mousedown", handleClick);
    }, [isSidebarOverlayOpen]);

    // Adjust editor language when workspace changes
    useEffect(() => {
        if (workspace === "cuda") {
            setLockedLanguage("cuda");
            setSelectedLanguage("cuda");
            setCode((prev) => (prev ? prev : DEFAULT_CODE.cuda));
        } else {
            setLockedLanguage(null);
            if (!isSupportedLanguage(selectedLanguage as string)) {
                setSelectedLanguage("bash");
                setCode(DEFAULT_CODE.bash);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace]);

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
        let terminalElement: HTMLElement | null = null;
        let onTerminalContextMenu: ((e: MouseEvent) => void) | null = null;

        const cleanup = () => {
            terminalWsRef.current = null;
            resizeObserver?.disconnect();
            resizeObserver = null;
            if (terminalElement && onTerminalContextMenu) {
                terminalElement.removeEventListener("contextmenu", onTerminalContextMenu);
            }
            terminalElement = null;
            onTerminalContextMenu = null;
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
            term.focus();

            const isMacLike = () => {
                const platform =
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (navigator as any).userAgentData?.platform ?? navigator.platform ?? "";
                return /mac|iphone|ipad|ipod/i.test(String(platform));
            };

            const writeClipboardText = async (text: string) => {
                if (!text) return false;
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                        return true;
                    }
                } catch {
                    // fall through to execCommand fallback
                }

                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.setAttribute("readonly", "true");
                textarea.style.position = "fixed";
                textarea.style.left = "-9999px";
                textarea.style.top = "-9999px";
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                let ok = false;
                try {
                    ok = document.execCommand("copy");
                } catch {
                    ok = false;
                } finally {
                    document.body.removeChild(textarea);
                }
                return ok;
            };

            const readClipboardText = async () => {
                if (!window.isSecureContext) return null;
                if (!navigator.clipboard?.readText) return null;
                try {
                    return await navigator.clipboard.readText();
                } catch {
                    return null;
                }
            };

            const getTerminalSelection = () => {
                if (!term) return "";
                const xtermSelection = term.getSelection();
                if (xtermSelection) return xtermSelection;
                if (window.getSelection) {
                    const domSel = window.getSelection();
                    if (domSel && !domSel.isCollapsed) {
                        return String(domSel);
                    }
                }
                return "";
            };

            term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
                if (ev.type !== "keydown") return true;
                if (!term) return true;

                const key = (ev.key || "").toLowerCase();
                const mac = isMacLike();
                const ctrlOrMeta = mac ? ev.metaKey : ev.ctrlKey;
                const selection = getTerminalSelection();
                const hasSelection = selection.length > 0;

                const isCopy =
                    (ctrlOrMeta && key === "c") ||
                    (ev.ctrlKey && ev.shiftKey && key === "c") ||
                    (ev.ctrlKey && key === "insert");
                const isPaste =
                    (ctrlOrMeta && key === "v") ||
                    (ev.ctrlKey && ev.shiftKey && key === "v") ||
                    (ev.shiftKey && key === "insert");

                // Preserve normal SIGINT behavior: only hijack copy shortcuts when there is a selection.
                if (isCopy && hasSelection) {
                    void writeClipboardText(selection);
                    ev.preventDefault();
                    return false;
                }

                // Prefer clipboard API for paste when available; otherwise let xterm handle native paste events.
                if (isPaste) {
                    if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.readText === "function") {
                        void readClipboardText().then((text) => {
                            if (text && term) term.paste(text);
                        });
                        ev.preventDefault();
                        return false;
                    }
                    return true;
                }

                return true;
            });

            resizeObserver = new ResizeObserver(() => fitAddon && fitAddon.fit());
            resizeObserver.observe(terminalContainerRef.current);

            terminalElement = term.element ?? null;
            if (terminalElement) {
                // Right click: copy selection if present, otherwise paste.
                onTerminalContextMenu = (e: MouseEvent) => {
                    if (!term) return;
                    e.preventDefault();
                    const selection = term.getSelection();
                    if (selection) {
                        void writeClipboardText(selection);
                        return;
                    }
                    void readClipboardText().then((text) => {
                        if (text && term) term.paste(text);
                    });
                };
                terminalElement.addEventListener("contextmenu", onTerminalContextMenu);
            }

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

            {/* Sidebar Component - base (desktop) */}
            <div
                style={{
                    position: "relative",
                    width: "260px",
                    flexShrink: 0,
                    display: "none",
                }}
                className="editor-sidebar-desktop"
            >
                <Sidebar
                    selectedProblemId={selectedProblem?.id ?? null}
                    onSelectProblem={handleSelectProblem}
                    onProblemsLoaded={(problems, ws) => {
                        if (ws !== workspace) return;
                        setVisibleProblems(problems);
                        if (!problems.length) {
                            setSelectedProblem(null);
                            setProblemTitle("");
                            setProblemDescription("");
                            return;
                        }
                        const stillVisible = selectedProblem && problems.some(p => p.id === selectedProblem.id);
                        if (!stillVisible) {
                            void handleSelectProblem(problems[0]);
                        }
                    }}
                    completionStatuses={completionStatuses}
                    workspace={workspace}
                    showHeader={true}
                />
            </div>

            {/* Main Resizable Area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Top Navbar */}
                <div style={{ height: "40px", backgroundColor: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", padding: "0 1rem", gap: "1rem", position: "relative", zIndex: 30 }}>
                    {/* Home icon */}
                    <button
                        onClick={handleHomeClick}
                        style={{
                            ...primaryPillUnselected,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.25rem",
                        }}
                        title="Back to home"
                    >
                        <span style={{ fontSize: "0.9rem", lineHeight: 1 }}>⌂</span>
                        <span style={{ fontSize: "0.75rem" }}>Home</span>
                    </button>

                    {/* Account button */}
                    <button
                        onClick={() => navigate("/account")}
                        style={{
                            ...primaryPillUnselected,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.25rem",
                        }}
                        title="Account & stats"
                    >
                        <span style={{ fontSize: "0.9rem", lineHeight: 1 }}>👤</span>
                        <span style={{ fontSize: "0.75rem" }}>Account</span>
                    </button>

                    {/* Workspace selector */}
                    <div style={{ display: "flex", gap: "0.25rem", marginLeft: "0.75rem" }}>
                        <button
                            onClick={() => void handleWorkspaceChange("unix")}
                            style={{
                                ...(workspace === "unix" ? primaryPillSelected : primaryPillUnselected),
                            }}
                        >
                            Unix
                        </button>
                        <button
                            onClick={() => void handleWorkspaceChange("cuda")}
                            style={{
                                ...(workspace === "cuda" ? primaryPillSelected : primaryPillUnselected),
                            }}
                        >
                            CUDA
                        </button>
                    </div>

                    {/* Sidebar dropdown toggle */}
                    <button
                        onClick={() => setIsSidebarOverlayOpen((v) => !v)}
                        ref={sidebarToggleButtonRef}
                        style={{
                            marginLeft: "0.5rem",
                            ...primaryPillUnselected,
                        }}
                    >
                        Problems {isSidebarOverlayOpen ? "▲" : "▼"}
                    </button>

                    <span style={{ marginLeft: "0.75rem" }}>Editor Workspace</span>
                    <div
                        style={{
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "0.75rem",
                                color: saveStatus === "error" ? "#f97373" : "var(--text-secondary)",
                            }}
                        >
                            {hasUnsavedChanges && saveStatus !== "saving"
                                ? "Unsaved changes"
                                : saveStatus === "saving"
                                    ? "Saving..."
                                    : lastSavedAt
                                        ? (() => {
                                            const diffSeconds = Math.floor((now - lastSavedAt.getTime()) / 1000);
                                            if (diffSeconds < 5) return "Last saved: just now";
                                            if (diffSeconds < 60) return `Last saved: ${diffSeconds}s ago`;
                                            const diffMinutes = Math.floor(diffSeconds / 60);
                                            if (diffMinutes < 60) return `Last saved: ${diffMinutes}m ago`;
                                            const diffHours = Math.floor(diffMinutes / 60);
                                            return `Last saved: ${diffHours}h ago`;
                                        })()
                                        : "Unsaved"}
                        </span>
                        {workspace === "unix" && (
                            <select
                                value={selectedLanguage}
                                disabled={lockedLanguage !== null}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setSelectedLanguage(next);
                                    setCode(DEFAULT_CODE[next] || DEFAULT_CODE.bash);
                                    setLockedLanguage(null);
                                }}
                                style={{
                                    padding: "0.2rem 0.7rem",
                                    borderRadius: "999px",
                                    border: "1px solid var(--border-color)",
                                    backgroundColor: "var(--bg-primary)",
                                    color: "var(--text-primary)",
                                    cursor: lockedLanguage ? "not-allowed" : "pointer",
                                    opacity: lockedLanguage ? 0.7 : 1,
                                }}
                            >
                                {TERMINAL_LANGUAGES.map((lang) => (
                                    <option key={lang.id} value={lang.id}>
                                        {lang.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        {workspace === "cuda" && (
                            <div
                                style={{
                                    ...primaryPillSelected,
                                }}
                            >
                                CUDA
                            </div>
                        )}
                    </div>
                </div>

                <PanelGroup direction="horizontal" style={{ flex: 1 }}>

                    {/* Middle: Problem Description */}
                    {!isTerminalExpanded && (
                    <Panel defaultSize={30} minSize={20}>
                        <div
                            className="problem-description"
                            style={{
                                padding: "2rem",
                                height: "100%",
                                overflowY: "auto",
                                boxSizing: "border-box",
                                fontSize: "1rem",
                                lineHeight: 1.6,
                            }}
                        >
                            {selectedProblem && (
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "stretch",
                                        marginBottom: "0.75rem",
                                        paddingBottom: "0.5rem",
                                        borderBottom: "1px solid rgba(148,163,184,0.4)",
                                        overflow: "hidden",
                                    }}
                                >
                                    {/* Previous slot (keeps layout even if empty) */}
                                    <div style={{ flex: 1, display: "flex" }}>
                                        {(() => {
                                            const idx = visibleProblems.findIndex(p => p.id === selectedProblem.id);
                                            if (idx <= 0) {
                                                return (
                                                    <div style={{ visibility: "hidden", pointerEvents: "none" }}>
                                                        <button />
                                                    </div>
                                                );
                                            }
                                            const prev = visibleProblems[idx - 1];
                                            const prevCompleted = completionStatuses[prev.id];
                                            const diffColors = DIFFICULTY_TAG_STYLES[prev.difficulty];
                                            const truncateTitle = (title: string) =>
                                                title.length > 22 ? `${title.slice(0, 22)}...` : title;
                                            return (
                                                <button
                                                    onClick={() => void handleSelectProblem(prev)}
                                                    style={{
                                                        border: "none",
                                                        background: "transparent",
                                                        color: "var(--text-secondary)",
                                                        fontSize: "0.8rem",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        alignItems: "flex-start",
                                                        gap: "0.25rem",
                                                        cursor: "pointer",
                                                        padding: 0,
                                                        outline: "none",
                                                    }}
                                                >
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                                        <span style={{ fontSize: "0.9rem" }}>← Previous</span>
                                                        <span
                                                            style={{
                                                                padding: "0.12rem 0.5rem",
                                                                borderRadius: "999px",
                                                                fontSize: "0.7rem",
                                                                textTransform: "uppercase",
                                                                letterSpacing: "0.06em",
                                                                backgroundColor: diffColors.bg,
                                                                color: diffColors.text,
                                                            }}
                                                        >
                                                            {prev.difficulty}
                                                        </span>
                                                        {prevCompleted && (
                                                            <span
                                                                style={{
                                                                    padding: "0.12rem 0.45rem",
                                                                    borderRadius: "999px",
                                                                    fontSize: "0.7rem",
                                                                    backgroundColor:
                                                                        prevCompleted === "completed" ? "#16a34a33" : "#eab30833",
                                                                    color:
                                                                        prevCompleted === "completed" ? "#22c55e" : "#eab308",
                                                                    border: `1px solid ${
                                                                        prevCompleted === "completed" ? "#16a34a" : "#eab308"
                                                                    }`,
                                                                }}
                                                            >
                                                                {prevCompleted === "completed" ? "+" : "-"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: "0.75rem",
                                                            color: "var(--text-secondary)",
                                                            maxWidth: "14rem",
                                                            whiteSpace: "nowrap",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                        }}
                                                    >
                                                        {truncateTitle(prev.title)}
                                                    </div>
                                                </button>
                                            );
                                        })()}
                                    </div>
                                    {/* Next slot (right aligned) */}
                                    <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                                        {(() => {
                                            const idx = visibleProblems.findIndex(p => p.id === selectedProblem.id);
                                            if (idx === -1 || idx >= visibleProblems.length - 1) {
                                                return (
                                                    <div style={{ visibility: "hidden", pointerEvents: "none" }}>
                                                        <button />
                                                    </div>
                                                );
                                            }
                                            const next = visibleProblems[idx + 1];
                                            const nextCompleted = completionStatuses[next.id];
                                            const diffColors = DIFFICULTY_TAG_STYLES[next.difficulty];
                                            const truncateTitle = (title: string) =>
                                                title.length > 22 ? `${title.slice(0, 22)}...` : title;
                                            return (
                                                <button
                                                    onClick={() => void handleSelectProblem(next)}
                                                    style={{
                                                        border: "none",
                                                        background: "transparent",
                                                        color: "var(--text-secondary)",
                                                        fontSize: "0.8rem",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        alignItems: "flex-end",
                                                        gap: "0.25rem",
                                                        cursor: "pointer",
                                                        padding: 0,
                                                        outline: "none",
                                                    }}
                                                >
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                                        <span style={{ fontSize: "0.9rem" }}>Next →</span>
                                                        <span
                                                            style={{
                                                                padding: "0.12rem 0.5rem",
                                                                borderRadius: "999px",
                                                                fontSize: "0.7rem",
                                                                textTransform: "uppercase",
                                                                letterSpacing: "0.06em",
                                                                backgroundColor: diffColors.bg,
                                                                color: diffColors.text,
                                                            }}
                                                        >
                                                            {next.difficulty}
                                                        </span>
                                                        {nextCompleted && (
                                                            <span
                                                                style={{
                                                                    padding: "0.12rem 0.45rem",
                                                                    borderRadius: "999px",
                                                                    fontSize: "0.7rem",
                                                                    backgroundColor:
                                                                        nextCompleted === "completed" ? "#16a34a33" : "#eab30833",
                                                                    color:
                                                                        nextCompleted === "completed" ? "#22c55e" : "#eab308",
                                                                    border: `1px solid ${
                                                                        nextCompleted === "completed" ? "#16a34a" : "#eab308"
                                                                    }`,
                                                                }}
                                                            >
                                                                {nextCompleted === "completed" ? "+" : "-"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: "0.75rem",
                                                            color: "var(--text-secondary)",
                                                            maxWidth: "14rem",
                                                            whiteSpace: "nowrap",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                        }}
                                                    >
                                                        {truncateTitle(next.title)}
                                                    </div>
                                                </button>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                            <div
                                style={{
                                    marginBottom: "1.1rem",
                                }}
                            >
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
                                        {(() => {
                                            const diffColors = DIFFICULTY_TAG_STYLES[selectedProblem.difficulty];
                                            return (
                                        <span
                                            style={{
                                                    padding: "0.2rem 0.7rem",
                                                    borderRadius: "999px",
                                                    fontSize: "0.8rem",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.08em",
                                                    backgroundColor: diffColors.bg,
                                                    color: diffColors.text,
                                            }}
                                        >
                                            {selectedProblem.difficulty}
                                        </span>
                                            );
                                        })()}
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
                                                            ? "#16a34a33"
                                                            : "#eab30833",
                                                    color:
                                                        completionStatuses[selectedProblem.id] === "completed"
                                                            ? "#22c55e"
                                                            : "#eab308",
                                                    border: `1px solid ${
                                                        completionStatuses[selectedProblem.id] === "completed"
                                                            ? "#16a34a"
                                                            : "#eab308"
                                                    }`,
                                                }}
                                            >
                                                {completionStatuses[selectedProblem.id] === "completed" ? "+" : "-"}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            {(() => {
                                if (!problemDescription) {
                                    return <p>Choose a problem from the left to view its description.</p>;
                                }

                                const hintsMatch = problemDescription.match(/\{hints:\s*([^}]+)\}/i);
                                const hintsText = hintsMatch ? hintsMatch[1].trim() : "";
                                const mainText = hintsMatch
                                    ? problemDescription.replace(hintsMatch[0], "").trim()
                                    : problemDescription;

                                const renderRichText = (text: string) => {
                                    const parts = text.split(/```/);
                                    const nodes: React.ReactNode[] = [];
                                    parts.forEach((part, idx) => {
                                        if (idx % 2 === 1) {
                                            // code block
                                            nodes.push(
                                                <pre
                                                    key={`code-${idx}`}
                                                    style={{
                                                        backgroundColor: "var(--bg-tertiary)",
                                                        padding: "0.75rem 1rem",
                                                        borderRadius: "6px",
                                                        overflowX: "auto",
                                                        fontSize: "0.9rem",
                                                    }}
                                                >
                                                    <code>{part.trim()}</code>
                                                </pre>
                                            );
                                        } else {
                                            const paragraphs = part.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
                                            paragraphs.forEach((p, pIdx) => {
                                                const raw = p;
                                                const lower = raw.toLowerCase();

                                                if (lower.startsWith("input:") || lower.startsWith("output:")) {
                                                    const [label, ...restParts] = raw.split(":");
                                                    const rest = restParts.join(":").trim();
                                                    nodes.push(
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
                                                    nodes.push(
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
                                    return nodes;
                                };

                                return (
                                    <>
                                        {mainText && renderRichText(mainText)}
                                        {hintsText && (
                                            <details
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
                                                        backgroundColor: "rgba(56, 189, 248, 0.18)",
                                                        color: "var(--text-primary)",
                                                        fontWeight: 600,
                                                        fontSize: "0.95rem",
                                                    }}
                                                >
                                                    Show hint
                                                </summary>
                                                <div
                                                    style={{
                                                        marginTop: "0.75rem",
                                                        fontSize: "0.95rem",
                                                        backgroundColor: "rgba(15, 23, 42, 0.7)",
                                                        borderRadius: "6px",
                                                        padding: "0.75rem 1rem",
                                                    }}
                                                >
                                                    {hintsText}
                                                </div>
                                            </details>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </Panel>
                    )}

                    {!isTerminalExpanded && <ResizeHandle />}

                    {/* Right: Editor & Terminal */}
                    <Panel defaultSize={isTerminalExpanded ? 100 : 70} minSize={30}>
                        <PanelGroup direction="vertical">

                            {/* Top: Code Editor */}
                            {!isTerminalExpanded && (
                            <Panel defaultSize={70} minSize={20}>
                                <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
                                    <CodeMirror
                                        value={code}
                                        height="100%"
                                        theme={oneDark}
                                        extensions={[python()]}
                                        onChange={(val: string) => {
                                            setCode(val);
                                            setHasUnsavedChanges(true);
                                            if (debounceSaveTimeoutRef.current !== null) {
                                                window.clearTimeout(debounceSaveTimeoutRef.current);
                                            }
                                            debounceSaveTimeoutRef.current = window.setTimeout(() => {
                                                void saveProgress("debounce");
                                            }, 5000);
                                        }}
                                        style={{ fontSize: "16px", height: "100%" }}
                                    />
                                    <button
                                        onClick={handleRunCode}
                                        disabled={isRunning || isCreatingContainer || isValidating}
                                        style={{
                                            position: "absolute",
                                            bottom: "10px",
                                            left: "10px",
                                            zIndex: 10,
                                            ...primaryPillSelected,
                                        }}
                                    >
                                        {isValidating
                                            ? "Validating..."
                                            : isCreatingContainer
                                                ? "Starting..."
                                                : isRunning
                                                    ? "Running..."
                                                    : "Run Code"}
                                    </button>
                                </div>
                            </Panel>
                            )}

                            {!isTerminalExpanded && <ResizeHandle />}

                            {/* Bottom: Interactive Terminal (real PTY via WebSocket or WebGL for CUDA) */}
                            <Panel defaultSize={isTerminalExpanded ? 100 : 30} minSize={15}>
                                <div className="terminal-area" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 1rem", backgroundColor: "#252525", borderBottom: "1px solid #333", flexShrink: 0 }}>
                                        <button
                                            onClick={() => setIsTerminalExpanded((v) => !v)}
                                            style={{
                                                marginRight: "0.5rem",
                                                padding: "0.15rem 0.35rem",
                                                borderRadius: "4px",
                                                backgroundColor: "transparent",
                                                border: "1px solid #444",
                                                color: "#aaa",
                                                fontSize: "0.75rem",
                                            }}
                                            title={isTerminalExpanded ? "Collapse terminal" : "Expand terminal"}
                                        >
                                            {isTerminalExpanded ? "▼" : "▲"}
                                        </button>
                                        <div style={{ display: "flex", gap: "0.25rem" }}>
                                            <button
                                                onClick={() => workspace === "cuda" && setActiveCudaView("terminal")}
                                                style={{
                                                    padding: "0.15rem 0.6rem",
                                                    borderRadius: "999px",
                                                    border: "1px solid #444",
                                                    backgroundColor:
                                                        workspace === "cuda" && activeCudaView === "terminal"
                                                            ? "#3b82f6"
                                                            : "transparent",
                                                    color:
                                                        workspace === "cuda" && activeCudaView === "terminal"
                                                            ? "#fff"
                                                            : "#aaa",
                                                    fontSize: "0.75rem",
                                                    cursor: workspace === "cuda" ? "pointer" : "default",
                                                    opacity: workspace === "cuda" ? 1 : 0.7,
                                                }}
                                            >
                                                Terminal
                                            </button>
                                            {workspace === "cuda" && (
                                                <button
                                                    onClick={() => setActiveCudaView("webgl")}
                                                    style={{
                                                        padding: "0.15rem 0.6rem",
                                                        borderRadius: "999px",
                                                        border: "1px solid #444",
                                                        backgroundColor:
                                                            activeCudaView === "webgl" ? "#3b82f6" : "transparent",
                                                        color: activeCudaView === "webgl" ? "#fff" : "#aaa",
                                                        fontSize: "0.75rem",
                                                    }}
                                                >
                                                    WebGL
                                                </button>
                                            )}
                                        </div>
                                        <span style={{ color: "#666", fontSize: "12px", marginLeft: "auto" }}>
                                            {containerId ? `container-${containerId.slice(0, 8)}` : "Click Run Code to start"}
                                        </span>
                                    </div>
                                    {workspace === "cuda" && activeCudaView === "webgl" ? (
                                        <canvas
                                            ref={webglCanvasRef}
                                            width={600}
                                            height={600}
                                            style={{
                                                flex: 1,
                                                minHeight: 0,
                                                width: "100%",
                                                backgroundColor: "#000",
                                                display: "block",
                                            }}
                                        />
                                    ) : containerId ? (
                                        <div
                                            ref={terminalContainerRef}
                                            style={{
                                                flex: 1,
                                                minHeight: 0,
                                                padding: "0.5rem",
                                            }}
                                        />
                                    ) : (
                                        <div
                                            style={{
                                                flex: 1,
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                color: "#666",
                                                gap: "0.5rem",
                                            }}
                                        >
                                            <span>
                                                Click <strong>Run Code</strong> to launch the terminal
                                            </span>
                                            <span style={{ fontSize: "12px" }}>Output will appear here</span>
                                        </div>
                                    )}
                                </div>
                            </Panel>

                        </PanelGroup>
                    </Panel>

                </PanelGroup>
                {/* Sidebar overlay dropdown */}
                <div
                    ref={sidebarOverlayRef}
                    style={{
                        position: "absolute",
                        top: "40px",
                        left: 0,
                        zIndex: 25,
                        pointerEvents: "none",
                        display: "flex",
                        alignItems: "flex-start",
                    }}
                >
                    <div
                        style={{
                            marginLeft: "1rem",
                            marginTop: "0.5rem",
                            width: "360px",
                            height: isSidebarOverlayOpen ? "70vh" : 0,
                            borderRadius: "10px",
                            boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
                            transformOrigin: "top",
                            transform: isSidebarOverlayOpen ? "translateY(0)" : "translateY(-12px)",
                            transition: "height 0.25s ease-out, transform 0.25s ease-out, opacity 0.2s ease-out",
                            opacity: isSidebarOverlayOpen ? 1 : 0,
                            pointerEvents: isSidebarOverlayOpen ? "auto" : "none",
                            overflow: "hidden",
                            backgroundColor: "var(--bg-secondary)",
                        }}
                    >
                        {isSidebarOverlayOpen && (
                            <Sidebar
                                selectedProblemId={selectedProblem?.id ?? null}
                                onSelectProblem={async (p) => {
                                    await handleSelectProblem(p);
                                    setIsSidebarOverlayOpen(false);
                                }}
                                onProblemsLoaded={(problems, ws) => {
                                    if (ws !== workspace) return;
                                    setVisibleProblems(problems);
                                }}
                                completionStatuses={completionStatuses}
                                workspace={workspace}
                                showHeader={false}
                            />
                        )}
                    </div>
                </div>
            </div>
            {showCelebration && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                        background: "radial-gradient(circle at top, rgba(34,197,94,0.12), transparent 55%)",
                        zIndex: 50,
                    }}
                >
                    <div
                        style={{
                            padding: "1.2rem 2.4rem",
                            borderRadius: "999px",
                            backgroundColor: "rgba(15,23,42,0.95)",
                            border: "1px solid rgba(34,197,94,0.8)",
                            boxShadow: "0 22px 50px rgba(0,0,0,0.7)",
                            fontSize: "1rem",
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "#bbf7d0",
                        }}
                    >
                        All tests passed!
                    </div>
                </div>
            )}
        </div>
    );
}

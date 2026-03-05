import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import type { Extension } from "@codemirror/state";
import { getCodeEditorTheme } from "../editorThemes";
import { Panel, PanelGroup } from "react-resizable-panels";
import { Terminal } from "@xterm/xterm";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import Sidebar from "../components/editor/Sidebar.tsx";
import ProblemDropdown from "../components/editor/ProblemDropdown.tsx";
import ResizeHandle from "../components/editor/ResizeHandle.tsx";
import { CodeEditorPane } from "../components/editor/CodeEditorPane.tsx";
import { TerminalPane } from "../components/editor/TerminalPane.tsx";
import AppHeader from "../components/ui/AppHeader.tsx";
import NotificationBanner from "../components/ui/NotificationBanner.tsx";
import { primaryPillSelected, DIFFICULTY_TAG_STYLES } from "../uiStyles";
import { getTerminalRunPayload, TERMINAL_LANGUAGES, isSupportedLanguage, toBase64, type SupportedLanguage } from "../services/codeExecution";
import { runWebGpuProgram } from "../services/webgpuExecution";
import type { ProblemSummary, ProblemLanguage, ProblemCompletionState, ProblemCompletion } from "../api/problems";
import { fetchProblemCompletions, saveProblemProgress } from "../api/problems";
import * as problemConfig from "problem-config";

type Workspace = ReturnType<typeof problemConfig.getWorkspaceIds>[number];
type TerminalViewMode = "terminal" | "webgpu";

const WORKSPACES: Record<
    Workspace,
    {
        id: Workspace;
        label: string;
        defaultLanguage: SupportedLanguage;
        codeTheme: Extension;
        showWebGpuTab: boolean;
        isGpu: boolean;
        allowLanguageSwitch: boolean;
    }
> = (problemConfig.getWorkspaceIds() as Workspace[]).reduce(
    (
        acc: Record<
            Workspace,
            {
                id: Workspace;
                label: string;
                defaultLanguage: SupportedLanguage;
                codeTheme: Extension;
                showWebGpuTab: boolean;
                isGpu: boolean;
                allowLanguageSwitch: boolean;
            }
        >,
        id: Workspace
    ) => {
        const ws = problemConfig.WORKSPACES[id as keyof typeof problemConfig.WORKSPACES];
        if (!ws) return acc;
        acc[id] = {
            id,
            label: ws.label,
            defaultLanguage: ws.defaultProblemLanguage as SupportedLanguage,
            codeTheme: getCodeEditorTheme(ws.codeThemeKey),
            showWebGpuTab: Boolean(ws.showWebGpuTab),
            isGpu: ws.kind === "gpu",
            allowLanguageSwitch: Boolean(ws.allowLanguageSwitch),
        };
        return acc;
    },
    {} as Record<
        Workspace,
        {
            id: Workspace;
            label: string;
            defaultLanguage: SupportedLanguage;
            codeTheme: Extension;
            showWebGpuTab: boolean;
            isGpu: boolean;
            allowLanguageSwitch: boolean;
        }
    >
);

type ProblemTestCase = {
    input?: string | null;
    expected_stdout?: string | null;
};
const CLIENT_ID_KEY = "editor_client_id";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;



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
    const location = useLocation();
    const navState = (location.state ?? {}) as { initialProblemId?: string; initialCode?: string };
    const rawWorkspace = typeof params.workspace === "string" ? params.workspace.toLowerCase() : problemConfig.DEFAULT_WORKSPACE;
    const knownWorkspaces = problemConfig.getWorkspaceIds() as Workspace[];
    const workspace: Workspace = knownWorkspaces.includes(rawWorkspace as Workspace)
        ? (rawWorkspace as Workspace)
        : (problemConfig.DEFAULT_WORKSPACE as Workspace);
    const [code, setCode] = useState("# Write your bash code here\necho \"Hello from CodeMirror!\"");
    const [containerId, setContainerId] = useState<string | null>(null);
    const [isCreatingContainer, setIsCreatingContainer] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [selectedProblem, setSelectedProblem] = useState<ProblemSummary | null>(null);
    const [problemDescription, setProblemDescription] = useState<string>("");
    const [problemTitle, setProblemTitle] = useState<string>("");
    const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
        const ws = problemConfig.WORKSPACES[workspace as keyof typeof problemConfig.WORKSPACES];
        return (ws?.defaultProblemLanguage ?? "bash") as string;
    });
    const [lockedLanguage, setLockedLanguage] = useState<ProblemLanguage | null>(null);
    const [completionStatuses, setCompletionStatuses] = useState<Record<string, ProblemCompletionState>>({});
    const [completionDetails, setCompletionDetails] = useState<Record<string, ProblemCompletion>>({});
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [visibleProblems, setVisibleProblems] = useState<ProblemSummary[]>([]);
    const [isSidebarOverlayOpen, setIsSidebarOverlayOpen] = useState(false);
    const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
    const [activeCudaView, setActiveCudaView] = useState<TerminalViewMode>("terminal");
    const [problemTests, setProblemTests] = useState<ProblemTestCase[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false);
    const [showNextHint, setShowNextHint] = useState(false);
    const initialProblemIdRef = useRef<string | null>(navState.initialProblemId ?? null);
    const initialCodeRef = useRef<string | null>(navState.initialCode ?? null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalWsRef = useRef<WebSocket | null>(null);
    const pendingRunRef = useRef<{ code: string; language: string } | null>(null);
    const cacheUserIdRef = useRef<string | null>(null);
    const webgpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const debounceSaveTimeoutRef = useRef<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const workspaceDefinition = WORKSPACES[workspace];
    const workspaceOptions = Object.values(WORKSPACES);

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
        if (!isSupportedLanguage(selectedLanguage)) return;

        let id = containerId;
        if (!id) id = await createContainer();
        if (!id) return;

        const { prepareCommand, payload } = getTerminalRunPayload(selectedLanguage as SupportedLanguage, code);
        if (prepareCommand) {
            try {
                await fetch(`/api/containers/${id}/exec`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ command: prepareCommand }),
                });
            } catch (err) {
                console.error("Failed to prepare run script", err);
                return;
            }
        }

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
    };

    const runInWebGPU = () => {
        const canvas = webgpuCanvasRef.current;
        if (canvas && WORKSPACES[workspace]?.isGpu) void runWebGpuProgram(canvas, code);
    };

    const buildValidationCommand = (language: string, userCode: string, testInput: string): string => {
        return problemConfig.getValidationCommand(
            language,
            toBase64(userCode),
            toBase64(testInput)
        );
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
            // API accepts completed (boolean); server sets completed_at in DB and returns the row.
            const completion = await saveProblemProgress({
                userId,
                problemId: selectedProblem.id,
                solutionCode: code,
                language: selectedLanguage,
                completed: true,
            });
            if (completion?.completed_at == null) {
                console.warn("[Editor] Mark completed: API returned no completed_at; check server/Supabase.");
            }
            recordProgressLocally(completion.problem_id, true);
            setCompletionDetails(prev => ({ ...prev, [completion.problem_id]: completion }));
        } catch (err) {
            console.error("Failed to mark problem completed", err);
        }
    };

    const goToPreviousProblem = async () => {
        if (!selectedProblem) return;
        const idx = visibleProblems.findIndex((p) => p.id === selectedProblem.id);
        if (idx <= 0) return;
        const prev = visibleProblems[idx - 1];
        await handleSelectProblem(prev);
    };

    const goToNextProblem = async () => {
        if (!selectedProblem) return;
        const idx = visibleProblems.findIndex((p) => p.id === selectedProblem.id);
        if (idx === -1 || idx >= visibleProblems.length - 1) return;
        const next = visibleProblems[idx + 1];
        await handleSelectProblem(next);
    };

    const handleRunCode = async () => {
        // Best-effort save of current attempt whenever the user runs code.
        await saveProgress("run");
        const wasCompletedBefore =
            selectedProblem && completionStatuses[selectedProblem.id] === "completed";

        if (selectedProblem && problemTests.length > 0 && isSupportedLanguage(selectedLanguage)) {
            setIsValidating(true);
            try {
                const result = await runTestsForCurrentSolution();
                if (result.allPassed) {
                    if (!wasCompletedBefore) {
                        setShowCelebration(true);
                        setShowNextHint(true);
                    }
                    void markProblemCompleted();
                    window.setTimeout(() => setShowCelebration(false), 3500);
                }
            } finally {
                setIsValidating(false);
            }
        }

        if (WORKSPACES[workspace]?.isGpu && activeCudaView === "webgpu") {
            runInWebGPU();
        } else {
            await runInTerminal();
        }
    };

    // Global keyboard shortcuts:
    // - Ctrl+' => Run Code
    // - Ctrl+Left / Ctrl+Right => Previous / Next problem
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const ctrl = event.ctrlKey || event.metaKey;
            if (!ctrl) return;

            if (event.key === "'" || event.code === "Quote") {
                event.preventDefault();
                void handleRunCode();
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                void goToPreviousProblem();
                return;
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                void goToNextProblem();
                return;
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleRunCode, goToPreviousProblem, goToNextProblem]);

    // Ctrl+Enter-to-next: when a problem is completed, pressing Ctrl+Enter
    // advances to the next visible problem (regardless of current focus).
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const ctrl = event.ctrlKey || event.metaKey;
            if (!ctrl || event.key !== "Enter") return;

            if (!selectedProblem) return;
            if (completionStatuses[selectedProblem.id] !== "completed") return;

            event.preventDefault();
            void goToNextProblem();
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [selectedProblem, completionStatuses, goToNextProblem]);

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

    // Initial load of completion statuses; guests are allowed (no redirect).
    useEffect(() => {
        const userId = loadUserIdFromStorage();
        cacheUserIdRef.current = userId;
        if (!userId) {
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

    const handleCodeChange = (val: string) => {
        setCode(val);
        setHasUnsavedChanges(true);
        if (debounceSaveTimeoutRef.current !== null) {
            window.clearTimeout(debounceSaveTimeoutRef.current);
        }
        debounceSaveTimeoutRef.current = window.setTimeout(() => {
            void saveProgress("debounce");
        }, 5000);
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

    const handleSelectProblem = async (problem: ProblemSummary, opts?: { initialCode?: string | null }) => {
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
            const incoming = opts?.initialCode;
            const existing = completionDetails[problem.id];
            if (incoming && incoming.trim().length > 0) {
                setCode(incoming);
            } else if (existing && typeof existing.solution_code === "string" && existing.solution_code.trim().length > 0) {
                setCode(existing.solution_code);
            } else if (loaded?.starterCode) {
                setCode(loaded.starterCode);
            } else {
                setCode(problemConfig.getDefaultStarterCode(lang));
            }
            setLockedLanguage(lang);
        } else {
            setLockedLanguage(null);
        }
    };

    // Ticking clock for "Last saved: X ago" label (only meaningful when logged in).
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

    // Adjust editor language when workspace changes
    useEffect(() => {
        const wsDef = WORKSPACES[workspace];
        if (wsDef?.isGpu) {
            const defLang = wsDef.defaultLanguage;
            setLockedLanguage(defLang);
            setSelectedLanguage(defLang);
            setCode((prev) => (prev ? prev : problemConfig.getDefaultStarterCode(defLang)));
        } else {
            setLockedLanguage(null);
            if (!isSupportedLanguage(selectedLanguage as string)) {
                setSelectedLanguage("bash");
                setCode(problemConfig.getDefaultStarterCode("bash"));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace]);

    // xterm.js PTY terminal - connects to container via WebSocket
    useEffect(() => {
        if (!containerId) return;

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

        const attachTerminal = () => {
            if (!terminalContainerRef.current) {
                // Ref not attached yet; try again shortly.
                window.setTimeout(attachTerminal, 50);
                return;
            }

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
                const { prepareCommand, payload } = getTerminalRunPayload(pending.language as SupportedLanguage, pending.code);
                const sendPayload = () => {
                    socket.send(payload);
                    pendingRunRef.current = null;
                    setIsRunning(false);
                };
                if (prepareCommand && containerId) {
                    void fetch(`/api/containers/${containerId}/exec`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command: prepareCommand }),
                    }).then(() => sendPayload()).catch(() => sendPayload());
                } else {
                    sendPayload();
                }
            }
        };

        socket.onopen = () => {
            attachTerminal();
        };

        socket.onerror = () => {
                if (terminalContainerRef.current && !term) {
                terminalContainerRef.current.innerHTML =
                    '<div style="color:var(--danger-color);padding:1rem;">Failed to connect. Is Docker running?</div>';
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

    // Ensure a workspace container is created as soon as the editor loads,
    // rather than waiting for the first Run Code action.
    useEffect(() => {
        if (containerId) return;
        void createContainer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace, containerId]);

    return (
        <div className="editor-page">

            {/* Sidebar Component - base (desktop) */}
            <div className="editor-sidebar-desktop">
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
                        const preferredId = initialProblemIdRef.current;
                        if (preferredId) {
                            const match = problems.find((p) => p.id === preferredId);
                            if (match) {
                                void handleSelectProblem(match, { initialCode: initialCodeRef.current });
                                initialProblemIdRef.current = null;
                                initialCodeRef.current = null;
                                return;
                            }
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
            <div className="editor-main">
                <AppHeader>
                    {/* Workspace selector (dropdown) */}
                    <div style={{}}>
                        <select
                            value={workspace}
                            onChange={(e) => void handleWorkspaceChange(e.target.value as Workspace)}
                            className="editor-workspace-select"
                        >
                            {workspaceOptions.map((ws) => (
                                <option key={ws.id} value={ws.id}>
                                    {ws.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <ProblemDropdown
                        isOpen={isSidebarOverlayOpen}
                        onOpenChange={setIsSidebarOverlayOpen}
                        selectedProblemId={selectedProblem?.id ?? null}
                        onSelectProblem={handleSelectProblem}
                        onProblemsLoaded={(problems, ws) => {
                            if (ws !== workspace) return;
                            setVisibleProblems(problems);
                        }}
                        completionStatuses={completionStatuses}
                        workspace={workspace}
                    />

                    <span style={{ marginLeft: "0.75rem" }}>Editor Workspace</span>
                    <div className="editor-header-status-row">
                        <span
                            className="editor-header-status-text"
                            style={{
                                color: saveStatus === "error" ? "var(--danger-color)" : undefined,
                            }}
                        >
                            {(() => {
                                const userId = cacheUserIdRef.current ?? loadUserIdFromStorage();
                                if (!userId) {
                                    return "Log in to save";
                                }
                                if (hasUnsavedChanges && saveStatus !== "saving") {
                                    return "Unsaved changes";
                                }
                                if (saveStatus === "saving") {
                                    return "Saving...";
                                }
                                if (lastSavedAt) {
                                    const diffSeconds = Math.floor((now - lastSavedAt.getTime()) / 1000);
                                    if (diffSeconds < 5) return "Last saved: just now";
                                    if (diffSeconds < 60) return `Last saved: ${diffSeconds}s ago`;
                                    const diffMinutes = Math.floor(diffSeconds / 60);
                                    if (diffMinutes < 60) return `Last saved: ${diffMinutes}m ago`;
                                    const diffHours = Math.floor(diffMinutes / 60);
                                    return `Last saved: ${diffHours}h ago`;
                                }
                                return "Unsaved";
                            })()}
                        </span>
                        {WORKSPACES[workspace]?.allowLanguageSwitch && (
                            <select
                                value={selectedLanguage}
                                disabled={lockedLanguage !== null}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setSelectedLanguage(next);
                                    setCode(problemConfig.getDefaultStarterCode(next));
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
                        {WORKSPACES[workspace]?.isGpu && (
                            <div
                                style={{
                                    ...primaryPillSelected,
                                }}
                            >
                                {problemConfig.PROBLEM_LANGUAGES[WORKSPACES[workspace].defaultLanguage]?.label ?? "GPU"}
                            </div>
                        )}
                    </div>
                </AppHeader>

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
                                                    className="editor-problem-nav-button"
                                                >
                                                    <div className="editor-problem-nav-meta">
                                                        <span style={{ fontSize: "0.9rem" }}>← Previous</span>
                                                        <span
                                                            className="editor-difficulty-pill-small"
                                                            style={{
                                                                backgroundColor: diffColors.bg,
                                                                color: diffColors.text,
                                                            }}
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
                                                    className="editor-problem-nav-button"
                                                >
                                                    <div className="editor-problem-nav-meta">
                                                        <span style={{ fontSize: "0.9rem" }}>Next →</span>
                                                        <span
                                                            className="editor-difficulty-pill-small"
                                                            style={{
                                                                backgroundColor: diffColors.bg,
                                                                color: diffColors.text,
                                                            }}
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
                                                {completionStatuses[selectedProblem.id] === "completed" ? "Completed" : "Attempted"}
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
                                    <CodeEditorPane
                                        code={code}
                                        onChange={handleCodeChange}
                                        onRun={handleRunCode}
                                        theme={workspaceDefinition.codeTheme}
                                        isRunning={isRunning}
                                        isCreatingContainer={isCreatingContainer}
                                        isValidating={isValidating}
                                        runButtonStyle={primaryPillSelected}
                                    />
                                </Panel>
                            )}

                            {!isTerminalExpanded && <ResizeHandle />}

                            {/* Bottom: Interactive Terminal (real PTY via WebSocket or WebGPU for CUDA) */}
                            <Panel defaultSize={isTerminalExpanded ? 100 : 30} minSize={15}>
                                <TerminalPane
                                    containerId={containerId}
                                    isExpanded={isTerminalExpanded}
                                    onToggleExpanded={() => setIsTerminalExpanded((v) => !v)}
                                    showWebGpuTab={workspaceDefinition.showWebGpuTab}
                                    activeView={activeCudaView}
                                    onActiveViewChange={setActiveCudaView}
                                    terminalContainerRef={terminalContainerRef as any}
                                    webgpuCanvasRef={webgpuCanvasRef as any}
                                />
                            </Panel>

                        </PanelGroup>
                    </Panel>

                </PanelGroup>
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
                        overflow: "hidden",
                    }}
                >
                    {/* Left-side confetti */}
                    <div
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: "50%",
                            height: "100%",
                            pointerEvents: "none",
                        }}
                    >
                        {Array.from({ length: 40 }).map((_, idx) => (
                            <div
                                key={`confetti-left-${idx}`}
                                style={{
                                    position: "absolute",
                                    left: `${Math.random() * 40}%`,
                                    top: "-10%",
                                    width: "6px",
                                    height: "10px",
                                    backgroundColor: ["#f97316", "#22c55e", "#3b82f6", "#eab308"][idx % 4],
                                    opacity: 0.9,
                                    borderRadius: "1px",
                                    transform: `rotate(${Math.random() * 40 - 20}deg)`,
                                    animation: `confetti-fall-left 2.5s ease-out forwards`,
                                    animationDelay: `${Math.random() * 0.6}s`,
                                }}
                            />
                        ))}
                    </div>
                    {/* Right-side confetti */}
                    <div
                        style={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            width: "50%",
                            height: "100%",
                            pointerEvents: "none",
                        }}
                    >
                        {Array.from({ length: 40 }).map((_, idx) => (
                            <div
                                key={`confetti-right-${idx}`}
                                style={{
                                    position: "absolute",
                                    right: `${Math.random() * 40}%`,
                                    top: "-10%",
                                    width: "6px",
                                    height: "10px",
                                    backgroundColor: ["#f97316", "#22c55e", "#3b82f6", "#eab308"][idx % 4],
                                    opacity: 0.9,
                                    borderRadius: "1px",
                                    transform: `rotate(${Math.random() * 40 - 20}deg)`,
                                    animation: `confetti-fall-right 2.5s ease-out forwards`,
                                    animationDelay: `${Math.random() * 0.6}s`,
                                }}
                            />
                        ))}
                    </div>
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
            {showNextHint && (
                <NotificationBanner
                    message="Press Ctrl+Enter to jump to the next problem."
                    durationMs={4000}
                    onClose={() => setShowNextHint(false)}
                />
            )}
        </div>
    );
}

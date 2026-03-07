import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import type { Extension } from "@codemirror/state";
import { getCodeEditorTheme } from "../editorThemes";
import { Panel, PanelGroup } from "react-resizable-panels";
import { Terminal } from "@xterm/xterm";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import ProblemDropdown from "../components/editor/ProblemDropdown.tsx";
import ResizeHandle from "../components/editor/ResizeHandle.tsx";
import { CodeEditorPane } from "../components/editor/CodeEditorPane.tsx";
import { TerminalPane } from "../components/editor/TerminalPane.tsx";
import ProblemDescription from "../components/editor/ProblemDescription.tsx";
import PlaygroundSidebar from "../components/editor/PlaygroundSidebar.tsx";
import AppHeader from "../components/ui/AppHeader.tsx";
import NotificationBanner from "../components/ui/NotificationBanner.tsx";
import { primaryPillSelected } from "../uiStyles";
import { getApiWsOrigin } from "../services/apiOrigin";
import { getTerminalRunPayload, TERMINAL_LANGUAGES, isSupportedLanguage, type SupportedLanguage } from "../services/codeExecution";
import { runWebGpuProgram, runWebGpuAndSampleCenterPixel } from "../services/webgpuExecution";
import type { ProblemSummary, ProblemLanguage, ProblemCompletionState, ProblemCompletion } from "../api/problems";
import { listProblems, fetchProblemCompletions, saveProblemProgress, validateProblem } from "../api/problems";
import type { ValidationResult } from "../types/validation";
import * as problemConfig from "problem-config";
import { updateFile } from "../api/files";
import type { PlaygroundFile } from "../api/files";

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
    expected_values?: number[];
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
    const resolvedWorkspace = knownWorkspaces.includes(rawWorkspace as Workspace)
        ? (rawWorkspace as Workspace)
        : (problemConfig.DEFAULT_WORKSPACE as Workspace);
    const workspace: Workspace = (WORKSPACES[resolvedWorkspace] ? resolvedWorkspace : knownWorkspaces[0]) as Workspace;
    const isPlaygroundMode = location.pathname.endsWith("/playground");
    const [code, setCode] = useState("# Write your bash code here\necho \"Hello from CodeMirror!\"");
    const [containerId, setContainerId] = useState<string | null>(null);
    const [isCreatingContainer, setIsCreatingContainer] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [selectedProblem, setSelectedProblem] = useState<ProblemSummary | null>(null);
    const [problemDescription, setProblemDescription] = useState<string>("");
    const [problemSolution, setProblemSolution] = useState<string | null>(null);
    const [problemTitle, setProblemTitle] = useState<string>("");
    const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
        const ws = problemConfig.WORKSPACES[workspace as keyof typeof problemConfig.WORKSPACES];
        return (ws?.defaultProblemLanguage ?? "cuda") as string;
    });
    const [lockedLanguage, setLockedLanguage] = useState<ProblemLanguage | null>(null);
    const [completionStatuses, setCompletionStatuses] = useState<Record<string, ProblemCompletionState>>({});
    const [completionDetails, setCompletionDetails] = useState<Record<string, ProblemCompletion>>({});
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
    const [showSavedToast, setShowSavedToast] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [visibleProblems, setVisibleProblems] = useState<ProblemSummary[]>([]);
    const [isSidebarOverlayOpen, setIsSidebarOverlayOpen] = useState(false);
    const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(isPlaygroundMode);
    const [playgroundFileId, setPlaygroundFileId] = useState<string | null>(null);
    const playgroundSaveTimeoutRef = useRef<number | null>(null);
    const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
    const [activeCudaView, setActiveCudaView] = useState<TerminalViewMode>("terminal");
    const [problemTests, setProblemTests] = useState<ProblemTestCase[]>([]);
    const [problemValidation, setProblemValidation] = useState<{ kind: string } | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [lastValidationResult, setLastValidationResult] = useState<ValidationResult | null>(null);
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

    const workspaceOptions = Object.values(WORKSPACES);
    const workspaceDefinition = WORKSPACES[workspace] ?? workspaceOptions[0];

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

    const handleResetContainer = async () => {
        if (containerId) {
            await destroyContainer(containerId);
            setContainerId(null);
        }
        await createContainer();
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
        const canRunWebGpu = WORKSPACES[workspace]?.isGpu || WORKSPACES[workspace]?.showWebGpuTab;
        if (canvas && canRunWebGpu) void runWebGpuProgram(canvas, code);
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
            const res = data as { problem?: { title?: string; instructions?: string; solution?: string | null; starterCode?: string; language?: string; tests?: unknown; validation?: { kind: string } } };
            if (res?.problem) {
                setProblemTitle(res.problem.title ?? "");
                setProblemDescription(res.problem.instructions ?? "");
                setProblemSolution(res.problem.solution ?? null);
                const tests = Array.isArray(res.problem.tests) ? (res.problem.tests as ProblemTestCase[]) : [];
                setProblemTests(tests);
                setProblemValidation(res.problem.validation ?? null);
                return {
                    starterCode: typeof res.problem.starterCode === "string" ? res.problem.starterCode : undefined,
                    language: res.problem.language as string | undefined,
                };
            }
            setProblemTests([]);
            setProblemValidation(null);
            return null;
        } catch (err) {
            console.error("Failed to load problem", err);
            setProblemTests([]);
            setProblemValidation(null);
            return null;
        }
    };

    // Clear validation result when switching to a different problem.
    useEffect(() => {
        setLastValidationResult(null);
    }, [selectedProblem?.id]);

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
            setShowSavedToast(true);
        } catch (err) {
            // For autosaves we just log; UI remains responsive.
            console.error(`Failed to save problem progress (${reason})`, err);
            setSaveStatus("error");
        }
    };

    /** Save current playground file (same UX as problem save: status, toast, lastSavedAt). */
    const savePlaygroundFile = async (reason: "debounce" | "switch") => {
        if (!playgroundFileId || !hasUnsavedChanges) return;
        if (playgroundSaveTimeoutRef.current !== null) {
            window.clearTimeout(playgroundSaveTimeoutRef.current);
            playgroundSaveTimeoutRef.current = null;
        }
        try {
            setSaveStatus("saving");
            await updateFile(playgroundFileId, { code });
            setLastSavedAt(new Date());
            setHasUnsavedChanges(false);
            setSaveStatus("idle");
            setShowSavedToast(true);
        } catch (err) {
            console.error(`Failed to save playground file (${reason})`, err);
            setSaveStatus("error");
        }
    };

    const handleCodeChange = (val: string) => {
        setCode(val);
        setHasUnsavedChanges(true);
        if (playgroundFileId) {
            if (playgroundSaveTimeoutRef.current !== null) {
                window.clearTimeout(playgroundSaveTimeoutRef.current);
            }
            playgroundSaveTimeoutRef.current = window.setTimeout(() => {
                void savePlaygroundFile("debounce");
            }, 2000);
        } else {
            if (debounceSaveTimeoutRef.current !== null) {
                window.clearTimeout(debounceSaveTimeoutRef.current);
            }
            debounceSaveTimeoutRef.current = window.setTimeout(() => {
                void saveProgress("debounce");
            }, 2000);
        }
    };

    const handleWorkspaceChange = async (next: Workspace) => {
        if (next === workspace) return;
        await saveProgress("switch");
        setSelectedProblem(null);
        setProblemTitle("");
        setProblemDescription("");
        setProblemSolution(null);
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

    const goToPreviousProblem = useCallback(async () => {
        if (!selectedProblem) return;
        const idx = visibleProblems.findIndex((p) => p.id === selectedProblem.id);
        if (idx <= 0) return;
        const prev = visibleProblems[idx - 1];
        await handleSelectProblem(prev);
    }, [selectedProblem, visibleProblems, handleSelectProblem]);

    const goToNextProblem = useCallback(async () => {
        if (!selectedProblem) return;
        const idx = visibleProblems.findIndex((p) => p.id === selectedProblem.id);
        if (idx === -1 || idx >= visibleProblems.length - 1) return;
        const next = visibleProblems[idx + 1];
        await handleSelectProblem(next);
    }, [selectedProblem, visibleProblems, handleSelectProblem]);

    const handleRunCode = useCallback(async () => {
        await saveProgress("run");
        const wasCompletedBefore =
            selectedProblem && completionStatuses[selectedProblem.id] === "completed";

        const isWebGpuNumeric =
            selectedProblem &&
            problemValidation?.kind === "webgpu_numeric" &&
            WORKSPACES[workspace]?.isGpu &&
            activeCudaView === "webgpu";

        if (isWebGpuNumeric && selectedProblem) {
            const canvas = webgpuCanvasRef.current;
            if (canvas) {
                runInWebGPU();
                setIsValidating(true);
                setLastValidationResult(null);
                try {
                    await new Promise((r) => setTimeout(r, 150));
                    const pixel = await runWebGpuAndSampleCenterPixel(canvas, code);
                    const testOutputs = pixel
                        ? [{ testId: "pixel", values: pixel }]
                        : [];
                    const result = await validateProblem(selectedProblem.id, {
                        solutionCode: code,
                        containerId: null,
                        language: selectedLanguage,
                        testOutputs,
                    });
                    setLastValidationResult(result);
                    if (result.passed) {
                        if (!wasCompletedBefore) {
                            setShowCelebration(true);
                            setShowNextHint(true);
                        }
                        void markProblemCompleted();
                        window.setTimeout(() => setShowCelebration(false), 3500);
                    }
                } catch (err) {
                    console.error("Validation failed", err);
                    setLastValidationResult({
                        passed: false,
                        tests: [],
                        summary: err instanceof Error ? err.message : "Validation failed",
                    });
                } finally {
                    setIsValidating(false);
                }
            }
        } else if (
            selectedProblem &&
            problemTests.length > 0 &&
            isSupportedLanguage(selectedLanguage) &&
            problemValidation?.kind !== "webgpu_numeric"
        ) {
            let id = containerId;
            if (!id) id = await createContainer();
            if (id) {
                setIsValidating(true);
                setLastValidationResult(null);
                try {
                    const result = await validateProblem(selectedProblem.id, {
                        solutionCode: code,
                        containerId: id,
                        language: selectedLanguage,
                    });
                    setLastValidationResult(result);
                    if (result.passed) {
                        if (!wasCompletedBefore) {
                            setShowCelebration(true);
                            setShowNextHint(true);
                        }
                        void markProblemCompleted();
                        window.setTimeout(() => setShowCelebration(false), 3500);
                    }
                } catch (err) {
                    console.error("Validation failed", err);
                    setLastValidationResult({
                        passed: false,
                        tests: [],
                        summary: err instanceof Error ? err.message : "Validation failed",
                    });
                } finally {
                    setIsValidating(false);
                }
            }
        }

        const useWebGpuView = (WORKSPACES[workspace]?.isGpu || WORKSPACES[workspace]?.showWebGpuTab) && activeCudaView === "webgpu";
        if (useWebGpuView) {
            runInWebGPU();
        } else {
            await runInTerminal();
        }
    }, [
        saveProgress,
        selectedProblem,
        completionStatuses,
        problemValidation,
        workspace,
        activeCudaView,
        code,
        containerId,
        createContainer,
        selectedLanguage,
        problemTests,
        markProblemCompleted,
        runInWebGPU,
        runInTerminal,
    ]);

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

    // Clear pending debounce and playground save timers on unmount
    useEffect(() => {
        return () => {
            if (debounceSaveTimeoutRef.current !== null) {
                window.clearTimeout(debounceSaveTimeoutRef.current);
            }
            if (playgroundSaveTimeoutRef.current !== null) {
                window.clearTimeout(playgroundSaveTimeoutRef.current);
            }
        };
    }, []);

    // Adjust editor language when workspace changes
    useEffect(() => {
        const wsDef = WORKSPACES[workspace];
        if (isPlaygroundMode) {
            const wsLangs = (problemConfig.getLanguagesForWorkspace(workspace) as string[]).filter((id) => id !== "any");
            const first = wsLangs[0] ?? "bash";
            setLockedLanguage(null);
            setSelectedLanguage((prev) => (wsLangs.includes(prev) ? prev : first));
            if (!wsLangs.includes(selectedLanguage)) {
                setCode(problemConfig.getDefaultStarterCode(first));
            }
            return;
        }
        if (wsDef?.isGpu) {
            const defLang = wsDef.defaultLanguage;
            setLockedLanguage(defLang);
            setSelectedLanguage(defLang);
            setCode((prev) => (prev ? prev : problemConfig.getDefaultStarterCode(defLang)));
        } else {
            setLockedLanguage(null);
            if (!isSupportedLanguage(selectedLanguage as string)) {
                const def = workspaceDefinition.defaultLanguage;
                setSelectedLanguage(def);
                setCode(problemConfig.getDefaultStarterCode(def));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace, isPlaygroundMode]);

    // When workspace loads or changes: fetch problems for this workspace and auto-select first
    useEffect(() => {
        let cancelled = false;
        const wsLangs = problemConfig.getLanguagesForWorkspace(workspace) as ProblemLanguage[];
        const fetchAndSelect = async () => {
            try {
                const data = await listProblems({
                    languageIn: wsLangs as ProblemLanguage[],
                    limit: 50,
                    page: 1,
                });
                if (cancelled) return;
                const allowed = data.problems.filter((p) => wsLangs.includes(p.language));
                allowed.sort((a, b) => {
                    const da = problemConfig.DIFFICULTY_ORDER[a.difficulty as keyof typeof problemConfig.DIFFICULTY_ORDER];
                    const db = problemConfig.DIFFICULTY_ORDER[b.difficulty as keyof typeof problemConfig.DIFFICULTY_ORDER];
                    if (da !== db) return da - db;
                    return a.id.localeCompare(b.id);
                });
                setVisibleProblems(allowed);
                if (allowed.length > 0 && !isPlaygroundMode) {
                    const preferredId = initialProblemIdRef.current;
                    const match = preferredId ? allowed.find((p) => p.id === preferredId) : null;
                    if (match) {
                        const initialCode = initialCodeRef.current;
                        initialProblemIdRef.current = null;
                        initialCodeRef.current = null;
                        void handleSelectProblem(match, { initialCode });
                    } else {
                        void handleSelectProblem(allowed[0]);
                    }
                }
            } catch (err) {
                if (!cancelled) console.error("Failed to fetch problems for workspace", err);
            }
        };
        void fetchAndSelect();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace, isPlaygroundMode]);

    // xterm.js PTY terminal - connects to container via WebSocket
    useEffect(() => {
        if (!containerId) return;

        const wsBase = getApiWsOrigin();
        const wsUrl = `${wsBase}/api/containers/${containerId}/terminal`;

        const socket = new WebSocket(wsUrl);
        terminalWsRef.current = socket;
        let term: Terminal | null = null;
        let fitAddon: FitAddon | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let terminalElement: HTMLElement | null = null;
        let onTerminalContextMenu: ((e: MouseEvent) => void) | null = null;
        const closedByUs = { current: false };

        const cleanup = () => {
            closedByUs.current = true;
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
                if (closedByUs.current) return;
                if (terminalContainerRef.current && !term) {
                terminalContainerRef.current.innerHTML =
                    '<div style="color:var(--danger-color);padding:1rem;">Failed to connect. Is Docker running?</div>';
            }
                setContainerId(null);
        };

        socket.onclose = (ev) => {
                if (!closedByUs.current && ev.code !== 1000 && ev.code !== 1005) {
                setContainerId(null);
            }
            cleanup();
        };

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

            <div className="editor-main">
                <AppHeader>
                    {isPlaygroundMode && (
                        <button
                            type="button"
                            onClick={() => navigate(`/editor/${workspace}`)}
                            style={{
                                marginRight: "0.75rem",
                                padding: "0.35rem 0.75rem",
                                borderRadius: "999px",
                                border: "1px solid var(--border-color)",
                                background: "var(--bg-tertiary)",
                                color: "var(--text-secondary)",
                                fontSize: "0.9rem",
                                cursor: "pointer",
                            }}
                        >
                            ← Back to problems
                        </button>
                    )}
                    <ProblemDropdown
                        isOpen={isSidebarOverlayOpen}
                        onOpenChange={setIsSidebarOverlayOpen}
                        selectedProblemId={selectedProblem?.id ?? null}
                        onSelectProblem={handleSelectProblem}
                        workspace={workspace}
                        isPlaygroundMode={isPlaygroundMode}
                        onGoToPlayground={() => {
                            setIsSidebarOverlayOpen(false);
                            navigate(`/editor/${workspace}/playground`);
                        }}
                        onProblemsLoaded={(problems, ws) => {
                            if (ws !== workspace) return;
                            setVisibleProblems((prev) => {
                                const selectedId = selectedProblem?.id;
                                if (selectedId && !problems.some((p) => p.id === selectedId)) {
                                    return prev;
                                }
                                return problems;
                            });
                            if (!problems.length) {
                                setSelectedProblem(null);
                                setProblemTitle("");
                                setProblemDescription("");
                                setProblemSolution(null);
                                return;
                            }
                            const preferredId = initialProblemIdRef.current;
                            if (preferredId) {
                                const match = problems.find((p) => p.id === preferredId);
                                if (match) {
                                    void handleSelectProblem(match, { initialCode: initialCodeRef.current });
                                    initialProblemIdRef.current = null;
                                    initialCodeRef.current = null;
                                }
                            }
                            // Do not auto-change selection when filters change; only when user clicks a problem
                        }}
                        completionStatuses={completionStatuses}
                    />

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
                        {(WORKSPACES[workspace]?.allowLanguageSwitch || isPlaygroundMode) && (() => {
                            const workspaceLangIds = (problemConfig.getLanguagesForWorkspace(workspace) as string[]).filter((id) => id !== "any");
                            const languageOptions = isPlaygroundMode
                                ? workspaceLangIds.map((id) => ({
                                    id,
                                    name: (problemConfig.PROBLEM_LANGUAGES as Record<string, { label?: string }>)[id]?.label ?? id,
                                }))
                                : WORKSPACES[workspace]?.isGpu
                                    ? workspaceLangIds.map((id) => ({
                                        id,
                                        name: (problemConfig.PROBLEM_LANGUAGES as Record<string, { label?: string }>)[id]?.label ?? id,
                                    }))
                                    : TERMINAL_LANGUAGES;
                            const uniqueLanguagesInProblems = visibleProblems.length > 0
                                ? new Set(visibleProblems.map((p) => p.language)).size
                                : 0;
                            const singleLanguage =
                                !isPlaygroundMode &&
                                (languageOptions.length <= 1 ||
                                    (uniqueLanguagesInProblems === 1 && visibleProblems.length > 0));
                            const languageDisabled = isPlaygroundMode ? false : lockedLanguage !== null;
                            return (
                                <select
                                    value={selectedLanguage}
                                    disabled={languageDisabled}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setSelectedLanguage(next);
                                        if (isPlaygroundMode) {
                                            setCode(problemConfig.getDefaultStarterCode(next));
                                        } else {
                                            setCode(problemConfig.getDefaultStarterCode(next));
                                            setLockedLanguage(null);
                                        }
                                    }}
                                    style={{
                                        padding: "0.2rem 0.7rem",
                                        borderRadius: "999px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "var(--bg-primary)",
                                        color: "var(--text-primary)",
                                        cursor: languageDisabled ? "not-allowed" : "pointer",
                                        opacity: languageDisabled ? 0.7 : 1,
                                        ...(singleLanguage
                                            ? {
                                                appearance: "none" as const,
                                                WebkitAppearance: "none" as const,
                                                MozAppearance: "none" as const,
                                            }
                                            : {}),
                                    }}
                                >
                                    {languageOptions.map((lang) => (
                                        <option key={lang.id} value={lang.id}>
                                            {lang.name}
                                        </option>
                                    ))}
                                </select>
                            );
                        })()}
                        {WORKSPACES[workspace]?.isGpu && !WORKSPACES[workspace]?.allowLanguageSwitch && (
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

                <div style={{ display: "flex", flex: 1, minWidth: 0 }}>
                    {/* Left: Problem Description (problem mode) or Files/Projects (playground mode); collapsible */}
                    {!isTerminalExpanded && (
                        <>
                            <div
                                className="editor-side-panel-wrapper"
                                style={{
                                    width: isSidePanelCollapsed ? 0 : "30%",
                                    minWidth: 0,
                                    overflow: "hidden",
                                    transition: "width 0.25s ease-out",
                                    flexShrink: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                }}
                            >
                                <div
                                    style={{
                                        width: "100%",
                                        minWidth: 320,
                                        height: "100%",
                                        display: "flex",
                                        flexDirection: "column",
                                        position: "relative",
                                        backgroundColor: "var(--bg-secondary)",
                                    }}
                                >
                                    <button
                                        type="button"
                                        aria-label={isSidePanelCollapsed ? "Expand side panel" : "Collapse side panel"}
                                        onClick={() => setIsSidePanelCollapsed((v) => !v)}
                                        className="editor-side-panel-toggle"
                                        style={{
                                            position: "absolute",
                                            top: "0.75rem",
                                            right: "0.75rem",
                                            zIndex: 10,
                                            padding: "0.35rem 0.5rem",
                                            borderRadius: "6px",
                                            border: "1px solid var(--border-color)",
                                            background: "var(--bg-tertiary)",
                                            color: "var(--text-secondary)",
                                            cursor: "pointer",
                                            fontSize: "1rem",
                                            lineHeight: 1,
                                        }}
                                    >
                                        {isSidePanelCollapsed ? "◀" : "▶"}
                                    </button>
                                    {isPlaygroundMode ? (
                                        <PlaygroundSidebar
                                            selectedFileId={playgroundFileId}
                                            code={code}
                                            selectedLanguage={selectedLanguage}
                                            defaultCodeForNewFile={problemConfig.getDefaultStarterCode(workspaceDefinition.defaultLanguage)}
                                            onSelectFile={async (file: PlaygroundFile) => {
                                                await savePlaygroundFile("switch");
                                                setCode(file.code);
                                                setPlaygroundFileId(file.id);
                                            }}
                                            onCodeChange={setCode}
                                            onSelectedFileIdChange={setPlaygroundFileId}
                                        />
                                    ) : (
                                        <ProblemDescription
                                            selectedProblem={selectedProblem}
                                            problemTitle={problemTitle}
                                            problemDescription={problemDescription}
                                            visibleProblems={visibleProblems}
                                            completionStatuses={completionStatuses}
                                            onSelectProblem={(p) => void handleSelectProblem(p)}
                                            lastValidationResult={lastValidationResult}
                                            codeTheme={workspaceDefinition.codeTheme}
                                            solution={problemSolution}
                                            workspace={workspace}
                                            isPlaygroundMode={isPlaygroundMode}
                                            onGoToPlayground={() => navigate(`/editor/${workspace}/playground`)}
                                        />
                                    )}
                                </div>
                            </div>
                            {!isSidePanelCollapsed && <ResizeHandle />}
                        </>
                    )}

                    {/* Right: Editor & Terminal */}
                    <div
                        style={{
                            flex: 1,
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            position: "relative",
                        }}
                    >
                        {!isTerminalExpanded && isSidePanelCollapsed && (
                            <button
                                type="button"
                                aria-label="Expand side panel"
                                onClick={() => setIsSidePanelCollapsed(false)}
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    zIndex: 5,
                                    width: "28px",
                                    height: "64px",
                                    padding: 0,
                                    borderRadius: "0 8px 8px 0",
                                    border: "1px solid var(--border-color)",
                                    borderLeft: "none",
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    fontSize: "1rem",
                                    boxShadow: "2px 0 8px rgba(0,0,0,0.2)",
                                }}
                            >
                                ◀
                            </button>
                        )}
                        <PanelGroup direction="vertical" style={{ flex: 1 }}>

                            {/* Top: Code Editor */}
                            {!isTerminalExpanded && (
                                <Panel defaultSize={70} minSize={20}>
                                    <CodeEditorPane
                                        code={code}
                                        onChange={handleCodeChange}
                                        onRun={handleRunCode}
                                        theme={workspaceDefinition.codeTheme}
                                        language={selectedLanguage}
                                        containerId={containerId}
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
                                    onResetContainer={handleResetContainer}
                                    isCreatingContainer={isCreatingContainer}
                                    showWebGpuTab={workspaceDefinition.showWebGpuTab}
                                    activeView={activeCudaView}
                                    onActiveViewChange={setActiveCudaView}
                                    terminalContainerRef={terminalContainerRef}
                                    webgpuCanvasRef={webgpuCanvasRef}
                                />
                            </Panel>

                        </PanelGroup>
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
            {showSavedToast && (
                <NotificationBanner
                    message="Progress saved"
                    durationMs={2000}
                    onClose={() => setShowSavedToast(false)}
                />
            )}
        </div>
    );
}

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import type { Extension } from "@codemirror/state";
import { getCodeEditorTheme } from "../editorThemes";
import { Panel, PanelGroup } from "react-resizable-panels";
import ProblemDropdown from "../components/editor/ProblemDropdown.tsx";
import ResizeHandle from "../components/ui/ResizeHandle.tsx";
import { CodeEditorPane } from "../components/editor/CodeEditorPane.tsx";
import { TerminalPane, type TerminalPaneHandle } from "../components/editor/TerminalPane.tsx";
import ProblemDescription from "../components/editor/ProblemDescription.tsx";
import PlaygroundSidebar from "../components/editor/PlaygroundSidebar.tsx";
import AppHeader from "../components/ui/AppHeader.tsx";
import NotificationBanner from "../components/ui/NotificationBanner.tsx";
import UnifiedSelect from "../components/ui/UnifiedSelect.tsx";
import { primaryPillSelected, primaryPillUnselected } from "../uiStyles";
import { TERMINAL_LANGUAGES, isSupportedLanguage, type SupportedLanguage } from "../services/codeExecution";
import type { ProblemSummary, ProblemLanguage, ProblemCompletionState, ProblemCompletion } from "../api/problems";
import { listProblems, fetchProblemCompletions, saveProblemProgress, validateProblem } from "../api/problems";
import type { ValidationResult } from "../types/validation";
import * as problemConfig from "problem-config";
import { apiUrl } from "../services/apiOrigin";
import { updateFile } from "../api/files";
import type { PlaygroundFile } from "../api/files";

type Workspace = ReturnType<typeof problemConfig.getWorkspaceIds>[number];

const WORKSPACES: Record<
    Workspace,
    {
        id: Workspace;
        label: string;
        defaultLanguage: SupportedLanguage;
        codeTheme: Extension;
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

type CachedProblemData = {
    title: string;
    instructions: string;
    solution: string | null;
    tests: ProblemTestCase[];
    validation: { kind: string } | null;
    starterCode: string | undefined;
    language: string | undefined;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const terminalPaneRef = useRef<TerminalPaneHandle>(null);
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
    const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false);
    const [playgroundFileId, setPlaygroundFileId] = useState<string | null>(null);
    const playgroundSaveTimeoutRef = useRef<number | null>(null);
    const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
    const sidebarWasOpenBeforeExpandRef = useRef(false);
    const [problemTests, setProblemTests] = useState<ProblemTestCase[]>([]);
    const [problemValidation, setProblemValidation] = useState<{ kind: string } | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [lastValidationResult, setLastValidationResult] = useState<ValidationResult | null>(null);
    const [showCelebration, setShowCelebration] = useState(false);
    const [showNextHint, setShowNextHint] = useState(false);
    const initialProblemIdRef = useRef<string | null>(navState.initialProblemId ?? null);
    const initialCodeRef = useRef<string | null>(navState.initialCode ?? null);
    const cacheUserIdRef = useRef<string | null>(null);
    const debounceSaveTimeoutRef = useRef<number | null>(null);
    const problemCacheRef = useRef<Map<string, CachedProblemData>>(new Map());
    const [isProblemDataLoading, setIsProblemDataLoading] = useState(false);
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

    const applyCachedProblem = (cached: CachedProblemData) => {
        setProblemTitle(cached.title);
        setProblemDescription(cached.instructions);
        setProblemSolution(cached.solution);
        setProblemTests(cached.tests);
        setProblemValidation(cached.validation);
    };

    const loadProblem = useCallback(async (problemId: string): Promise<{ starterCode: string | undefined; language: string | undefined } | null> => {
        const cached = problemCacheRef.current.get(problemId);
        if (cached) {
            applyCachedProblem(cached);
            return { starterCode: cached.starterCode, language: cached.language };
        }
        try {
            const response = await fetch(apiUrl(`/api/problems/${problemId}`));
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
                const p = res.problem;
                const title = p.title ?? "";
                const instructions = p.instructions ?? "";
                const solution = p.solution ?? null;
                const tests = Array.isArray(p.tests) ? (p.tests as ProblemTestCase[]) : [];
                const validation = p.validation ?? null;
                const starterCode = typeof p.starterCode === "string" ? p.starterCode : undefined;
                const language = p.language as string | undefined;
                const toCache: CachedProblemData = { title, instructions, solution, tests, validation, starterCode, language };
                problemCacheRef.current.set(problemId, toCache);
                applyCachedProblem(toCache);
                return { starterCode, language };
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
    }, []);

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
        navigate(isPlaygroundMode ? `/editor/${next}/playground` : `/editor/${next}`);
    };

    const handleSelectProblem = async (problem: ProblemSummary, opts?: { initialCode?: string | null }) => {
        if (isPlaygroundMode) {
            await savePlaygroundFile("switch");
            navigate(`/editor/${workspace}`);
        }
        if (selectedProblem && selectedProblem.id !== problem.id) {
            await saveProgress("switch");
        }

        setSelectedProblem(problem);
        const cached = problemCacheRef.current.has(problem.id);
        if (!cached) setIsProblemDataLoading(true);
        try {
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
        } finally {
            if (!cached) setIsProblemDataLoading(false);
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

    const onTerminalRunStart = useCallback(() => setIsRunning(true), []);
    const onTerminalRunEnd = useCallback(() => setIsRunning(false), []);
    const onTerminalToggleExpanded = useCallback(() => {
        const sidebarOpen = !isSidePanelCollapsed;
        setIsTerminalExpanded((v) => {
            if (!v) {
                sidebarWasOpenBeforeExpandRef.current = sidebarOpen;
                setIsSidePanelCollapsed(true);
                return true;
            }
            if (sidebarWasOpenBeforeExpandRef.current) setIsSidePanelCollapsed(false);
            return false;
        });
    }, [isSidePanelCollapsed]);

    const handleRunCode = useCallback(async () => {
        await saveProgress("run");
        const wasCompletedBefore =
            selectedProblem && completionStatuses[selectedProblem.id] === "completed";
        const pane = terminalPaneRef.current;

        if (
            selectedProblem &&
            problemTests.length > 0 &&
            isSupportedLanguage(selectedLanguage) &&
            pane
        ) {
            const id = pane.getContainerId();
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

        if (pane) {
            await pane.runInTerminal(code, selectedLanguage);
        }
    }, [
        saveProgress,
        selectedProblem,
        completionStatuses,
        problemValidation,
        workspace,
        code,
        selectedLanguage,
        problemTests,
        markProblemCompleted,
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
                    navigator.sendBeacon(apiUrl("/api/completions"), blob);
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

    const initialPlaygroundFileId = useMemo(() => {
        if (!isPlaygroundMode) return null;
        try {
            return localStorage.getItem(`playground_last_file_${workspace}`);
        } catch {
            return null;
        }
    }, [workspace, isPlaygroundMode]);

    useEffect(() => {
        if (isPlaygroundMode && playgroundFileId) {
            try {
                localStorage.setItem(`playground_last_file_${workspace}`, playgroundFileId);
            } catch {
                /* ignore */
            }
        }
    }, [isPlaygroundMode, workspace, playgroundFileId]);

    // Adjust editor language when workspace changes
    useEffect(() => {
        const wsDef = WORKSPACES[workspace];
        if (isPlaygroundMode) {
            setPlaygroundFileId(null);
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

    return (
        <div className="editor-page">

            <div className="editor-main">
                <AppHeader>
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
                    <UnifiedSelect
                        value={workspace}
                        onChange={(v) => void handleWorkspaceChange(v as Workspace)}
                        options={workspaceOptions.map((ws) => ({ value: ws.id, label: ws.label }))}
                    />

                    <span style={{ marginLeft: "0.75rem" }}>{isPlaygroundMode ? "Playground" : "Problems"}</span>
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
                            const languageDisabled = isPlaygroundMode ? false : lockedLanguage !== null;
                            return (
                                <UnifiedSelect
                                    value={selectedLanguage}
                                    onChange={(next) => {
                                        if (isPlaygroundMode) {
                                            const currentDefault = problemConfig.getDefaultStarterCode(selectedLanguage);
                                            if (code === currentDefault) {
                                                setCode(problemConfig.getDefaultStarterCode(next));
                                            }
                                            setSelectedLanguage(next);
                                        } else {
                                            setSelectedLanguage(next);
                                            setCode(problemConfig.getDefaultStarterCode(next));
                                            setLockedLanguage(null);
                                        }
                                    }}
                                    options={languageOptions.map((lang) => ({ value: lang.id, label: lang.name }))}
                                    disabled={languageDisabled}
                                />
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

                {/* Full-width content area; sidebar overlays from the left so header/main never resize */}
                <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0, width: "100%" }}>
                    {/* Sidebar: absolute overlay; when collapsed (e.g. terminal fullscreen) width is 0 */}
                    <div
                        className="editor-side-panel-wrapper"
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: isSidePanelCollapsed ? 0 : "30%",
                                minWidth: 0,
                                maxWidth: "100%",
                                overflow: "hidden",
                                transition: "width 0.25s ease-out",
                                display: "flex",
                                flexDirection: "column",
                                zIndex: 2,
                                borderRight: isSidePanelCollapsed ? "none" : "1px solid var(--border-color)",
                                boxSizing: "border-box",
                            }}
                        >
                            <div
                                style={{
                                    width: "100%",
                                    minWidth: isSidePanelCollapsed ? 0 : 320,
                                    height: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                    position: "relative",
                                    backgroundColor: "var(--bg-secondary)",
                                }}
                            >
                                {isPlaygroundMode ? (
                                    <PlaygroundSidebar
                                            selectedFileId={playgroundFileId}
                                            code={code}
                                            selectedLanguage={selectedLanguage}
                                            defaultCodeForNewFile={problemConfig.getDefaultStarterCode(workspaceDefinition.defaultLanguage)}
                                            codeTheme={workspaceDefinition.codeTheme}
                                            initialFileId={initialPlaygroundFileId}
                                            onSelectFile={async (file: PlaygroundFile) => {
                                                await savePlaygroundFile("switch");
                                                setCode(file.code);
                                                setPlaygroundFileId(file.id);
                                            }}
                                            onCodeChange={setCode}
                                            onSelectedFileIdChange={setPlaygroundFileId}
                                            onShowInTerminal={() => void terminalPaneRef.current?.showInTerminal?.("/workspace/files")}
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
                                            isLoading={isProblemDataLoading}
                                        />
                                    )}
                                </div>
                            </div>

                    {/* Editor & Terminal: positioned to the right of the sidebar so run button and code are not behind it */}
                    <div
                        style={{
                            position: "absolute",
                            left: isSidePanelCollapsed ? 0 : "30%",
                            top: 0,
                            right: 0,
                            bottom: 0,
                            width: isSidePanelCollapsed ? "100%" : "70%",
                            transition: "left 0.25s ease-out, width 0.25s ease-out",
                            minWidth: 0,
                            minHeight: 0,
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                        }}
                    >
                        <button
                            type="button"
                            aria-label={isSidePanelCollapsed ? "Expand side panel" : "Collapse side panel"}
                            onClick={() => setIsSidePanelCollapsed((v) => !v)}
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
                            {isSidePanelCollapsed ? "▶" : "◀"}
                        </button>
                        <PanelGroup direction="vertical" style={{ flex: 1, minHeight: 0 }}>

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

                            {/* Bottom: Terminal (PTY, Images, Render panels) - owned by TerminalPane */}
                            <Panel defaultSize={isTerminalExpanded ? 100 : 30} minSize={15}>
                                <TerminalPane
                                    ref={terminalPaneRef}
                                    workspace={workspace}
                                    isExpanded={isTerminalExpanded}
                                    onToggleExpanded={onTerminalToggleExpanded}
                                    code={code}
                                    onContainerIdChange={setContainerId}
                                    onRunStart={onTerminalRunStart}
                                    onRunEnd={onTerminalRunEnd}
                                    onCreatingChange={setIsCreatingContainer}
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

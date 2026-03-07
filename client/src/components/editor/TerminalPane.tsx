import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import * as problemConfig from "problem-config";
import { apiUrl } from "../../services/apiOrigin";
import { getTerminalRunPayload, isSupportedLanguage, type SupportedLanguage } from "../../services/codeExecution";
import { TerminalPanel, type TerminalPanelHandle } from "./terminal/TerminalPanel";
import { WebGpuPanel, type WebGpuPanelHandle } from "./terminal/WebGpuPanel";
import { ImageViewerPanel } from "./terminal/ImageViewerPanel";

export type TerminalViewMode = "terminal" | "webgpu" | "images";

type WorkspaceId = ReturnType<typeof problemConfig.getWorkspaceIds>[number];

export type TerminalPaneHandle = {
    runInTerminal: (code: string, language: string) => Promise<void>;
    runInWebGpu: (code: string) => void;
    getWebGpuCanvas: () => HTMLCanvasElement | null;
    getContainerId: () => string | null;
    getActiveView: () => TerminalViewMode;
};

const CLIENT_ID_KEY = "editor_client_id";

function getClientId(): string {
    try {
        const existing = window.localStorage.getItem(CLIENT_ID_KEY);
        if (existing?.trim()) return existing.trim();
        const generated =
            (typeof crypto !== "undefined" && "randomUUID" in crypto && crypto.randomUUID()) ||
            `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(CLIENT_ID_KEY, generated);
        return generated;
    } catch {
        return "anonymous";
    }
}

type TerminalPaneProps = {
    workspace: WorkspaceId;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    /** Current editor code (for WebGPU run). */
    code: string;
    /** Notify parent when containerId changes (e.g. for LSP). */
    onContainerIdChange?: (id: string | null) => void;
    /** For Images panel: refetch when this changes. */
    imagesRefreshTrigger?: number;
    imagesPollAfterRun?: boolean;
    onImagesTabFocus?: () => void;
    /** Called when a terminal run is queued (waiting for socket). */
    onRunStart?: () => void;
    /** Called when a terminal run has been sent. */
    onRunEnd?: () => void;
    /** Called when creating/destroying container. */
    onCreatingChange?: (creating: boolean) => void;
};

export const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(function TerminalPane(
    {
        workspace,
        isExpanded,
        onToggleExpanded,
        code,
        onContainerIdChange,
        imagesRefreshTrigger = 0,
        imagesPollAfterRun = false,
        onImagesTabFocus,
        onRunStart,
        onRunEnd,
        onCreatingChange,
    },
    ref
) {
    const wsConfig = problemConfig.WORKSPACES[workspace as keyof typeof problemConfig.WORKSPACES];
    const showWebGpuTab = Boolean(wsConfig?.showWebGpuTab);
    const showImagePanel = Boolean(wsConfig?.showImagePanel);

    const [containerId, setContainerId] = useState<string | null>(null);
    const [isCreatingContainer, setIsCreatingContainer] = useState(false);
    const [activeView, setActiveView] = useState<TerminalViewMode>("terminal");
    const [webGpuRunTrigger, setWebGpuRunTrigger] = useState(0);
    const pendingRunRef = useRef<{ code: string; language: string } | null>(null);
    const terminalPanelRef = useRef<TerminalPanelHandle>(null);
    const webGpuPanelRef = useRef<WebGpuPanelHandle>(null);
    const activeViewRef = useRef<TerminalViewMode>(activeView);
    /** When true, we lost the container (e.g. WebSocket closed); don't auto-create again to avoid a loop. */
    const lostContainerRef = useRef(false);
    /** Count of connect failures (socket never opened); stop auto-create after this many to avoid a loop. */
    const connectFailureCountRef = useRef(0);
    const MAX_CONNECT_FAILURES = 3;
    const containerIdRef = useRef<string | null>(null);
    const onContainerIdChangeRef = useRef(onContainerIdChange);
    containerIdRef.current = containerId;
    onContainerIdChangeRef.current = onContainerIdChange;
    activeViewRef.current = activeView;

    const createContainer = useCallback(async (): Promise<string | null> => {
        setIsCreatingContainer(true);
        onCreatingChange?.(true);
        try {
            const response = await fetch(apiUrl("/api/containers"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspace, clientId: getClientId() }),
            });
            const data = (await response.json()) as { containerId?: string };
            if (data.containerId) {
                lostContainerRef.current = false;
                connectFailureCountRef.current = 0;
                setContainerId(data.containerId);
                onContainerIdChange?.(data.containerId);
                return data.containerId as string;
            }
            return null;
        } catch (err) {
            console.error("Container creation failed", err);
            return null;
        } finally {
            setIsCreatingContainer(false);
            onCreatingChange?.(false);
        }
    }, [workspace, onContainerIdChange, onCreatingChange]);

    const destroyContainer = useCallback(async (id: string) => {
        if (!id) return;
        try {
            await fetch(`/api/containers/${id}`, { method: "DELETE" });
        } catch (err) {
            console.error("Container destroy failed", err);
        }
        setContainerId(null);
        onContainerIdChange?.(null);
    }, [onContainerIdChange]);

    useEffect(() => {
        return () => {
            const id = containerIdRef.current;
            if (id) {
                void fetch(apiUrl(`/api/containers/${id}`), { method: "DELETE" }).catch(() => {});
                setContainerId(null);
                onContainerIdChangeRef.current?.(null);
            }
        };
    }, []);

    useEffect(() => {
        if (containerId) return;
        if (lostContainerRef.current) return;
        if (connectFailureCountRef.current >= MAX_CONNECT_FAILURES) return;
        void createContainer();
    }, [workspace, containerId, createContainer]);

    const handleResetContainer = useCallback(async () => {
        lostContainerRef.current = false;
        connectFailureCountRef.current = 0;
        if (containerId) {
            await destroyContainer(containerId);
        }
        await createContainer();
    }, [containerId, createContainer, destroyContainer]);

    const handlePendingRunSent = useCallback(() => {
        pendingRunRef.current = null;
        onRunEnd?.();
    }, [onRunEnd]);

    const handleContainerLost = useCallback(
        (options?: { hadOpened?: boolean }) => {
            if (options?.hadOpened) {
                lostContainerRef.current = true;
            } else {
                connectFailureCountRef.current += 1;
                if (connectFailureCountRef.current >= MAX_CONNECT_FAILURES) lostContainerRef.current = true;
            }
            setContainerId(null);
            onContainerIdChange?.(null);
        },
        [onContainerIdChange]
    );

    useImperativeHandle(ref, () => ({
        runInTerminal: async (runCode: string, language: string) => {
            if (!isSupportedLanguage(language)) return;
            let id = containerId;
            if (!id) id = await createContainer();
            if (!id) return;

            const { prepareCommand, payload } = getTerminalRunPayload(language as SupportedLanguage, runCode);
            if (prepareCommand) {
                try {
                    await fetch(apiUrl(`/api/containers/${id}/exec`), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command: prepareCommand }),
                    });
                } catch (err) {
                    console.error("Failed to prepare run script", err);
                    return;
                }
            }

            const sent = terminalPanelRef.current?.sendPayload(payload);
            if (sent) {
                onRunEnd?.();
                return;
            }
            pendingRunRef.current = { code: runCode, language };
            onRunStart?.();
        },
        runInWebGpu: () => {
            setWebGpuRunTrigger((t) => t + 1);
        },
        getWebGpuCanvas: () => webGpuPanelRef.current?.getCanvas() ?? null,
        getContainerId: () => containerId,
        getActiveView: () => activeViewRef.current,
    }), [containerId, createContainer, onRunEnd, onRunStart]);

    return (
        <div
            className="terminal-area"
            style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 1rem",
                    backgroundColor: "#252525",
                    borderBottom: "1px solid #333",
                    flexShrink: 0,
                }}
            >
                <button
                    onClick={onToggleExpanded}
                    style={{
                        marginRight: "0.5rem",
                        padding: "0.15rem 0.35rem",
                        borderRadius: "4px",
                        backgroundColor: "transparent",
                        border: "1px solid #444",
                        color: "#aaa",
                        fontSize: "0.75rem",
                    }}
                    title={isExpanded ? "Collapse terminal" : "Expand terminal"}
                >
                    {isExpanded ? "▼" : "▲"}
                </button>
                <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                    <button
                        type="button"
                        className={`editor-tab-button ${activeView === "terminal" ? "editor-tab-button--selected" : ""}`}
                        onClick={() => setActiveView("terminal")}
                    >
                        Terminal
                    </button>
                    {showWebGpuTab && (
                        <button
                            type="button"
                            className={`editor-tab-button ${activeView === "webgpu" ? "editor-tab-button--selected" : ""}`}
                            onClick={() => setActiveView("webgpu")}
                        >
                            WebGPU
                        </button>
                    )}
                    {showImagePanel && (
                        <button
                            type="button"
                            className={`editor-tab-button ${activeView === "images" ? "editor-tab-button--selected" : ""}`}
                            onClick={() => setActiveView("images")}
                        >
                            Images
                        </button>
                    )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }} />
                <span style={{ color: "#666", fontSize: "12px", marginRight: "0.75rem" }}>
                    {containerId ? `container-${containerId.slice(0, 8)}` : isCreatingContainer ? "Starting…" : "Click Run Code to start"}
                </span>
                <button
                    type="button"
                    onClick={() => void handleResetContainer()}
                    disabled={isCreatingContainer}
                    style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "999px",
                        border: "1px solid #444",
                        background: "transparent",
                        color: "#aaa",
                        fontSize: "0.75rem",
                        cursor: isCreatingContainer ? "not-allowed" : "pointer",
                    }}
                    title="Recreate container (fixes broken terminal)"
                >
                    {isCreatingContainer ? "…" : "Reset Terminal"}
                </button>
            </div>
            {showWebGpuTab && activeView === "webgpu" ? (
                <WebGpuPanel ref={webGpuPanelRef} code={code} runTrigger={webGpuRunTrigger} />
            ) : showImagePanel && activeView === "images" ? (
                <ImageViewerPanel
                    containerId={containerId}
                    refreshTrigger={imagesRefreshTrigger}
                    pollAfterRun={imagesPollAfterRun}
                    onFocus={onImagesTabFocus}
                />
            ) : containerId ? (
                <TerminalPanel
                    ref={terminalPanelRef}
                    containerId={containerId}
                    terminalTheme={problemConfig.getTerminalTheme(
                        problemConfig.WORKSPACES[workspace as keyof typeof problemConfig.WORKSPACES]?.terminalThemeKey ?? "kernel-dark"
                    )}
                    onContainerLost={handleContainerLost}
                    pendingRunRef={pendingRunRef}
                    onPendingRunSent={handlePendingRunSent}
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
                    {isCreatingContainer ? (
                        <span>Starting container…</span>
                    ) : (
                        <>
                            <span>
                                Click <strong>Run Code</strong> to launch the terminal
                            </span>
                            <span style={{ fontSize: "12px" }}>Output will appear here</span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
});

import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    useSortable,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as problemConfig from "problem-config";
import { getUserId } from "../../api/files";
import { apiUrl } from "../../services/apiOrigin";
import { getTerminalRunPayload, isSupportedLanguage, type SupportedLanguage } from "../../services/codeExecution";
import { TerminalPanel, type TerminalPanelHandle } from "./terminal/TerminalPanel";
import { ImageViewerPanel } from "./terminal/ImageViewerPanel";
import { RenderImagePanel, RenderVideoPanel, RenderInteractivePanel } from "./visualization";

export type TerminalViewMode = "terminal" | "images" | "render-image" | "render-video" | "render-interactive";

export type PanelType = TerminalViewMode;

type Panel = { id: string; type: PanelType };

type WorkspaceId = ReturnType<typeof problemConfig.getWorkspaceIds>[number];

export type TerminalPaneHandle = {
    runInTerminal: (code: string, language: string) => Promise<void>;
    getContainerId: () => string | null;
    getActiveView: () => TerminalViewMode;
    /** Open a new terminal tab and cd to the given path (e.g. /workspace/files). */
    showInTerminal: (dirPath: string) => Promise<void>;
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

function genPanelId(): string {
    return (typeof crypto !== "undefined" && "randomUUID" in crypto && crypto.randomUUID()) ||
        `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function panelLabel(type: PanelType): string {
    switch (type) {
        case "terminal": return "Terminal";
        case "images": return "Images";
        case "render-image": return "Render: Image";
        case "render-video": return "Render: Video";
        case "render-interactive": return "Render: Interactive";
        default: return type;
    }
}

type TerminalPaneProps = {
    workspace: WorkspaceId;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    code: string;
    onContainerIdChange?: (id: string | null) => void;
    imagesRefreshTrigger?: number;
    imagesPollAfterRun?: boolean;
    onImagesTabFocus?: () => void;
    onRunStart?: () => void;
    onRunEnd?: () => void;
    onCreatingChange?: (creating: boolean) => void;
};

function SortableTab({
    panel,
    isActive,
    onSelect,
    onClose,
    canClose,
}: {
    panel: Panel;
    isActive: boolean;
    onSelect: () => void;
    onClose: (e: React.MouseEvent) => void;
    canClose: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: panel.id,
    });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    };
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`editor-tab-button ${isActive ? "editor-tab-button--selected" : ""}`}
            {...attributes}
            {...listeners}
            onClick={onSelect}
            role="tab"
            aria-selected={isActive}
        >
            <span style={{ marginRight: canClose ? "0.25rem" : 0 }}>{panelLabel(panel.type)}</span>
            {canClose && (
                <button
                    type="button"
                    aria-label="Close tab"
                    onClick={onClose}
                    style={{
                        padding: 0,
                        margin: 0,
                        border: "none",
                        background: "none",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "0.9em",
                        lineHeight: 1,
                        opacity: 0.8,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    ×
                </button>
            )}
        </div>
    );
}

export const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(function TerminalPane(
    {
        workspace,
        isExpanded,
        onToggleExpanded,
        code: _code,
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
    const showRenderImageTab = Boolean(wsConfig?.showRenderImageTab);
    const showRenderVideoTab = Boolean(wsConfig?.showRenderVideoTab);
    const showRenderInteractiveTab = Boolean(wsConfig?.showRenderInteractiveTab);
    const showImagePanel = Boolean(wsConfig?.showImagePanel);

    const [containerId, setContainerId] = useState<string | null>(null);
    const [isCreatingContainer, setIsCreatingContainer] = useState(false);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const addMenuRef = useRef<HTMLDivElement>(null);

    const initialPanels = useRef<Panel[] | null>(null);
    if (initialPanels.current === null) {
        const list: Panel[] = [{ id: genPanelId(), type: "terminal" }];
        if (showRenderImageTab) list.push({ id: genPanelId(), type: "render-image" });
        if (showRenderVideoTab) list.push({ id: genPanelId(), type: "render-video" });
        if (showRenderInteractiveTab) list.push({ id: genPanelId(), type: "render-interactive" });
        if (showImagePanel) list.push({ id: genPanelId(), type: "images" });
        initialPanels.current = list;
    }
    const [panels, setPanels] = useState<Panel[]>(() => initialPanels.current!);
    const [activePanelId, setActivePanelId] = useState<string>(() => initialPanels.current![0].id);

    const pendingRunRef = useRef<{ code: string; language: string } | null>(null);
    const pendingCdRef = useRef<string | null>(null);
    const terminalRefs = useRef(new Map<string, TerminalPanelHandle>());
    const lostContainerRef = useRef(false);
    const connectFailureCountRef = useRef(0);
    const MAX_CONNECT_FAILURES = 3;
    const containerIdRef = useRef<string | null>(null);
    const onContainerIdChangeRef = useRef(onContainerIdChange);
    const panelsRef = useRef(panels);
    const activePanelIdRef = useRef(activePanelId);
    containerIdRef.current = containerId;
    onContainerIdChangeRef.current = onContainerIdChange;
    panelsRef.current = panels;
    activePanelIdRef.current = activePanelId;

    const activePanel = panels.find((p) => p.id === activePanelId) ?? panels[0];

    const createContainer = useCallback(async (): Promise<string | null> => {
        setIsCreatingContainer(true);
        onCreatingChange?.(true);
        try {
            const userId = getUserId();
            const response = await fetch(apiUrl("/api/containers"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspace,
                    clientId: getClientId(),
                    ...(userId ? { userId } : {}),
                }),
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
            await fetch(apiUrl(`/api/containers/${id}`), { method: "DELETE" });
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

    const workspaceChangedRef = useRef(false);
    useEffect(() => {
        if (!workspaceChangedRef.current) {
            workspaceChangedRef.current = true;
            return;
        }
        const list: Panel[] = [{ id: genPanelId(), type: "terminal" }];
        if (showRenderImageTab) list.push({ id: genPanelId(), type: "render-image" });
        if (showRenderVideoTab) list.push({ id: genPanelId(), type: "render-video" });
        if (showRenderInteractiveTab) list.push({ id: genPanelId(), type: "render-interactive" });
        if (showImagePanel) list.push({ id: genPanelId(), type: "images" });
        setPanels(list);
        setActivePanelId(list[0].id);
    }, [workspace, showRenderImageTab, showRenderVideoTab, showRenderInteractiveTab, showImagePanel]);

    const handlePendingRunSent = useCallback(() => {
        pendingRunRef.current = null;
        onRunEnd?.();
    }, [onRunEnd]);

    const handleCdSent = useCallback(() => {
        pendingCdRef.current = null;
    }, []);

    const handleContainerLost = useCallback(
        (options?: { hadOpened?: boolean }) => {
            if (options?.hadOpened) lostContainerRef.current = true;
            else {
                connectFailureCountRef.current += 1;
                if (connectFailureCountRef.current >= MAX_CONNECT_FAILURES) lostContainerRef.current = true;
            }
            setContainerId(null);
            onContainerIdChange?.(null);
        },
        [onContainerIdChange]
    );

    const addPanel = useCallback(
        (type: PanelType, focus = true) => {
            setAddMenuOpen(false);
            const id = genPanelId();
            setPanels((prev) => [...prev, { id, type }]);
            if (focus) setActivePanelId(id);
        },
        []
    );

    const closePanel = useCallback((e: React.MouseEvent, panelId: string) => {
        e.stopPropagation();
        const nextList = panels.filter((p) => p.id !== panelId);
        if (nextList.length === 0) {
            const newPanel = { id: genPanelId(), type: "terminal" as PanelType };
            setPanels([newPanel]);
            setActivePanelId(newPanel.id);
            return;
        }
        setPanels(nextList);
        setActivePanelId((current) => {
            if (current !== panelId) return current;
            const idx = panels.findIndex((p) => p.id === panelId);
            return nextList[Math.min(idx, nextList.length - 1)]?.id ?? nextList[0].id;
        });
    }, [panels]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setPanels((prev) => {
                const oldIndex = prev.findIndex((p) => p.id === active.id);
                const newIndex = prev.findIndex((p) => p.id === over.id);
                if (oldIndex === -1 || newIndex === -1) return prev;
                return arrayMove(prev, oldIndex, newIndex);
            });
        }
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor)
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

            const panelsList = panelsRef.current;
            let terminalId = panelsList.find((p) => p.type === "terminal")?.id;
            if (!terminalId) {
                addPanel("terminal", false);
                terminalId = undefined;
            }
            const handle = terminalId ? terminalRefs.current.get(terminalId) : undefined;
            const sent = handle?.sendPayload(payload);
            if (sent) {
                onRunEnd?.();
                return;
            }
            pendingRunRef.current = { code: runCode, language };
            onRunStart?.();
        },
        getContainerId: () => containerId,
        getActiveView: () => activePanel?.type ?? "terminal",
        showInTerminal: async (dirPath: string) => {
            pendingCdRef.current = dirPath;
            let id = containerId;
            if (!id) id = await createContainer();
            if (!id) return;
            addPanel("terminal");
        },
    }), [containerId, createContainer, onRunEnd, onRunStart, activePanel?.type, addPanel]);

    useEffect(() => {
        function onDocClick(ev: MouseEvent) {
            if (addMenuRef.current && !addMenuRef.current.contains(ev.target as Node)) setAddMenuOpen(false);
        }
        document.addEventListener("click", onDocClick);
        return () => document.removeEventListener("click", onDocClick);
    }, []);

    const terminalTheme = problemConfig.getTerminalTheme(
        problemConfig.WORKSPACES[workspace as keyof typeof problemConfig.WORKSPACES]?.terminalThemeKey ?? "kernel-dark"
    );

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
                    paddingLeft: "2rem",
                    backgroundColor: "#252525",
                    borderBottom: "1px solid #333",
                    flexShrink: 0,
                }}
            >
                <button
                    onClick={onToggleExpanded}
                    style={{
                        marginRight: "0.5rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "999px",
                        backgroundColor: "transparent",
                        border: "1px solid #444",
                        color: "#aaa",
                        fontSize: "0.75rem",
                    }}
                    title={isExpanded ? "Collapse terminal" : "Expand terminal"}
                >
                    {isExpanded ? "▼" : "▲"}
                </button>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={panels.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
                        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", flexWrap: "wrap" }}>
                            {panels.map((panel) => (
                                <SortableTab
                                    key={panel.id}
                                    panel={panel}
                                    isActive={panel.id === activePanelId}
                                    onSelect={() => setActivePanelId(panel.id)}
                                    onClose={(e) => closePanel(e, panel.id)}
                                    canClose={panels.length > 1}
                                />
                            ))}
                            <div ref={addMenuRef} style={{ position: "relative" }}>
                                <button
                                    type="button"
                                    className="editor-tab-button"
                                    onClick={() => setAddMenuOpen((o) => !o)}
                                    title="Add tab"
                                    style={{ minWidth: "1.5rem" }}
                                >
                                    +
                                </button>
                                {addMenuOpen && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "100%",
                                            left: 0,
                                            marginTop: "2px",
                                            background: "#333",
                                            border: "1px solid #444",
                                            borderRadius: "6px",
                                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                                            zIndex: 100,
                                            padding: "0.25rem 0",
                                            minWidth: "10rem",
                                        }}
                                    >
                                        <button
                                            type="button"
                                            style={{
                                                display: "block",
                                                width: "100%",
                                                padding: "0.4rem 0.75rem",
                                                textAlign: "left",
                                                border: "none",
                                                background: "none",
                                                color: "#e0e0e0",
                                                cursor: "pointer",
                                                fontSize: "0.8rem",
                                            }}
                                            onClick={() => addPanel("terminal")}
                                        >
                                            New Terminal
                                        </button>
                                        {showRenderImageTab && (
                                            <button
                                                type="button"
                                                style={{
                                                    display: "block",
                                                    width: "100%",
                                                    padding: "0.4rem 0.75rem",
                                                    textAlign: "left",
                                                    border: "none",
                                                    background: "none",
                                                    color: "#e0e0e0",
                                                    cursor: "pointer",
                                                    fontSize: "0.8rem",
                                                }}
                                                onClick={() => addPanel("render-image")}
                                            >
                                                Render: Image
                                            </button>
                                        )}
                                        {showRenderVideoTab && (
                                            <button
                                                type="button"
                                                style={{
                                                    display: "block",
                                                    width: "100%",
                                                    padding: "0.4rem 0.75rem",
                                                    textAlign: "left",
                                                    border: "none",
                                                    background: "none",
                                                    color: "#e0e0e0",
                                                    cursor: "pointer",
                                                    fontSize: "0.8rem",
                                                }}
                                                onClick={() => addPanel("render-video")}
                                            >
                                                Render: Video
                                            </button>
                                        )}
                                        {showRenderInteractiveTab && (
                                            <button
                                                type="button"
                                                style={{
                                                    display: "block",
                                                    width: "100%",
                                                    padding: "0.4rem 0.75rem",
                                                    textAlign: "left",
                                                    border: "none",
                                                    background: "none",
                                                    color: "#e0e0e0",
                                                    cursor: "pointer",
                                                    fontSize: "0.8rem",
                                                }}
                                                onClick={() => addPanel("render-interactive")}
                                            >
                                                Render: Interactive
                                            </button>
                                        )}
                                        {showImagePanel && (
                                            <button
                                                type="button"
                                                style={{
                                                    display: "block",
                                                    width: "100%",
                                                    padding: "0.4rem 0.75rem",
                                                    textAlign: "left",
                                                    border: "none",
                                                    background: "none",
                                                    color: "#e0e0e0",
                                                    cursor: "pointer",
                                                    fontSize: "0.8rem",
                                                }}
                                                onClick={() => addPanel("images")}
                                            >
                                                Images
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </SortableContext>
                </DndContext>
                <div style={{ flex: 1, minWidth: 0 }} />
                <span style={{ color: "#666", fontSize: "12px", marginRight: "0.75rem" }} title={containerId ? `Container: ${containerId}` : undefined}>
                    {containerId ? "Your files: /workspace/files" : isCreatingContainer ? "Starting…" : "Click Run Code to start"}
                </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {panels.map((panel) => (
                    <div
                        key={panel.id}
                        style={{
                            display: panel.id === activePanelId ? "flex" : "none",
                            flex: 1,
                            minHeight: 0,
                            flexDirection: "column",
                            overflow: "hidden",
                        }}
                    >
                        {panel.type === "terminal" && (
                            containerId ? (
                                <TerminalPanel
                                    ref={(r) => {
                                        if (r) terminalRefs.current.set(panel.id, r);
                                        else terminalRefs.current.delete(panel.id);
                                    }}
                                    containerId={containerId}
                                    terminalTheme={terminalTheme}
                                    onContainerLost={handleContainerLost}
                                    pendingRunRef={pendingRunRef}
                                    onPendingRunSent={handlePendingRunSent}
                                    isActive={panel.id === activePanelId}
                                    pendingCdRef={pendingCdRef}
                                    onCdSent={handleCdSent}
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
                                    {isCreatingContainer ? <span>Starting container…</span> : (
                                        <>
                                            <span>Click <strong>Run Code</strong> to launch the terminal</span>
                                            <span style={{ fontSize: "12px" }}>Output will appear here</span>
                                        </>
                                    )}
                                </div>
                            )
                        )}
                        {panel.type === "render-image" && <RenderImagePanel />}
                        {panel.type === "render-video" && <RenderVideoPanel containerId={containerId} />}
                        {panel.type === "render-interactive" && <RenderInteractivePanel containerId={containerId} />}
                        {panel.type === "images" && (
                            <ImageViewerPanel
                                containerId={containerId}
                                refreshTrigger={imagesRefreshTrigger}
                                pollAfterRun={imagesPollAfterRun}
                                onFocus={onImagesTabFocus}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
});

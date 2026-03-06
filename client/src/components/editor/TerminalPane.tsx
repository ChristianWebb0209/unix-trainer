import type { RefObject } from "react";

type TerminalViewMode = "terminal" | "webgpu";

type TerminalPaneProps = {
    containerId: string | null;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    onResetContainer?: () => void;
    isCreatingContainer?: boolean;
    showWebGpuTab: boolean;
    activeView: TerminalViewMode;
    onActiveViewChange: (view: TerminalViewMode) => void;
    terminalContainerRef: RefObject<HTMLDivElement | null>;
    webgpuCanvasRef: RefObject<HTMLCanvasElement | null>;
};

export function TerminalPane({
    containerId,
    isExpanded,
    onToggleExpanded,
    onResetContainer,
    isCreatingContainer = false,
    showWebGpuTab,
    activeView,
    onActiveViewChange,
    terminalContainerRef,
    webgpuCanvasRef,
}: TerminalPaneProps) {
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
                        className={`editor-tab-button ${activeView === "terminal" && showWebGpuTab ? "editor-tab-button--selected" : ""}`}
                        onClick={() => onActiveViewChange("terminal")}
                    >
                        Terminal
                    </button>
                    {showWebGpuTab && (
                        <button
                            type="button"
                            className={`editor-tab-button ${activeView === "webgpu" ? "editor-tab-button--selected" : ""}`}
                            onClick={() => onActiveViewChange("webgpu")}
                        >
                            WebGPU
                        </button>
                    )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }} />
                <span style={{ color: "#666", fontSize: "12px", marginRight: "0.75rem" }}>
                    {containerId ? `container-${containerId.slice(0, 8)}` : isCreatingContainer ? "Starting…" : "Click Run Code to start"}
                </span>
                {onResetContainer && (
                    <button
                        type="button"
                        onClick={() => void onResetContainer()}
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
                )}
            </div>
            {showWebGpuTab && activeView === "webgpu" ? (
                <canvas
                    ref={webgpuCanvasRef}
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
}


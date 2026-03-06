import type { RefObject } from "react";

type TerminalViewMode = "terminal" | "webgpu";

type TerminalPaneProps = {
    containerId: string | null;
    isExpanded: boolean;
    onToggleExpanded: () => void;
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
                <div style={{ display: "flex", gap: "0.25rem" }}>
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
                <span style={{ color: "#666", fontSize: "12px", marginLeft: "auto" }}>
                    {containerId ? `container-${containerId.slice(0, 8)}` : "Click Run Code to start"}
                </span>
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
                    <span>
                        Click <strong>Run Code</strong> to launch the terminal
                    </span>
                    <span style={{ fontSize: "12px" }}>Output will appear here</span>
                </div>
            )}
        </div>
    );
}


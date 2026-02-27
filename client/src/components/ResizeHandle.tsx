import { PanelResizeHandle } from "react-resizable-panels";

export default function ResizeHandle({ className = "", id }: { className?: string, id?: string }) {
    return (
        <PanelResizeHandle
            className={`resize-handle ${className}`}
            id={id}
            style={{
                backgroundColor: "var(--border-color)",
                transition: "background-color 0.2s ease",
            }}
        >
            <div className="resize-handle-inner" />
        </PanelResizeHandle>
    );
}

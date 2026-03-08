import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../../../services/apiOrigin";

type ImageViewerPanelProps = {
    containerId: string | null;
    refreshTrigger?: number;
    pollAfterRun?: boolean;
    onFocus?: () => void;
};

export function ImageViewerPanel({
    containerId,
    refreshTrigger = 0,
    pollAfterRun = false,
    onFocus,
}: ImageViewerPanelProps) {
    const [files, setFiles] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<string | null>(null);

    const fetchImages = useCallback(async () => {
        if (!containerId) {
            setFiles([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/containers/${containerId}/outputs`);
            if (!res.ok) throw new Error(res.statusText);
            const data = (await res.json()) as { files?: string[] };
            setFiles(data.files ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load images");
            setFiles([]);
        } finally {
            setLoading(false);
        }
    }, [containerId]);

    useEffect(() => {
        void fetchImages();
    }, [fetchImages]);

    useEffect(() => {
        if (refreshTrigger === 0 || !containerId) return;
        void fetchImages();
        if (!pollAfterRun) return;
        const intervals = 5;
        const delayMs = 2000;
        const ids: ReturnType<typeof setInterval>[] = [];
        for (let i = 1; i <= intervals; i++) {
            ids.push(setInterval(() => void fetchImages(), i * delayMs));
        }
        return () => ids.forEach((id) => clearInterval(id));
    }, [refreshTrigger, containerId, pollAfterRun, fetchImages]);

    const handleRefresh = () => {
        void fetchImages();
    };

    if (!containerId) {
        return (
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#666",
                    gap: "0.5rem",
                    padding: "1.5rem",
                }}
            >
                <span>Start the terminal to view images</span>
                <span style={{ fontSize: "12px" }}>
                    Save plots to <code style={{ background: "#333", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>/tmp/outputs/</code> in your Python code
                </span>
            </div>
        );
    }

    if (loading && files.length === 0) {
        return (
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#888",
                }}
            >
                Loading images…
            </div>
        );
    }

    return (
        <div
            style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden",
            }}
            onFocus={onFocus}
            tabIndex={0}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 1rem",
                    borderBottom: "1px solid #333",
                    flexShrink: 0,
                }}
            >
                <span style={{ fontSize: "0.85rem", color: "#aaa" }}>
                    {files.length} image{files.length !== 1 ? "s" : ""}
                </span>
                <button
                    type="button"
                    onClick={handleRefresh}
                    style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "4px",
                        border: "1px solid #444",
                        background: "transparent",
                        color: "#aaa",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                    }}
                >
                    Refresh
                </button>
            </div>
            {error && (
                <div
                    style={{
                        padding: "0.75rem 1rem",
                        color: "var(--danger-color, #e57373)",
                        fontSize: "0.85rem",
                    }}
                >
                    {error}
                </div>
            )}
            {files.length === 0 && !loading ? (
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#666",
                        gap: "0.75rem",
                        padding: "1.5rem",
                        textAlign: "center",
                    }}
                >
                    <span>No images yet</span>
                    <span style={{ fontSize: "12px", maxWidth: "320px" }}>
                        Run Python code that saves plots to{" "}
                        <code style={{ background: "#333", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>
                            /tmp/outputs/
                        </code>
                        . Example: <code style={{ background: "#333", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>plt.savefig("/tmp/outputs/plot.png")</code>
                    </span>
                </div>
            ) : (
                <div
                    style={{
                        flex: 1,
                        overflow: "auto",
                        padding: "1rem",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                        gap: "1rem",
                        alignContent: "start",
                    }}
                >
                    {files.map((filename) => (
                        <button
                            key={filename}
                            type="button"
                            onClick={() => setLightbox(filename)}
                            style={{
                                padding: 0,
                                border: "1px solid #444",
                                borderRadius: "8px",
                                overflow: "hidden",
                                background: "#1a1a1a",
                                cursor: "pointer",
                                display: "block",
                            }}
                        >
                            <img
                                src={apiUrl(`/api/containers/${containerId}/outputs/${encodeURIComponent(filename)}`)}
                                alt={filename}
                                style={{
                                    width: "100%",
                                    height: "140px",
                                    objectFit: "contain",
                                    display: "block",
                                }}
                            />
                            <div
                                style={{
                                    padding: "0.35rem 0.5rem",
                                    fontSize: "0.7rem",
                                    color: "#888",
                                    textOverflow: "ellipsis",
                                    overflow: "hidden",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {filename}
                            </div>
                        </button>
                    ))}
                </div>
            )}
            {lightbox && containerId && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Image preview"
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.9)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10000,
                        padding: "2rem",
                    }}
                    onClick={() => setLightbox(null)}
                >
                    <img
                        src={apiUrl(`/api/containers/${containerId}/outputs/${encodeURIComponent(lightbox)}`)}
                        alt={lightbox}
                        style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}

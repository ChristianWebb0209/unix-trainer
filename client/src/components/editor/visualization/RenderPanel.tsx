/**
 * Render panel — displays frames produced by code running in the container.
 *
 * The program calls tt_render_frame(rgba, w, h); a streamer in the container ships
 * each new frame over /api/containers/:id/frames, and this panel uploads it to a
 * GPU texture drawn on a screen-filling quad.
 *
 * Frames arrive as binary, laid out exactly as tt_render.h writes them:
 *   u32 magic ('TTF1')  u32 seq  u32 width  u32 height  rgba[width*height*4]
 *
 * A single still image is just a one-frame stream, so this one panel covers both
 * static renders and animation.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getApiWsOrigin } from "../../../services/apiOrigin";

export type RenderPanelProps = {
    /** Container to stream frames from. Null until the container is up. */
    containerId?: string | null;
};

const FRAME_MAGIC = 0x31465454;
const HEADER_BYTES = 16;
const BACKGROUND = 0x14161a;
const MAX_CONNECT_ATTEMPTS = 6;
const RECONNECT_DELAY_MS = 1500;

type Status = "idle" | "connecting" | "waiting" | "streaming" | "error";

export function RenderPanel({ containerId }: RenderPanelProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const textureRef = useRef<THREE.DataTexture | null>(null);
    const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const frameSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
    const wsRef = useRef<WebSocket | null>(null);

    const [status, setStatus] = useState<Status>("idle");
    // Frames arrive faster than React should re-render. Mirror the status in a
    // ref and only call setStatus on an actual transition - setting it per frame
    // re-rendered the whole panel 20+ times a second and throttled playback.
    const statusRef = useRef<Status>("idle");
    const [detail, setDetail] = useState<string>("");
    const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
    const [fps, setFps] = useState(0);

    // Fits the quad to the image aspect ratio (letterbox) rather than stretching it.
    const applyAspect = useRef<() => void>(() => {});

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(BACKGROUND);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;

        const geometry = new THREE.PlaneGeometry(2, 2);
        // Flip V so row 0 of the frame buffer renders at the top of the panel.
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
        uv.needsUpdate = true;

        const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
        materialRef.current = material;

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        meshRef.current = mesh;

        const renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
        mount.appendChild(renderer.domElement);
        // The panel is often constructed inside a display:none tab, where the
        // element measures 0 and the canvas would be stuck at 1x1 forever. The
        // draw loop re-checks the size every frame instead of relying on a
        // one-shot measurement or a ResizeObserver notification.
        rendererRef.current = renderer;

        // Recomputed every frame rather than only on resize. A panel that is
        // mid-animation (or hidden behind another tab) reports a height of 0,
        // which collapsed the quad to zero width; doing it in the draw loop means
        // the very next frame corrects itself once real dimensions exist.
        const fitQuadToFrame = () => {
            const w = mount.clientWidth;
            const h = mount.clientHeight;
            const { width: iw, height: ih } = frameSizeRef.current;
            if (!meshRef.current || w < 1 || h < 1 || iw < 1 || ih < 1) return;
            const panelAspect = w / h;
            const imageAspect = iw / ih;
            if (imageAspect > panelAspect) {
                meshRef.current.scale.set(1, panelAspect / imageAspect, 1);
            } else {
                meshRef.current.scale.set(imageAspect / panelAspect, 1, 1);
            }
        };
        applyAspect.current = fitQuadToFrame;

        // Keep the drawing buffer matched to the element, checked every frame.
        let sizedTo = { width: 0, height: 0 };
        const syncRendererSize = () => {
            const w = mount.clientWidth;
            const h = mount.clientHeight;
            if (w < 1 || h < 1) return;                       // hidden tab: nothing to size to
            if (w === sizedTo.width && h === sizedTo.height) return;
            sizedTo = { width: w, height: h };
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(w, h);
        };

        let animationId = 0;
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            syncRendererSize();
            fitQuadToFrame();
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(animationId);
            textureRef.current?.dispose();
            material.dispose();
            geometry.dispose();
            renderer.dispose();
            if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
            rendererRef.current = null;
            textureRef.current = null;
            materialRef.current = null;
            meshRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!containerId) {
            statusRef.current = "idle";
            setStatus("idle");
            setDetail("");
            return;
        }

        let cancelled = false;
        let attempts = 0;
        let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
        let framesThisSecond = 0;

        const fpsTimer = setInterval(() => {
            setFps(framesThisSecond);
            framesThisSecond = 0;
        }, 1000);

        /** Uploads one decoded frame, reallocating the texture only when size changes. */
        const pushFrame = (width: number, height: number, rgba: Uint8Array) => {
            const material = materialRef.current;
            if (!material) return;

            const current = frameSizeRef.current;
            if (!textureRef.current || current.width !== width || current.height !== height) {
                textureRef.current?.dispose();
                const texture = new THREE.DataTexture(
                    new Uint8Array(rgba),
                    width,
                    height,
                    THREE.RGBAFormat
                );
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.needsUpdate = true;
                textureRef.current = texture;
                material.map = texture;
                material.color.setHex(0xffffff);
                material.needsUpdate = true;
                frameSizeRef.current = { width, height };
                setDimensions({ width, height });
                applyAspect.current();
            } else {
                (textureRef.current.image.data as Uint8Array).set(rgba);
                textureRef.current.needsUpdate = true;
            }
        };

        const connect = () => {
            if (cancelled) return;
            attempts += 1;
            statusRef.current = "connecting";
            setStatus("connecting");
            setDetail("");

            const ws = new WebSocket(`${getApiWsOrigin()}/api/containers/${containerId}/frames`);
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            ws.onopen = () => {
                attempts = 0;
                statusRef.current = "waiting";
                setStatus("waiting");
            };

            ws.onmessage = (event) => {
                // The server sends a JSON string only to report an attach failure.
                if (typeof event.data === "string") {
                    try {
                        const parsed = JSON.parse(event.data) as { error?: string };
                        if (parsed.error) {
                            statusRef.current = "error";
                            setStatus("error");
                            setDetail(parsed.error);
                        }
                    } catch {
                        /* ignore non-JSON text */
                    }
                    return;
                }

                const buffer = event.data as ArrayBuffer;
                if (buffer.byteLength < HEADER_BYTES) return;

                const view = new DataView(buffer);
                if (view.getUint32(0, true) !== FRAME_MAGIC) return;

                const width = view.getUint32(8, true);
                const height = view.getUint32(12, true);
                const expected = HEADER_BYTES + width * height * 4;
                if (width < 1 || height < 1 || buffer.byteLength < expected) return;

                pushFrame(width, height, new Uint8Array(buffer, HEADER_BYTES, width * height * 4));
                framesThisSecond += 1;
                if (statusRef.current !== "streaming") {
                    statusRef.current = "streaming";
                    setStatus("streaming");
                }
            };

            ws.onerror = () => {
                if (!cancelled) statusRef.current = "error"; setStatus("error");
            };

            ws.onclose = () => {
                wsRef.current = null;
                if (cancelled) return;
                // The container may still be starting when the panel opens.
                if (attempts < MAX_CONNECT_ATTEMPTS) {
                    statusRef.current = "connecting";
                    setStatus("connecting");
                    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
                } else {
                    statusRef.current = "error";
                    setStatus("error");
                    setDetail("Could not attach to the container's frame stream.");
                }
            };
        };

        connect();

        return () => {
            cancelled = true;
            clearInterval(fpsTimer);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, [containerId]);

    const statusText = (() => {
        switch (status) {
            case "idle":
                return "Start the terminal to begin streaming";
            case "connecting":
                return "Connecting…";
            case "waiting":
                return "Connected — waiting for the first frame";
            case "streaming":
                return dimensions ? `${dimensions.width}×${dimensions.height} · ${fps} fps` : "Streaming";
            case "error":
                return detail || "Stream error";
        }
    })();

    const showHint = status === "waiting" || status === "idle";

    return (
        <div
            style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#14161a",
            }}
        >
            <div
                style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.75rem",
                    color: status === "error" ? "#e57373" : "#8b929e",
                    borderBottom: "1px solid #262a31",
                }}
            >
                <span
                    aria-hidden
                    style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        backgroundColor:
                            status === "streaming" ? "#4ade80" : status === "error" ? "#e57373" : "#6b7280",
                    }}
                />
                <span>{statusText}</span>
            </div>

            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
                {showHint && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            color: "#6b7280",
                            fontSize: "0.8rem",
                            pointerEvents: "none",
                            textAlign: "center",
                            padding: "1rem",
                        }}
                    >
                        <span>No frames yet</span>
                        <span style={{ fontSize: "0.72rem", maxWidth: "24rem" }}>
                            Run code that calls{" "}
                            <code style={{ background: "#22262d", padding: "0.15rem 0.35rem", borderRadius: "4px" }}>
                                tt_render_frame(rgba, width, height)
                            </code>{" "}
                            after{" "}
                            <code style={{ background: "#22262d", padding: "0.15rem 0.35rem", borderRadius: "4px" }}>
                                #include "tt_render.h"
                            </code>
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

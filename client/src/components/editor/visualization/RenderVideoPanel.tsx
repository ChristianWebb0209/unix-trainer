/**
 * Render: Video — real-time frame stream from CUDA.
 * CUDA produces frames continuously → server sends via WebSocket →
 * browser updates DataTexture each frame; Three.js redraws automatically.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getApiWsOrigin } from "../../../services/apiOrigin";

export type RenderVideoPanelProps = {
    /** When set, connect to this container's frame stream (e.g. ws://.../containers/:id/frames). */
    containerId?: string | null;
};

export function RenderVideoPanel({ containerId }: RenderVideoPanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const textureRef = useRef<THREE.DataTexture | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<string>("No container");

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;

        const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
        texture.needsUpdate = true;
        textureRef.current = texture;

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
        });
        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0x1a1a1a, 1);
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const onResize = () => {
            if (!container || !rendererRef.current) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            rendererRef.current.setSize(w, h);
            rendererRef.current.setPixelRatio(window.devicePixelRatio);
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(container);

        let frameId: number;
        const animate = () => {
            frameId = requestAnimationFrame(animate);
            if (rendererRef.current) rendererRef.current.render(scene, camera);
        };
        animate();

        return () => {
            ro.disconnect();
            cancelAnimationFrame(frameId);
            texture.dispose();
            material.dispose();
            geometry.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
            sceneRef.current = null;
            rendererRef.current = null;
            textureRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!containerId) {
            setStatus("No container");
            return;
        }

        const base = getApiWsOrigin();
        const wsUrl = `${base}/api/containers/${containerId}/frames`;
        setStatus("Connecting…");
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => setStatus("Connected — waiting for frames");
        ws.onerror = () => setStatus("Connection error");
        ws.onclose = () => {
            wsRef.current = null;
            setStatus("Disconnected");
        };

        ws.onmessage = (event) => {
            const texture = textureRef.current;
            if (!texture) return;
            try {
                const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
                if (data.pixels != null && data.width && data.height) {
                    const pixels = data.pixels instanceof Uint8Array
                        ? data.pixels
                        : new Uint8Array(Array.isArray(data.pixels) ? data.pixels : data.pixels);
                    texture.image.data = pixels;
                    texture.image.width = data.width;
                    texture.image.height = data.height;
                    texture.needsUpdate = true;
                }
            } catch {
                // binary or other format could be handled here
            }
        };

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [containerId]);

    return (
        <div
            style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#1a1a1a",
            }}
        >
            <div
                style={{
                    flexShrink: 0,
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.75rem",
                    color: "#888",
                }}
            >
                {status}
            </div>
            <div
                ref={containerRef}
                style={{ flex: 1, minHeight: 0, width: "100%" }}
            />
        </div>
    );
}

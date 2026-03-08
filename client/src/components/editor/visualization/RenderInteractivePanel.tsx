/**
 * Render: Interactive — raw simulation data (e.g. particle positions) from CUDA.
 * CUDA computes physics → send positions to browser →
 * Three.js BufferGeometry + PointsMaterial for smooth GPU-rendered points.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getApiWsOrigin } from "../../../services/apiOrigin";

export type RenderInteractivePanelProps = {
    /** When set, connect to this container's data stream for positions. */
    containerId?: string | null;
};

const DEFAULT_POINT_SIZE = 2;
const DEFAULT_COLOR = 0x7fb4a8;

export function RenderInteractivePanel({ containerId }: RenderInteractivePanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const pointsRef = useRef<THREE.Points | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<string>("No container");

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x1a1a1a);

        const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.z = 5;
        cameraRef.current = camera;

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([0, 0, 0]);
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);

        const material = new THREE.PointsMaterial({
            size: DEFAULT_POINT_SIZE,
            color: DEFAULT_COLOR,
            sizeAttenuation: true,
        });
        const points = new THREE.Points(geometry, material);
        scene.add(points);
        pointsRef.current = points;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const onResize = () => {
            if (!container || !cameraRef.current || !rendererRef.current) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h);
            rendererRef.current.setPixelRatio(window.devicePixelRatio);
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(container);

        let frameId: number;
        const animate = () => {
            frameId = requestAnimationFrame(animate);
            if (rendererRef.current && cameraRef.current) rendererRef.current.render(scene, cameraRef.current);
        };
        animate();

        return () => {
            ro.disconnect();
            cancelAnimationFrame(frameId);
            geometry.dispose();
            material.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
            sceneRef.current = null;
            cameraRef.current = null;
            rendererRef.current = null;
            pointsRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!containerId) {
            setStatus("No container");
            return;
        }

        const base = getApiWsOrigin();
        const wsUrl = `${base}/api/containers/${containerId}/viz`;
        setStatus("Connecting…");
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => setStatus("Connected — waiting for positions");
        ws.onerror = () => setStatus("Connection error");
        ws.onclose = () => {
            wsRef.current = null;
            setStatus("Disconnected");
        };

        ws.onmessage = (event) => {
            const points = pointsRef.current;
            if (!points) return;
            try {
                const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
                const positions = data.positions ?? data.positionsFloat32;
                if (positions != null) {
                    const flat = positions instanceof Float32Array
                        ? positions
                        : new Float32Array(Array.isArray(positions) ? positions : positions);
                    const geom = points.geometry;
                    geom.setAttribute("position", new THREE.BufferAttribute(flat, 3));
                    geom.setDrawRange(0, flat.length / 3);
                    geom.attributes.position.needsUpdate = true;
                }
            } catch {
                // ignore
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

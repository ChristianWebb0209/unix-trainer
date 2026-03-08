/**
 * Render: Image — display a static pixel buffer from CUDA as a texture on a quad.
 * CUDA kernel outputs e.g. unsigned char pixels[width * height * 4];
 * Send to browser → Three.js DataTexture → MeshBasicMaterial → PlaneGeometry.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export type RenderImagePanelProps = {
    /** RGBA pixel data (width * height * 4). When set, updates the texture. */
    pixels?: Uint8Array | null;
    width?: number;
    height?: number;
    /** Called when the user clicks Refresh. */
    onRefresh?: () => void;
};

export function RenderImagePanel({ pixels = null, width = 1, height = 1, onRefresh }: RenderImagePanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const textureRef = useRef<THREE.DataTexture | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);

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
        meshRef.current = mesh;

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
            renderer.render(scene, camera);
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
            meshRef.current = null;
        };
    }, []);

    useEffect(() => {
        const texture = textureRef.current;
        if (!texture || !pixels || width < 1 || height < 1) return;
        texture.image.data = pixels;
        texture.image.width = width;
        texture.image.height = height;
        texture.needsUpdate = true;
    }, [pixels, width, height]);

    return (
        <div
            style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                position: "relative",
                backgroundColor: "#1a1a1a",
            }}
        >
            <button
                type="button"
                onClick={() => onRefresh?.()}
                style={{
                    position: "absolute",
                    top: "0.5rem",
                    right: "0.5rem",
                    zIndex: 10,
                    padding: "0.25rem 0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    background: "#252525",
                    color: "#ccc",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                }}
            >
                Refresh
            </button>
            <div
                ref={containerRef}
                style={{
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    height: "100%",
                    position: "absolute",
                    inset: 0,
                }}
            />
        </div>
    );
}

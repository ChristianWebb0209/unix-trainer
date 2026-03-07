/**
 * Base URL for API and WebSocket when talking to the backend.
 * In dev (Vite on 5173), we default to http://localhost:3000 so WebSockets
 * connect directly to the server and avoid "closed before connection established"
 * when the proxy doesn't upgrade WS. Override with VITE_API_ORIGIN if needed.
 */
const DEFAULT_DEV_API_ORIGIN = "http://localhost:3000";

export function getApiOrigin(): string {
    if (typeof window === "undefined") return DEFAULT_DEV_API_ORIGIN;
    const env = import.meta.env?.VITE_API_ORIGIN;
    if (typeof env === "string" && env.trim()) return env.trim().replace(/\/$/, "");
    if (import.meta.env?.DEV) return DEFAULT_DEV_API_ORIGIN;
    return window.location.origin;
}

/** Call once in dev to log the API base URL for troubleshooting connection issues. */
export function logApiOriginInDev(): void {
    if (import.meta.env?.DEV && typeof window !== "undefined") {
        const origin = getApiOrigin();
        console.log("[apiOrigin] Client will request API at:", origin);
    }
}

/** Full URL for an API path. Use this for all fetch() so in dev we hit the server on 3000, not Vite on 5173. */
export function apiUrl(path: string): string {
    const base = getApiOrigin();
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
}

/** WebSocket base URL (ws: or wss:) for the same host as the API. */
export function getApiWsOrigin(): string {
    const origin = getApiOrigin();
    return origin.replace(/^http/, "ws");
}

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

/** WebSocket base URL (ws: or wss:) for the same host as the API. */
export function getApiWsOrigin(): string {
    const origin = getApiOrigin();
    return origin.replace(/^http/, "ws");
}

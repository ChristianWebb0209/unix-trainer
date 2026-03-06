/**
 * WebSocket transport for @codemirror/lsp-client.
 * Connects to the backend LSP proxy (container stdio bridge).
 */
import type { Transport } from "@codemirror/lsp-client";

/**
 * Returns a Transport that sends/receives LSP JSON-RPC over WebSocket.
 * Resolves when the socket is open; rejects on error or after timeoutMs.
 */
export function simpleWebSocketTransport(
    uri: string,
    timeoutMs: number = 15_000
): Promise<Transport> {
    const handlers: ((value: string) => void)[] = [];
    const sock = new WebSocket(uri);

    return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            sock.close();
            reject(new Error("LSP WebSocket connection timeout"));
        }, timeoutMs);

        sock.onopen = () => {
            clearTimeout(t);
            resolve({
                send(message: string) {
                    if (sock.readyState === WebSocket.OPEN) sock.send(message);
                },
                subscribe(handler: (value: string) => void) {
                    handlers.push(handler);
                },
                unsubscribe(handler: (value: string) => void) {
                    const i = handlers.indexOf(handler);
                    if (i !== -1) handlers.splice(i, 1);
                },
            });
        };

        const dispatch = (text: string) => {
            for (const h of handlers) h(text);
        };

        sock.onmessage = (e) => {
            if (typeof e.data === "string") {
                dispatch(e.data);
            } else {
                (e.data as Blob).text().then(dispatch);
            }
        };

        sock.onerror = () => {
            clearTimeout(t);
            reject(new Error("LSP WebSocket error"));
        };

        sock.onclose = () => {
            clearTimeout(t);
        };
    });
}

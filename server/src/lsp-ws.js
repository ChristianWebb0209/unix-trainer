/**
 * WebSocket handler for LSP (Language Server Protocol) connections.
 * Bridges browser CodeMirror LSP client to container's LSP process via stdio.
 */
import { WebSocketServer } from "ws";

/**
 * @param {import('http').Server} httpServer
 * @param {import('./services/container.service.js').ContainerService} containerService
 */
export function setupLSPWebSocket(httpServer, containerService) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        const match = url.pathname.match(/^\/api\/containers\/([^/]+)\/lsp$/);
        if (!match) return;

        const containerId = match[1];
        const language = url.searchParams.get("language") || "bash";

        wss.handleUpgrade(request, socket, head, (ws) => {
            handleLSPConnection(ws, containerId, language, containerService);
        });
    });
}

async function handleLSPConnection(ws, containerId, language, containerService) {
    let lsp = null;

    const cleanup = () => {
        if (lsp) {
            lsp.destroy();
            lsp = null;
        }
    };

    try {
        lsp = await containerService.attachLSP(containerId, language);
    } catch (err) {
        console.error("[LSP WS] Failed to attach LSP:", err.message);
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: err.message }, id: null }));
            ws.close();
        }
        return;
    }

    lsp.stdout.on("data", (chunk) => {
        if (ws.readyState === 1) ws.send(chunk);
    });
    lsp.stdout.on("error", cleanup);
    lsp.stdin.on("error", cleanup);

    ws.on("message", (data) => {
        if (lsp && lsp.stdin && !lsp.stdin.destroyed) {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            lsp.stdin.write(buf);
        }
    });
    ws.on("close", cleanup);
    ws.on("error", cleanup);
}

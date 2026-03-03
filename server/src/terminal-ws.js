/**
 * WebSocket handler for interactive terminal (PTY) sessions.
 * Bridges browser xterm.js to Docker container's shell via PTY.
 */
import { WebSocketServer } from "ws";

/**
 * @param {import('http').Server} httpServer
 * @param {import('./services/container.service.js').ContainerService} containerService
 */
export function setupTerminalWebSocket(httpServer, containerService) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        const match = url.pathname.match(/^\/api\/containers\/([^/]+)\/terminal$/);
        if (!match) {
            socket.destroy();
            return;
        }

        const containerId = match[1];

        wss.handleUpgrade(request, socket, head, (ws) => {
            handleTerminalConnection(ws, containerId, containerService);
        });
    });
}

async function handleTerminalConnection(ws, containerId, containerService) {
        let ptyStream = null;

        const cleanup = () => {
            if (ptyStream) {
                ptyStream.destroy();
                ptyStream = null;
            }
        };

        try {
            ptyStream = await containerService.attachPTY(containerId);

            ptyStream.on("data", (chunk) => {
                containerService.recordActivity(containerId);
                if (ws.readyState === 1) {
                    ws.send(chunk);
                }
            });

            ptyStream.on("error", (err) => {
                console.error("[TerminalWS] PTY error:", err);
                if (ws.readyState === 1) {
                    ws.send(`\r\nError: ${err.message}\r\n`);
                }
            });

            ptyStream.on("end", () => {
                if (ws.readyState === 1) {
                    ws.close();
                }
            });

            ws.on("message", (data) => {
                containerService.recordActivity(containerId);
                if (ptyStream && !ptyStream.destroyed) {
                    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                    ptyStream.write(buf);
                }
            });

            ws.on("close", () => {
                cleanup();
            });

            ws.on("error", () => {
                cleanup();
            });
        } catch (err) {
            console.error("[TerminalWS] Failed to attach PTY:", err);
            ws.send(JSON.stringify({ error: err.message }));
            ws.close();
        }
}

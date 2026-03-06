/**
 * WebSocket handler for LSP (Language Server Protocol) connections.
 * Bridges browser CodeMirror LSP client to container's LSP process via stdio.
 *
 * LSP over stdio uses framing: "Content-Length: N\r\n\r\n" + N bytes of JSON.
 * We must buffer LSP stdout and only forward complete messages; otherwise the
 * client gets partial chunks and never sees a valid response (causing timeouts).
 */
import { WebSocketServer } from "ws";
import { lspLog, lspError } from "../utils/lsp-log.js";

/** Parse LSP stdio framing and call onMessage(fullMessageString) for each complete message. */
function createLspStdoutBuffer(onMessage) {
    let buffer = Buffer.alloc(0);
    return {
        push(chunk) {
            buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
            while (buffer.length > 0) {
                const idx = buffer.indexOf("\r\n\r\n");
                if (idx === -1) break;
                const header = buffer.subarray(0, idx).toString("ascii");
                const match = header.match(/Content-Length:\s*(\d+)/i);
                if (!match) break;
                const contentLength = parseInt(match[1], 10);
                const headerLength = idx + 4;
                const totalLength = headerLength + contentLength;
                if (buffer.length < totalLength) break;
                const body = buffer.subarray(headerLength, totalLength).toString("utf8");
                buffer = buffer.subarray(totalLength);
                onMessage(body);
            }
        },
    };
}

/** Ensure data written to LSP stdin is framed with Content-Length (LSP stdio format). */
function toLspFramed(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const str = buf.toString("utf8");
    if (/^Content-Length:\s*\d+/i.test(str)) return buf;
    const header = `Content-Length: ${Buffer.byteLength(buf, "utf8")}\r\n\r\n`;
    return Buffer.concat([Buffer.from(header, "ascii"), buf]);
}

/**
 * @param {import('http').Server} httpServer
 * @param {import('./container.service.js').ContainerService} containerService
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
        lspError(`Failed to attach: ${err.message}`);
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: err.message }, id: null }));
            ws.close();
        }
        return;
    }

    lspLog(`connected container=${containerId.slice(0, 12)}… language=${language}`);

    let firstResponse = true;
    const stdoutBuffer = createLspStdoutBuffer((message) => {
        if (firstResponse) {
            firstResponse = false;
            lspLog("ready (first response from language server)");
        }
        if (ws.readyState === 1) ws.send(message);
    });
    lsp.stdout.on("data", (chunk) => stdoutBuffer.push(chunk));
    lsp.stdout.on("error", cleanup);
    lsp.stdin.on("error", cleanup);

    ws.on("message", (data) => {
        if (lsp && lsp.stdin && !lsp.stdin.destroyed) {
            lsp.stdin.write(toLspFramed(data));
        }
    });
    ws.on("close", () => {
        lspLog("closed");
        cleanup();
    });
    ws.on("error", cleanup);
}

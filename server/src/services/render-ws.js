/**
 * WebSocket handler for the Render panel.
 *
 * Bridges the container's frame streamer to the browser:
 *
 *   CUDA kernel → tt_render_frame() → /tmp/render/frame.bin
 *     → frame-streamer.js (in container, stdout, length-prefixed)
 *       → docker exec stream (this file)
 *         → WebSocket binary message
 *           → Three.js DataTexture
 *
 * Frames are forwarded as raw binary. A 800x600 frame is 1.9MB of RGBA; encoding
 * that as a JSON array would be roughly 8MB of text per frame, which makes
 * animation impossible. The browser parses the same header tt_render.h writes.
 */
import { WebSocketServer } from "ws";
import { containerError, containerLog, shortId } from "../utils/container-log.js";

/** Matches the magic in tt_render.h and frame-streamer.js. */
const FRAME_MAGIC = 0x31465454;
const LENGTH_PREFIX_BYTES = 4;
/** Refuse absurd payloads rather than buffering them. 4096x4096 RGBA + header. */
const MAX_FRAME_BYTES = 4096 * 4096 * 4 + 16;

/**
 * @param {import('http').Server} httpServer
 * @param {import('./container.service.js').ContainerService} containerService
 */
export function setupRenderWebSocket(httpServer, containerService) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        const match = url.pathname.match(/^\/api\/containers\/([^/]+)\/frames$/);
        if (!match) return;

        const containerId = match[1];
        wss.handleUpgrade(request, socket, head, (ws) => {
            handleRenderConnection(ws, containerId, containerService);
        });
    });
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} containerId
 * @param {import('./container.service.js').ContainerService} containerService
 */
async function handleRenderConnection(ws, containerId, containerService) {
    /** @type {{ stdout: import('stream').Readable, destroy: () => void } | null} */
    let streamer = null;

    const cleanup = () => {
        if (streamer) {
            streamer.destroy();
            streamer = null;
        }
    };

    try {
        streamer = await containerService.attachFrameStreamer(containerId);
        containerLog(`[frames] Streaming from ${shortId(containerId)}`);

        // stdout arrives in arbitrary chunks, so reassemble the length-prefixed
        // frames the streamer wrote before forwarding each complete one.
        let buffered = Buffer.alloc(0);

        streamer.stdout.on("data", (chunk) => {
            buffered = buffered.length === 0 ? Buffer.from(chunk) : Buffer.concat([buffered, chunk]);

            for (;;) {
                if (buffered.length < LENGTH_PREFIX_BYTES) return;

                const payloadLength = buffered.readUInt32LE(0);
                if (payloadLength > MAX_FRAME_BYTES) {
                    containerError(`[frames] Payload of ${payloadLength}B exceeds cap; dropping stream`);
                    buffered = Buffer.alloc(0);
                    cleanup();
                    if (ws.readyState === 1) ws.close();
                    return;
                }

                const total = LENGTH_PREFIX_BYTES + payloadLength;
                if (buffered.length < total) return; // wait for the rest

                const payload = buffered.subarray(LENGTH_PREFIX_BYTES, total);
                buffered = buffered.subarray(total);

                if (payload.readUInt32LE(0) === FRAME_MAGIC) {
                    containerService.recordActivity(containerId);
                    if (ws.readyState === 1) ws.send(payload, { binary: true });
                }
            }
        });

        streamer.stdout.on("error", (err) => {
            containerError(`[frames] Stream error: ${err.message}`);
            if (ws.readyState === 1) ws.close();
        });

        streamer.stdout.on("end", () => {
            if (ws.readyState === 1) ws.close();
        });

        ws.on("close", cleanup);
        ws.on("error", cleanup);
    } catch (err) {
        containerError(`[frames] Failed to attach streamer: ${err?.message ?? err}`);
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ error: err?.message ?? "Failed to attach frame streamer" }));
            ws.close();
        }
        cleanup();
    }
}

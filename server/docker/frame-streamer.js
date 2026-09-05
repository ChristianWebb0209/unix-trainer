#!/usr/bin/env node
/**
 * Frame streamer: watches /tmp/render/frame.bin and emits each new frame on stdout.
 *
 * Run inside the container: node /workspace/frame-streamer.js [pollIntervalMs]
 * The host runs this via `docker exec` and bridges stdout to a WebSocket.
 *
 * Frame file layout (little-endian), written by tt_render.h:
 *     u32 magic ('TTF1')  u32 seq  u32 width  u32 height  rgba[width*height*4]
 *
 * stdout framing: u32 payloadLength, then that many bytes (the whole file above).
 * A length prefix is required because docker exec's stdout arrives in arbitrary chunks.
 *
 * Polling rather than inotify is deliberate: the producer may render far faster than
 * the browser can display, and polling naturally drops stale frames instead of
 * queueing them. Only the newest frame is ever shipped.
 */
const fs = require("fs");

const FRAME_PATH = "/tmp/render/frame.bin";
const MAGIC = 0x31465454;
const HEADER_BYTES = 16;
const MAX_DIM = 8192;

const pollIntervalMs = Math.max(10, Number(process.argv[2]) || 50);

const header = Buffer.alloc(HEADER_BYTES);
let lastSeq = -1;

function tick() {
  let fd;
  try {
    fd = fs.openSync(FRAME_PATH, "r");
  } catch {
    return; // no frame published yet
  }

  try {
    if (fs.readSync(fd, header, 0, HEADER_BYTES, 0) < HEADER_BYTES) return;
    if (header.readUInt32LE(0) !== MAGIC) return;

    const seq = header.readUInt32LE(4);
    if (seq === lastSeq) return;

    const width = header.readUInt32LE(8);
    const height = header.readUInt32LE(12);
    if (width < 1 || height < 1 || width > MAX_DIM || height > MAX_DIM) return;

    const total = HEADER_BYTES + width * height * 4;
    const payload = Buffer.allocUnsafe(total);
    if (fs.readSync(fd, payload, 0, total, 0) < total) return; // retry next tick

    lastSeq = seq;

    const prefix = Buffer.allocUnsafe(4);
    prefix.writeUInt32LE(total, 0);
    process.stdout.write(prefix);
    process.stdout.write(payload);
  } catch {
    // transient read error; try again on the next tick
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
  }
}

const timer = setInterval(tick, pollIntervalMs);

// Exit when the host closes the exec stream.
process.stdin.resume();
process.stdin.on("end", () => {
  clearInterval(timer);
  process.exit(0);
});
process.stdout.on("error", () => {
  clearInterval(timer);
  process.exit(0);
});

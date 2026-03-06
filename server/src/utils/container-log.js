/**
 * Color-coded ContainerService logging.
 * Uses ANSI escape codes (supported on Windows 10+ and Unix).
 */
const RESET = "\x1b[0m";
const BASE = "\x1b[34m";   // blue – general [ContainerService]
const CREATE = "\x1b[32m"; // green – creating, created, reusing, image built
const DESTROY = "\x1b[35m"; // magenta – stopped, destroyed, cleaning up
const RED = "\x1b[31m";

export function shortId(id) {
    if (id == null || typeof id !== "string") return "???";
    return id.length <= 10 ? id : id.slice(0, 10) + "...";
}

export function containerLog(msg) {
    console.log(`${BASE}[ContainerService]${RESET} ${msg}`);
}

export function containerLogCreate(msg) {
    console.log(`${CREATE}[ContainerService]${RESET} ${msg}`);
}

export function containerLogDestroy(msg) {
    console.log(`${DESTROY}[ContainerService]${RESET} ${msg}`);
}

export function containerError(msg) {
    console.error(`${RED}[ContainerService]${RESET} ${msg}`);
}

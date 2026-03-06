/**
 * Color-coded [Docker] logging for daemon health / startup.
 * Uses ANSI escape codes (supported on Windows 10+ and Unix).
 */
const RESET = "\x1b[0m";
const DOCKER = "\x1b[33m"; // yellow
const RED = "\x1b[31m";

export function dockerLog(msg) {
    console.log(`${DOCKER}[Docker]${RESET} ${msg}`);
}

export function dockerWarn(msg) {
    console.warn(`${DOCKER}[Docker]${RESET} ${msg}`);
}

export function dockerError(msg) {
    console.error(`${RED}[Docker]${RESET} ${msg}`);
}

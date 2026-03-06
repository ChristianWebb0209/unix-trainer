/**
 * Color-coded LSP logging for the terminal.
 * Uses ANSI escape codes (supported on Windows 10+ and Unix).
 */
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

export function lspLog(msg) {
    console.log(`${CYAN}[LSP]${RESET} ${msg}`);
}

export function lspError(msg) {
    console.error(`${RED}[LSP]${RESET} ${msg}`);
}

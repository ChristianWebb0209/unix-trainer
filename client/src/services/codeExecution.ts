/**
 * Code Execution Service
 * ----------------------
 * Interprets editor content by language and produces shell commands
 * to run in the terminal. Designed for dynamic language support.
 */

export type SupportedLanguage = "unix" | "awk" | "bash" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl";

// Shared problem configuration (ESM module at repo root)
import * as problemConfig from "problem-config";

const SUPPORTED: SupportedLanguage[] = problemConfig.PROBLEM_LANGUAGE_IDS.filter(
  (id): id is SupportedLanguage => id !== "any"
);

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED.includes(lang as SupportedLanguage);
}

export function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Builds the shell command string to inject into the terminal for running the given code.
 * The command writes code to a temp file and executes it with the appropriate interpreter.
 */
export function buildRunCommand(language: SupportedLanguage, code: string): string {
  const encoded = toBase64(code);
  const escaped = encoded.replace(/'/g, "'\"'\"'");

  switch (language) {
    case "bash":
      return `echo '${escaped}' | base64 -d > /tmp/run.sh && bash /tmp/run.sh`;
    case "awk":
      return `echo '${escaped}' | base64 -d > /tmp/run.awk && awk -f /tmp/run.awk`;
    case "unix":
      return `echo '${escaped}' | base64 -d > /tmp/run.sh && sh /tmp/run.sh`;
    case "cuda":
      return `echo '${escaped}' | base64 -d > /tmp/main.cu && nvcc /tmp/main.cu -o /tmp/a.out && /tmp/a.out`;
    case "vulkan":
      return `echo '${escaped}' | base64 -d > /tmp/main.cpp && g++ -std=c++17 -o /tmp/a.out /tmp/main.cpp -lvulkan && /tmp/a.out`;
    case "sycl":
      return `echo '${escaped}' | base64 -d > /tmp/main.cpp && dpcpp -o /tmp/a.out /tmp/main.cpp && /tmp/a.out`;
    case "c":
      return `echo '${escaped}' | base64 -d > /tmp/main.c && gcc -o /tmp/a.out /tmp/main.c && /tmp/a.out`;
    case "cpp":
      return `echo '${escaped}' | base64 -d > /tmp/main.cpp && g++ -std=c++17 -o /tmp/a.out /tmp/main.cpp && /tmp/a.out`;
    case "rust":
      return `echo '${escaped}' | base64 -d > /tmp/main.rs && rustc -o /tmp/a.out /tmp/main.rs && /tmp/a.out`;
    default:
      return `echo '${escaped}' | base64 -d > /tmp/run.sh && sh /tmp/run.sh`;
  }
}

export type TerminalRunPayload = {
  /** If set, run this via /exec first (e.g. write script to /tmp) so the terminal only shows the run command. */
  prepareCommand: string | null;
  /** String to send to the terminal (e.g. command + \\r\\n). */
  payload: string;
};

/**
 * Returns what to run in the terminal for the given language and code.
 * prepareCommand writes the script via /exec so the server is hit immediately and
 * the terminal only shows the run command. If the WebSocket isn't open yet, the
 * pending payload is sent when it connects.
 */
export function getTerminalRunPayload(language: SupportedLanguage, code: string): TerminalRunPayload {
  const encoded = toBase64(code);
  const escaped = encoded.replace(/'/g, "'\"'\"'");

  switch (language) {
    case "awk":
      return {
        prepareCommand: `echo '${escaped}' | base64 -d > /tmp/run.awk`,
        payload: "printf '\\n' | awk -f /tmp/run.awk\r\n",
      };
    case "bash":
      return {
        prepareCommand: `echo '${escaped}' | base64 -d > /tmp/run.sh`,
        payload: "bash /tmp/run.sh\r\n",
      };
    case "unix":
      return {
        prepareCommand: `echo '${escaped}' | base64 -d > /tmp/run.sh`,
        payload: "sh /tmp/run.sh\r\n",
      };
    default:
      return {
        prepareCommand: null,
        payload: buildRunCommand(language, code) + "\r\n",
      };
  }
}

export const TERMINAL_LANGUAGES: { id: SupportedLanguage; name: string }[] = SUPPORTED
  // GPU languages (cuda, vulkan, sycl) use the GPU workspace dropdown only.
  .filter((id) => id !== "cuda" && id !== "vulkan" && id !== "sycl")
  .map((id) => ({
    id,
    name: problemConfig.PROBLEM_LANGUAGES[id].label || id,
  }));

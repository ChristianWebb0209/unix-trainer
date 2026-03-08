/**
 * Code Execution Service
 * ----------------------
 * Interprets editor content by language and produces shell commands
 * to run in the terminal. Uses problem-config as single source of truth.
 */

import type { ProblemLanguage } from "../api/problems";
import * as problemConfig from "problem-config";

/** Languages that can run in the terminal; derived from problem-config (all except "any"). */
export type SupportedLanguage = ProblemLanguage;

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
    case "cuda":
      return `echo '${escaped}' | base64 -d > /tmp/main.cu && nvcc /tmp/main.cu -o /tmp/a.out && /tmp/a.out`;
    case "sycl":
      return `echo '${escaped}' | base64 -d > /tmp/main.cpp && dpcpp -o /tmp/a.out /tmp/main.cpp && /tmp/a.out`;
    case "c":
      return `echo '${escaped}' | base64 -d > /tmp/main.c && gcc -o /tmp/a.out /tmp/main.c && /tmp/a.out`;
    case "cpp":
      return `echo '${escaped}' | base64 -d > /tmp/main.cpp && g++ -std=c++17 -o /tmp/a.out /tmp/main.cpp && /tmp/a.out`;
    case "rust":
      return `echo '${escaped}' | base64 -d > /tmp/main.rs && rustc -o /tmp/a.out /tmp/main.rs && /tmp/a.out`;
    case "python":
    case "triton":
    case "pytorch":
      return `echo '${escaped}' | base64 -d > /tmp/main.py && python3 /tmp/main.py`;
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
  return {
    prepareCommand: null,
    payload: buildRunCommand(language, code) + "\r\n",
  };
}

/** Kernel Lab languages shown in the terminal language dropdown (excludes cuda/sycl which use workspace selector). */
export const TERMINAL_LANGUAGES: { id: SupportedLanguage; name: string }[] = SUPPORTED
  .filter((id) => id !== "cuda" && id !== "sycl")
  .map((id) => ({
    id,
    name: problemConfig.PROBLEM_LANGUAGES[id].label || id,
  }));

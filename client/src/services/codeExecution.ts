/**
 * Code Execution Service
 * ----------------------
 * Interprets editor content by language and produces shell commands
 * to run in the terminal. Designed for dynamic language support.
 */

export type SupportedLanguage = "unix" | "awk" | "bash";

const SUPPORTED: SupportedLanguage[] = ["unix", "awk", "bash"];

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED.includes(lang as SupportedLanguage);
}

function toBase64(str: string): string {
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
  // base64 is A-Za-z0-9+/= so no single quotes; keep as-is for sh
  const escaped = encoded.replace(/'/g, "'\"'\"'");

  switch (language) {
    case "bash":
      return `echo '${escaped}' | base64 -d > /tmp/run.sh && bash /tmp/run.sh`;
    case "awk":
      return `echo '${escaped}' | base64 -d > /tmp/run.awk && awk -f /tmp/run.awk < /dev/null`;
    case "unix":
      return `echo '${escaped}' | base64 -d > /tmp/run.sh && sh /tmp/run.sh`;
    default:
      return `echo '${escaped}' | base64 -d > /tmp/run.sh && sh /tmp/run.sh`;
  }
}

export const TERMINAL_LANGUAGES: { id: SupportedLanguage; name: string }[] = [
  { id: "unix", name: "Unix Shell" },
  { id: "awk", name: "AWK" },
  { id: "bash", name: "Bash" },
];

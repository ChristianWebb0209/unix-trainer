/**
 * Shared problem/workspace/language configuration (ES module).
 * Plain JavaScript only – all typing lives in the .d.ts file
 * that the TypeScript side consumes.
 */

export const DIFFICULTIES = ["learn", "easy", "medium", "hard"];

export const DIFFICULTY_ORDER = {
  learn: 0,
  easy: 1,
  medium: 2,
  hard: 3,
};

export const PROBLEM_LANGUAGES = {
  bash: { id: "bash", label: "Bash", workspace: "unix" },
  awk: { id: "awk", label: "Awk", workspace: "unix" },
  unix: { id: "unix", label: "Unix Shell", workspace: "unix" },
  cuda: { id: "cuda", label: "CUDA", workspace: "cuda" },
  any: { id: "any", label: "Any Shell", workspace: null },
};

export const PROBLEM_LANGUAGE_IDS = Object.keys(PROBLEM_LANGUAGES);

export const WORKSPACES = {
  unix: {
    id: "unix",
    label: "Unix / Shell",
    defaultProblemLanguage: "bash",
    problemLanguages: ["bash", "awk", "unix", "any"],
    dockerImageName: "unix-workspace:latest",
    dockerfileName: "Dockerfile.unix",
    kind: "shell",
    allowLanguageSwitch: true,
    showWebGpuTab: false,
    codeThemeKey: "shell-dark",
  },
  cuda: {
    id: "cuda",
    label: "GPU Programming",
    defaultProblemLanguage: "cuda",
    problemLanguages: ["cuda"],
    dockerImageName: "cuda-workspace:latest",
    dockerfileName: "Dockerfile.cuda",
    kind: "gpu",
    allowLanguageSwitch: false,
    showWebGpuTab: true,
    codeThemeKey: "cuda-dark",
  },
};

export const WORKSPACE_IDS = Object.keys(WORKSPACES);

export const DEFAULT_WORKSPACE = "unix";

/**
 * Editor theme specs keyed by codeThemeKey.
 * Use null for "use built-in oneDark". Otherwise the client builds a CodeMirror theme from this data.
 */
export const CODE_EDITOR_THEME_SPECS = {
  "shell-dark": null,
  "cuda-dark": {
    dark: true,
    backgroundColor: "#020617",
    color: "#e2e8f0",
    gutterBackgroundColor: "#020617",
    gutterColor: "#64748b",
    gutterBorder: "none",
    fontFamily:
      "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
};

/** Default editor content when no problem is selected, keyed by language id. */
export const DEFAULT_STARTER_CODE = {
  bash: '# Write your bash code here\necho "Hello from CodeMirror!"',
  awk: '# Write your awk code here\n# Paste/type input in the terminal, then press Ctrl-D (EOF)\nBEGIN { print "AWK ready. Provide input to process." }\n{ print $2 }',
  unix: '# Write your unix command here\necho "Hello, World!"',
  cuda: `// Simple host-only CUDA program compiled with nvcc
#include <cstdio>

int main() {
    printf("Hello from CUDA host code!\\n");
    return 0;
}
`,
};

export function getDefaultStarterCode(langId) {
  return DEFAULT_STARTER_CODE[langId] ?? DEFAULT_STARTER_CODE.bash;
}

/**
 * Builds the shell command used to run user code with test input (for validation).
 * Caller must pass base64-encoded code and input; encoding is done by client/server.
 * Used by both client (Editor validation) and server (container exec).
 *
 * @param {string} languageId - One of PROBLEM_LANGUAGE_IDS (bash, awk, unix, cuda, any).
 * @param {string} codeBase64 - Base64-encoded user code.
 * @param {string} inputBase64 - Base64-encoded test input (stdin or file depending on language).
 * @returns {string} Shell command to run in the container.
 */
export function getValidationCommand(languageId, codeBase64, inputBase64) {
  const code = codeBase64;
  const input = inputBase64;
  switch (languageId) {
    case "awk":
      return `echo ${code} | base64 -d > /tmp/exec.awk && echo ${input} | base64 -d > /tmp/exec_input.txt && awk -f /tmp/exec.awk /tmp/exec_input.txt`;
    case "bash":
      return `echo ${code} | base64 -d > /tmp/exec.sh && echo ${input} | base64 -d | /bin/bash /tmp/exec.sh`;
    case "unix":
    case "any":
      return `echo ${code} | base64 -d > /tmp/exec.sh && echo ${input} | base64 -d | /bin/sh /tmp/exec.sh`;
    case "cuda":
      return `echo ${code} | base64 -d > /tmp/main.cu && nvcc /tmp/main.cu -o /tmp/a.out && echo ${input} | base64 -d | /tmp/a.out`;
    default:
      return `echo ${code} | base64 -d > /tmp/exec.sh && echo ${input} | base64 -d | /bin/sh /tmp/exec.sh`;
  }
}

// ---------- Helper query functions ----------

export function getWorkspaceIds() {
  return WORKSPACE_IDS.slice();
}

export function getWorkspace(id) {
  return WORKSPACES[id] || null;
}

export function getLanguagesForWorkspace(id) {
  const ws = getWorkspace(id);
  return ws ? ws.problemLanguages.slice() : [];
}

export function getAllProblemLanguageIds() {
  return PROBLEM_LANGUAGE_IDS.slice();
}

export function getWorkspacesForLanguage(langId) {
  return WORKSPACE_IDS.filter((id) => {
    const ws = WORKSPACES[id];
    return ws && ws.problemLanguages.includes(langId);
  });
}


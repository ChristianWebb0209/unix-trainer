/**
 * Shared problem/workspace/language configuration (ES module).
 * Single source of truth for runtime values. Types are provided via JSDoc so the
 * client gets full type inference from this file without a separate .d.ts.
 * @module problem-config
 */

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

/** @type {readonly ["learn", "easy", "medium", "hard"]} */
export const DIFFICULTIES = ["learn", "easy", "medium", "hard"];

/** @type {Record<"learn"|"easy"|"medium"|"hard", number>} */
export const DIFFICULTY_ORDER = {
  learn: 0,
  easy: 1,
  medium: 2,
  hard: 3,
};

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

/** @typedef {"c"|"cpp"|"rust"|"cuda"|"sycl"|"python"|"triton"|"pytorch"|"any"} ProblemLanguageId */
/** @typedef {{ id: ProblemLanguageId; label: string; workspace: "kernel"|"tensor"|null; docs: string|null; exportExtension: string }} ProblemLanguageInfo */

/** @type {Record<ProblemLanguageId, ProblemLanguageInfo>} */
export const PROBLEM_LANGUAGES = {
  c: { id: "c", label: "C", workspace: "kernel", docs: "https://en.cppreference.com/w/c", exportExtension: ".c" },
  cpp: { id: "cpp", label: "C++", workspace: "kernel", docs: "https://en.cppreference.com/w/cpp", exportExtension: ".cpp" },
  rust: { id: "rust", label: "Rust", workspace: "kernel", docs: "https://doc.rust-lang.org/std/", exportExtension: ".rs" },
  cuda: { id: "cuda", label: "CUDA", workspace: "kernel", docs: "https://docs.nvidia.com/cuda/cuda-c-programming-guide/", exportExtension: ".cu" },
  sycl: { id: "sycl", label: "SYCL", workspace: "kernel", docs: "https://registry.khronos.org/SYCL/", exportExtension: ".cpp" },
  python: { id: "python", label: "Python", workspace: "tensor", docs: "https://docs.python.org/3/", exportExtension: ".py" },
  triton: { id: "triton", label: "Triton", workspace: "tensor", docs: "https://triton-lang.org/", exportExtension: ".py" },
  pytorch: { id: "pytorch", label: "PyTorch", workspace: "tensor", docs: "https://pytorch.org/docs/stable/index.html", exportExtension: ".py" },
  any: { id: "any", label: "Any", workspace: null, docs: null, exportExtension: ".txt" },
};

/** @type {ProblemLanguageId[]} */
export const PROBLEM_LANGUAGE_IDS = Object.keys(PROBLEM_LANGUAGES);

/** Language IDs that use C/C++ style syntax and indentation in the editor (c, cpp, rust, cuda, sycl). */
/** @type {readonly ["c", "cpp", "rust", "cuda", "sycl"]} */
export const C_LIKE_LANGUAGE_IDS = ["c", "cpp", "rust", "cuda", "sycl"];
/** Language IDs that use shell-style editing (none in the current GPU-focused labs). */
/** @type {readonly never[]} */
export const SHELL_LANGUAGE_IDS = [];

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

/** @typedef {"kernel"|"tensor"} WorkspaceId */
/** @typedef {{ id: WorkspaceId; label: string; defaultProblemLanguage: ProblemLanguageId; problemLanguages: ProblemLanguageId[]; dockerImageName: string; dockerfileName: string; kind: string; allowLanguageSwitch: boolean; showWebGpuTab: boolean; showImagePanel: boolean; codeThemeKey: string; terminalThemeKey: string }} SharedWorkspace */

/** Terminal theme keys (subtle dark variants per workspace). */
export const TERMINAL_THEME_KEYS = /** @type {const} */ (["kernel-dark", "tensor-dark"]);

/** xterm.js theme objects: dark, subtle, terminal aesthetic. background/foreground/cursor only. */
export const TERMINAL_THEMES = /** @type {Record<typeof TERMINAL_THEME_KEYS[number], { background: string; foreground: string; cursor: string; cursorAccent?: string }>} */ ({
  "kernel-dark": {
    background: "#1a1b1e",
    foreground: "#e4e6eb",
    cursor: "#5c6370",
    cursorAccent: "#1a1b1e",
  },
  "tensor-dark": {
    background: "#1c1a1d",
    foreground: "#e6e4eb",
    cursor: "#6b5c70",
    cursorAccent: "#1c1a1d",
  },
});

/**
 * @param {string} terminalThemeKey
 * @returns {typeof TERMINAL_THEMES[keyof typeof TERMINAL_THEMES]}
 */
export function getTerminalTheme(terminalThemeKey) {
  return TERMINAL_THEMES[terminalThemeKey] ?? TERMINAL_THEMES["kernel-dark"];
}

/** @type {Record<WorkspaceId, SharedWorkspace>} */
export const WORKSPACES = {
  kernel: {
    id: "kernel",
    label: "Kernel Lab",
    defaultProblemLanguage: "cuda",
    problemLanguages: ["c", "cpp", "rust", "cuda", "sycl"],
    dockerImageName: "kernel-workspace:latest",
    dockerfileName: "Dockerfile.kernel",
    kind: "kernel",
    allowLanguageSwitch: true,
    showWebGpuTab: true,
    showImagePanel: false,
    codeThemeKey: "kernel-dark",
    terminalThemeKey: "kernel-dark",
  },
  tensor: {
    id: "tensor",
    label: "Tensor Lab",
    defaultProblemLanguage: "python",
    problemLanguages: ["python", "triton", "pytorch"],
    dockerImageName: "tensor-workspace:latest",
    dockerfileName: "Dockerfile.tensor",
    kind: "tensor",
    allowLanguageSwitch: true,
    showWebGpuTab: false,
    showImagePanel: true,
    codeThemeKey: "tensor-dark",
    terminalThemeKey: "tensor-dark",
  },
};

/** @type {WorkspaceId[]} */
export const WORKSPACE_IDS = Object.keys(WORKSPACES);

/** @type {WorkspaceId} */
export const DEFAULT_WORKSPACE = "kernel";

/**
 * Editor theme specs keyed by codeThemeKey.
 * Two distinct, widely-used schemes: One Dark (systems) and Dracula (GPU).
 * @typedef {{ dark: boolean; backgroundColor: string; color: string; gutterBackgroundColor: string; gutterColor: string; gutterBorder: string; fontFamily: string; commentColor?: string }} ThemeSpec
 */
const MONO_FONT =
  "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

/** One Dark (Atom/VS Code) – warm charcoal, high contrast. Comment: muted gray. */
const ONE_DARK = {
  dark: true,
  backgroundColor: "#282c34",
  color: "#abb2bf",
  gutterBackgroundColor: "#21252b",
  gutterColor: "#636d83",
  gutterBorder: "none",
  fontFamily: MONO_FONT,
  commentColor: "#5c6370",
};

/** Dracula – soft dark with purple/cyan accents. Comment: purple-tinted gray. */
const DRACULA = {
  dark: true,
  backgroundColor: "#282a36",
  color: "#f8f8f2",
  gutterBackgroundColor: "#21222c",
  gutterColor: "#6272a4",
  gutterBorder: "none",
  fontFamily: MONO_FONT,
  commentColor: "#6272a4",
};

/** @type {Record<string, ThemeSpec>} */
export const CODE_EDITOR_THEME_SPECS = {
  "kernel-dark": ONE_DARK,
  "tensor-dark": DRACULA,
};

/** Default editor content when no problem is selected, keyed by language id. @type {Partial<Record<ProblemLanguageId, string>>} */
export const DEFAULT_STARTER_CODE = {
  cuda: `// Simple host-only CUDA program compiled with nvcc
#include <cstdio>

int main() {
    printf("Hello from CUDA host code!\\n");
    return 0;
}
`,
  c: `// C: minimal program
#include <stdio.h>

int main(void) {
    printf("Hello from C!\\n");
    return 0;
}
`,
  cpp: `// C++: minimal program
#include <cstdio>

int main() {
    printf("Hello from C++!\\n");
    return 0;
}
`,
  rust: `// Rust: minimal program
fn main() {
    println!("Hello from Rust!");
}
`,
  sycl: `#include <sycl/sycl.hpp>
#include <cstdio>

int main() {
    printf("Hello from SYCL!\\n");
    return 0;
}
`,
  python: `# Python (GPU): minimal program
def main():
    print("Hello from Python on the GPU workspace!")


if __name__ == "__main__":
    main()
`,
  triton: `# Triton: minimal skeleton (Python + Triton)
import triton
import triton.language as tl


@triton.jit
def kernel(x_ptr, n: tl.constexpr):
    pid = tl.program_id(axis=0)
    if pid < n:
        tl.store(x_ptr + pid, pid)


def main():
    print("Hello from Triton! Implement your kernel and launch logic here.")


if __name__ == "__main__":
    main()
`,
  pytorch: `# PyTorch: minimal program
import torch


def main():
    x = torch.tensor([1.0, 2.0, 3.0])
    print("Tensor:", x)


if __name__ == "__main__":
    main()
`,
};

/**
 * @param {string} langId
 * @returns {string}
 */
export function getDefaultStarterCode(langId) {
  return DEFAULT_STARTER_CODE[langId] ?? DEFAULT_STARTER_CODE.cuda;
}

/**
 * @param {string} languageId
 * @param {string} codeBase64
 * @param {string} inputBase64
 * @returns {string}
 */
export function getValidationCommand(languageId, codeBase64, inputBase64) {
  const code = codeBase64;
  const input = inputBase64;
  switch (languageId) {
    case "cuda":
      return `echo ${code} | base64 -d > /tmp/main.cu && nvcc /tmp/main.cu -o /tmp/a.out && echo ${input} | base64 -d | /tmp/a.out`;
    case "python":
    case "triton":
    case "pytorch":
      return `echo ${code} | base64 -d > /tmp/main.py && echo ${input} | base64 -d | python3 /tmp/main.py`;
    case "c":
      return `echo ${code} | base64 -d > /tmp/main.c && gcc -o /tmp/a.out /tmp/main.c && echo ${input} | base64 -d | /tmp/a.out`;
    case "cpp":
      return `echo ${code} | base64 -d > /tmp/main.cpp && g++ -std=c++17 -o /tmp/a.out /tmp/main.cpp && echo ${input} | base64 -d | /tmp/a.out`;
    case "rust":
      return `echo ${code} | base64 -d > /tmp/main.rs && rustc -o /tmp/a.out /tmp/main.rs && echo ${input} | base64 -d | /tmp/a.out`;
    case "sycl":
      return `echo ${code} | base64 -d > /tmp/main.cpp && dpcpp -o /tmp/a.out /tmp/main.cpp && echo ${input} | base64 -d | /tmp/a.out`;
    default:
      return `echo ${code} | base64 -d > /tmp/exec.sh && echo ${input} | base64 -d | /bin/sh /tmp/exec.sh`;
  }
}

// ---------- Helper query functions ----------

/** @returns {WorkspaceId[]} */
export function getWorkspaceIds() {
  return WORKSPACE_IDS.slice();
}

/** @param {WorkspaceId} id @returns {SharedWorkspace|null} */
export function getWorkspace(id) {
  return WORKSPACES[id] || null;
}

/** @param {WorkspaceId} id @returns {ProblemLanguageId[]} */
export function getLanguagesForWorkspace(id) {
  const ws = getWorkspace(id);
  return ws ? ws.problemLanguages.slice() : [];
}

/** @returns {ProblemLanguageId[]} */
export function getAllProblemLanguageIds() {
  return PROBLEM_LANGUAGE_IDS.slice();
}

/** @param {ProblemLanguageId} langId @returns {WorkspaceId[]} */
export function getWorkspacesForLanguage(langId) {
  return WORKSPACE_IDS.filter((id) => {
    const ws = WORKSPACES[id];
    return ws && ws.problemLanguages.includes(langId);
  });
}


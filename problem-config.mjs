/**
 * Shared problem/workspace/language configuration (ES module).
 * This is the single source of truth for runtime values. TypeScript types
 * for this module live in client/src/types/problem-config.d.ts because
 * JS modules cannot export types; the .d.ts is the standard way to type a JS module.
 */

export const DIFFICULTIES = ["learn", "easy", "medium", "hard"];

export const DIFFICULTY_ORDER = {
  learn: 0,
  easy: 1,
  medium: 2,
  hard: 3,
};

export const PROBLEM_LANGUAGES = {
  bash: { id: "bash", label: "Bash", workspace: "systems", docs: "https://www.gnu.org/software/bash/manual/" },
  awk: { id: "awk", label: "Awk", workspace: "systems", docs: "https://www.gnu.org/software/gawk/manual/" },
  unix: { id: "unix", label: "Unix", workspace: "systems", docs: "https://pubs.opengroup.org/onlinepubs/9699919799/utilities/contents.html" },
  c: { id: "c", label: "C", workspace: "systems", docs: "https://en.cppreference.com/w/c" },
  cpp: { id: "cpp", label: "C++", workspace: "systems", docs: "https://en.cppreference.com/w/cpp" },
  rust: { id: "rust", label: "Rust", workspace: "systems", docs: "https://doc.rust-lang.org/std/" },
  cuda: { id: "cuda", label: "CUDA", workspace: "gpu", docs: "https://docs.nvidia.com/cuda/cuda-c-programming-guide/" },
  vulkan: { id: "vulkan", label: "Vulkan", workspace: "gpu", docs: "https://registry.khronos.org/vulkan/specs/1.3/html/" },
  sycl: { id: "sycl", label: "SYCL", workspace: "gpu", docs: "https://registry.intel.com/sycl/" },
  any: { id: "any", label: "Any", workspace: null, docs: null },
};

export const PROBLEM_LANGUAGE_IDS = Object.keys(PROBLEM_LANGUAGES);

/** Language IDs that use C/C++ style syntax and indentation in the editor (c, cpp, rust, cuda, vulkan, sycl). */
export const C_LIKE_LANGUAGE_IDS = ["c", "cpp", "rust", "cuda", "vulkan", "sycl"];
/** Language IDs that use shell-style editing (indent-only, no C++ grammar). */
export const SHELL_LANGUAGE_IDS = ["bash", "awk", "unix"];

export const WORKSPACES = {
  systems: {
    id: "systems",
    label: "Systems",
    defaultProblemLanguage: "bash",
    problemLanguages: ["bash", "awk", "unix", "c", "cpp", "rust", "any"],
    dockerImageName: "systems-workspace:latest",
    dockerfileName: "Dockerfile.systems",
    kind: "systems",
    allowLanguageSwitch: true,
    showWebGpuTab: false,
    codeThemeKey: "systems-dark",
  },
  gpu: {
    id: "gpu",
    label: "GPU Programming",
    defaultProblemLanguage: "cuda",
    problemLanguages: ["cuda", "vulkan", "sycl"],
    dockerImageName: "gpu-workspace:latest",
    dockerfileName: "Dockerfile.gpu",
    kind: "gpu",
    allowLanguageSwitch: true,
    showWebGpuTab: true,
    codeThemeKey: "cuda-dark",
  },
};

export const WORKSPACE_IDS = Object.keys(WORKSPACES);

export const DEFAULT_WORKSPACE = "systems";

/**
 * Editor theme specs keyed by codeThemeKey.
 * Two distinct, widely-used schemes: One Dark (systems) and Dracula (GPU).
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

export const CODE_EDITOR_THEME_SPECS = {
  "systems-dark": ONE_DARK,
  "cuda-dark": DRACULA,
  "vulkan-dark": DRACULA,
  "sycl-dark": DRACULA,
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
  vulkan: `// Vulkan: minimal C++ host program
#include <vulkan/vulkan.h>
#include <cstdio>

int main() {
    printf("Hello from Vulkan!\\n");
    return 0;
}
`,
  sycl: `// SYCL: minimal program
#include <sycl/sycl.hpp>
#include <cstdio>

int main() {
    printf("Hello from SYCL!\\n");
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
    case "vulkan":
      return `echo ${code} | base64 -d > /tmp/main.cpp && g++ -std=c++17 -o /tmp/a.out /tmp/main.cpp -lvulkan && echo ${input} | base64 -d | /tmp/a.out`;
    case "sycl":
      return `echo ${code} | base64 -d > /tmp/main.cpp && dpcpp -o /tmp/a.out /tmp/main.cpp && echo ${input} | base64 -d | /tmp/a.out`;
    case "c":
      return `echo ${code} | base64 -d > /tmp/main.c && gcc -o /tmp/a.out /tmp/main.c && echo ${input} | base64 -d | /tmp/a.out`;
    case "cpp":
      return `echo ${code} | base64 -d > /tmp/main.cpp && g++ -std=c++17 -o /tmp/a.out /tmp/main.cpp && echo ${input} | base64 -d | /tmp/a.out`;
    case "rust":
      return `echo ${code} | base64 -d > /tmp/main.rs && rustc -o /tmp/a.out /tmp/main.rs && echo ${input} | base64 -d | /tmp/a.out`;
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


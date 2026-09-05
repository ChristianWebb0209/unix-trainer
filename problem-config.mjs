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

/** @typedef {"kernel"} WorkspaceId */
/** @typedef {{ id: WorkspaceId; label: string; defaultProblemLanguage: ProblemLanguageId; problemLanguages: ProblemLanguageId[]; dockerImageName: string; dockerfileName: string; kind: string; allowLanguageSwitch: boolean; showRenderTab: boolean; codeThemeKey: string; terminalThemeKey: string }} SharedWorkspace */

/** Terminal theme keys (subtle dark variants per workspace). */
export const TERMINAL_THEME_KEYS = /** @type {const} */ (["kernel-dark"]);

/** xterm.js theme objects: dark, subtle, terminal aesthetic. background/foreground/cursor only. */
export const TERMINAL_THEMES = /** @type {Record<typeof TERMINAL_THEME_KEYS[number], { background: string; foreground: string; cursor: string; cursorAccent?: string }>} */ ({
  "kernel-dark": {
    background: "#1a1b1e",
    foreground: "#e4e6eb",
    cursor: "#5c6370",
    cursorAccent: "#1a1b1e",
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
    // Only languages the workspace image can actually compile. Rust and SYCL were
    // listed here previously but the image ships neither rustc nor dpcpp, so every
    // one of those problems failed at compile time.
    problemLanguages: ["cuda", "c", "cpp"],
    dockerImageName: "kernel-workspace:latest",
    dockerfileName: "Dockerfile.kernel",
    kind: "kernel",
    allowLanguageSwitch: true,
    showRenderTab: true,
    codeThemeKey: "kernel-dark",
    terminalThemeKey: "kernel-dark",
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
  // The playground opens on the full animated demo: press Run and it streams
  // straight to the Render tab. Every #define near the top is a knob.
  cuda: `// Animated Mandelbrot zoom — one GPU thread per pixel, streamed live to the Render tab.
#include <cstdio>
#include <cmath>
#include <cuda_runtime.h>
#include "tt_render.h"

// ----- knobs: change any of these, hit Run, watch the picture change -----
#define WIDTH        800
#define HEIGHT       600
#define MAX_ITER     400      // detail in the filaments (try 60, then 800)
#define FRAMES       400      // length of the zoom
#define ZOOM_RATE    1.02     // magnification per frame
#define COLOR_SCALE  0.10f    // how tightly the colour bands pack (try 0.35f)
#define COLOR_DRIFT  0.004f   // palette rotation per frame
#define CENTER_X    -0.743643887037151   // a seahorse, deep in the valley
#define CENTER_Y     0.131825904205330
// ------------------------------------------------------------------------

__global__ void mandelbrot(unsigned char *out, int w, int h,
                           double scale, int maxIter, float shift)
{
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x >= w || y >= h) return;          // guard the ragged edge of the grid

    // This thread owns exactly one pixel. Map it into the complex plane.
    double cr = CENTER_X + (x - w * 0.5) * scale;
    double ci = CENTER_Y + (y - h * 0.5) * scale;

    // z <- z^2 + c, until it escapes the disc of radius 16 or we run out of patience.
    double zr = 0.0, zi = 0.0;
    int i = 0;
    while (zr * zr + zi * zi <= 256.0 && i < maxIter) {
        double t = zr * zr - zi * zi + cr;
        zi = 2.0 * zr * zi + ci;
        zr = t;
        i++;
    }

    int idx = (y * w + x) * 4;
    if (i >= maxIter) {                    // never escaped: inside the set
        out[idx] = out[idx + 1] = out[idx + 2] = 0;
        out[idx + 3] = 255;
        return;
    }

    // Fractional escape count, so the colour bands are smooth instead of stepped.
    float logZn  = logf((float)(zr * zr + zi * zi)) * 0.5f;
    float smooth = (float)i + 1.0f - logf(logZn / logf(2.0f)) / logf(2.0f);

    // Cosine palette: three phase-shifted cosines, one per channel.
    float t = sqrtf(smooth) * COLOR_SCALE + shift;
    out[idx + 0] = (unsigned char)(255.0f * (0.55f + 0.45f * cosf(6.2831853f * (t + 0.85f))));
    out[idx + 1] = (unsigned char)(255.0f * (0.55f + 0.45f * cosf(6.2831853f * (t + 0.95f))));
    out[idx + 2] = (unsigned char)(255.0f * (0.55f + 0.45f * cosf(6.2831853f * (t + 0.15f))));
    out[idx + 3] = 255;
}

int main()
{
    const size_t bytes = (size_t)WIDTH * HEIGHT * 4;

    unsigned char *dPixels = nullptr;
    cudaError_t err = cudaMalloc(&dPixels, bytes);
    if (err != cudaSuccess) {
        printf("cudaMalloc failed: %s\\n", cudaGetErrorString(err));
        return 1;
    }
    unsigned char *hPixels = (unsigned char *)malloc(bytes);

    dim3 block(16, 16);                                     // 256 threads per block
    dim3 grid((WIDTH + block.x - 1) / block.x,              // enough blocks to cover
              (HEIGHT + block.y - 1) / block.y);            // every pixel

    double scale = 3.0 / WIDTH;
    for (int f = 0; f < FRAMES; f++) {
        mandelbrot<<<grid, block>>>(dPixels, WIDTH, HEIGHT, scale, MAX_ITER, f * COLOR_DRIFT);
        cudaMemcpy(hPixels, dPixels, bytes, cudaMemcpyDeviceToHost);
        tt_render_frame(hPixels, WIDTH, HEIGHT);            // publish to the Render tab
        scale /= ZOOM_RATE;
    }

    printf("rendered %d frames at %dx%d, final zoom %.0fx\\n",
           FRAMES, WIDTH, HEIGHT, pow((double)ZOOM_RATE, (double)FRAMES));

    cudaFree(dPixels);
    free(hPixels);
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
};

/**
 * @param {string} langId
 * @returns {string}
 */
export function getDefaultStarterCode(langId) {
  return DEFAULT_STARTER_CODE[langId] ?? DEFAULT_STARTER_CODE.cuda;
}

/**
 * CUDA target architecture. sm_61 is Pascal (GTX 10-series), which is what the
 * reference machine runs. Compiling for the exact architecture skips JIT at
 * launch; change this if you run on a different GPU generation.
 */
export const CUDA_ARCH = "sm_61";

/** Header search path so problems can write `#include "tt_render.h"`. */
export const WORKSPACE_INCLUDE = "-I/workspace";

/**
 * Per-language build recipe. Single source of truth: both the graded run
 * (getValidationCommand) and the interactive terminal run (getRunCommand) go
 * through this, so the two can never drift apart on flags like -I/workspace.
 * @type {Record<string, { file: string; compile: (src: string, out: string) => string }>}
 */
const LANGUAGE_BUILDS = {
  cuda: {
    file: "/tmp/main.cu",
    compile: (src, out) => `nvcc -arch=${CUDA_ARCH} ${WORKSPACE_INCLUDE} ${src} -o ${out}`,
  },
  c: {
    file: "/tmp/main.c",
    compile: (src, out) => `gcc ${WORKSPACE_INCLUDE} ${src} -o ${out}`,
  },
  cpp: {
    file: "/tmp/main.cpp",
    compile: (src, out) => `g++ -std=c++17 ${WORKSPACE_INCLUDE} ${src} -o ${out}`,
  },
};

const BINARY_PATH = "/tmp/a.out";

/**
 * Shell to write the base64-encoded source to disk and compile it.
 * @param {string} languageId
 * @param {string} codeBase64
 * @returns {{ prefix: string, binary: string } | null} null for unknown languages.
 */
function buildPrefix(languageId, codeBase64) {
  const build = LANGUAGE_BUILDS[languageId];
  if (!build) return null;
  return {
    prefix: `echo '${codeBase64}' | base64 -d > ${build.file} && ${build.compile(build.file, BINARY_PATH)}`,
    binary: BINARY_PATH,
  };
}

/**
 * Command used when grading: compile, then run with the test's stdin piped in.
 * @param {string} languageId
 * @param {string} codeBase64
 * @param {string} inputBase64
 * @returns {string}
 */
export function getValidationCommand(languageId, codeBase64, inputBase64) {
  const built = buildPrefix(languageId, codeBase64);
  if (!built) {
    return `echo '${codeBase64}' | base64 -d > /tmp/exec.sh && echo '${inputBase64}' | base64 -d | /bin/sh /tmp/exec.sh`;
  }
  return `${built.prefix} && echo '${inputBase64}' | base64 -d | ${built.binary}`;
}

/**
 * Command typed into the interactive terminal by Run. Same compile flags as
 * grading, but stdin stays attached to the PTY so programs can read input.
 * @param {string} languageId
 * @param {string} codeBase64
 * @returns {string}
 */
export function getRunCommand(languageId, codeBase64) {
  const built = buildPrefix(languageId, codeBase64);
  if (!built) {
    return `echo '${codeBase64}' | base64 -d > /tmp/run.sh && sh /tmp/run.sh`;
  }
  return `${built.prefix} && ${built.binary}`;
}

/**
 * Display priority for languages, taken from the order they are listed on their
 * workspace. Problem lists sort by difficulty, then by this, so the workspace's
 * headline language leads each difficulty band instead of losing an alphabetical
 * race ("c_learn_001" sorts before "cuda_learn_001").
 * @param {string} langId
 * @returns {number}
 */
export function getLanguageOrder(langId) {
  let best = 99;
  for (const wsId of WORKSPACE_IDS) {
    const idx = WORKSPACES[wsId].problemLanguages.indexOf(langId);
    if (idx >= 0 && idx < best) best = idx;
  }
  return best;
}

/**
 * Sort comparator shared by the server and the client so both agree on order.
 * @param {{difficulty: string, language: string, id: string}} a
 * @param {{difficulty: string, language: string, id: string}} b
 */
export function compareProblems(a, b) {
  const da = DIFFICULTY_ORDER[a.difficulty] ?? 99;
  const db = DIFFICULTY_ORDER[b.difficulty] ?? 99;
  if (da !== db) return da - db;
  const la = getLanguageOrder(a.language);
  const lb = getLanguageOrder(b.language);
  if (la !== lb) return la - lb;
  return String(a.id).localeCompare(String(b.id));
}

/** Every language reachable from some workspace (i.e. actually runnable). */
export function getAvailableLanguageIds() {
  const out = new Set();
  for (const wsId of WORKSPACE_IDS) {
    for (const lang of WORKSPACES[wsId].problemLanguages) out.add(lang);
  }
  return [...out];
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


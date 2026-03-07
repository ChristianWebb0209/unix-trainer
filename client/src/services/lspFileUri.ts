/**
 * Map editor language id to LSP file URI and LSP language id for the container workspace.
 */
const LSP_SUPPORTED = ["bash", "awk", "unix", "c", "cpp", "rust", "cuda", "sycl", "python", "triton", "pytorch"] as const;

const EXT_MAP: Record<string, string> = {
    bash: ".sh",
    awk: ".sh",
    unix: ".sh",
    c: ".c",
    cpp: ".cpp",
    rust: ".rs",
    cuda: ".cu",
    sycl: ".cpp",
    python: ".py",
    triton: ".py",
    pytorch: ".py",
};

const LSP_LANG_MAP: Record<string, string> = {
    bash: "shellscript",
    awk: "shellscript",
    unix: "shellscript",
    c: "c",
    cpp: "cpp",
    rust: "rust",
    cuda: "cuda",
    sycl: "cpp",
    python: "python",
    triton: "python",
    pytorch: "python",
};

export function isLspSupported(language: string): boolean {
    return (LSP_SUPPORTED as readonly string[]).includes(language.toLowerCase());
}

export function getLspFileUri(language: string): string {
    const ext = EXT_MAP[language.toLowerCase()] ?? ".sh";
    return `file:///workspace/main${ext}`;
}

export function getLspLanguageId(language: string): string {
    return LSP_LANG_MAP[language.toLowerCase()] ?? "shellscript";
}

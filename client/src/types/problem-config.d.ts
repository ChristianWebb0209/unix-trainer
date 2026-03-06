declare module "problem-config" {
  export const DIFFICULTIES: Array<"learn" | "easy" | "medium" | "hard">;
  export type Difficulty = (typeof DIFFICULTIES)[number];

  export const PROBLEM_LANGUAGE_IDS: Array<"bash" | "awk" | "unix" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl" | "any">;
  export type ProblemLanguage = (typeof PROBLEM_LANGUAGE_IDS)[number];
  export const C_LIKE_LANGUAGE_IDS: Array<"c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl">;
  export const SHELL_LANGUAGE_IDS: Array<"bash" | "awk" | "unix">;

  export interface SharedWorkspace {
    id: "systems" | "gpu";
    label: string;
    defaultProblemLanguage: "bash" | "awk" | "unix" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl";
    problemLanguages: Array<"bash" | "awk" | "unix" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl" | "any">;
    dockerImageName: string;
    dockerfileName: string;
    kind: string;
    allowLanguageSwitch: boolean;
    showWebGpuTab: boolean;
    codeThemeKey: string;
  }

  export const DIFFICULTY_ORDER: Record<"learn" | "easy" | "medium" | "hard", number>;
  export const WORKSPACES: Record<"systems" | "gpu", SharedWorkspace>;
  export const PROBLEM_LANGUAGES: Record<
    "bash" | "awk" | "unix" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl" | "any",
    { id: "bash" | "awk" | "unix" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl" | "any"; label: string; workspace: "systems" | "gpu" | null; docs: string | null }
  >;
  export const DEFAULT_WORKSPACE: string;
  export const CODE_EDITOR_THEME_SPECS: Record<
    string,
    {
      dark: boolean;
      backgroundColor: string;
      color: string;
      gutterBackgroundColor: string;
      gutterColor: string;
      gutterBorder: string;
      fontFamily: string;
      commentColor?: string;
    } | null
  >;
  export const DEFAULT_STARTER_CODE: Record<string, string>;
  export function getDefaultStarterCode(langId: string): string;
  export function getValidationCommand(
    languageId: string,
    codeBase64: string,
    inputBase64: string
  ): string;

  export function getWorkspaceIds(): Array<"systems" | "gpu">;
  export function getWorkspace(id: "systems" | "gpu"): SharedWorkspace | null;
  export function getLanguagesForWorkspace(
    id: "systems" | "gpu"
  ): Array<"bash" | "awk" | "unix" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl" | "any">;
  export function getAllProblemLanguageIds(): Array<"bash" | "awk" | "unix" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl" | "any">;
  export function getWorkspacesForLanguage(
    langId: "bash" | "awk" | "unix" | "c" | "cpp" | "rust" | "cuda" | "vulkan" | "sycl" | "any"
  ): Array<"systems" | "gpu">;
}


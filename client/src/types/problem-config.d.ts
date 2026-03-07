declare module "problem-config" {
  export const DIFFICULTIES: Array<"learn" | "easy" | "medium" | "hard">;
  export type Difficulty = (typeof DIFFICULTIES)[number];

  export const PROBLEM_LANGUAGE_IDS: Array<"c" | "cpp" | "rust" | "cuda" | "python" | "triton" | "pytorch" | "any">;
  export type ProblemLanguage = (typeof PROBLEM_LANGUAGE_IDS)[number];
  export const C_LIKE_LANGUAGE_IDS: Array<"c" | "cpp" | "rust" | "cuda">;
  export const SHELL_LANGUAGE_IDS: Array<never>;

  export interface SharedWorkspace {
    id: "kernel" | "tensor";
    label: string;
    defaultProblemLanguage: "c" | "cpp" | "rust" | "cuda" | "python" | "triton" | "pytorch";
    problemLanguages: Array<"c" | "cpp" | "rust" | "cuda" | "python" | "triton" | "pytorch" | "any">;
    dockerImageName: string;
    dockerfileName: string;
    kind: string;
    allowLanguageSwitch: boolean;
    showWebGpuTab: boolean;
    codeThemeKey: string;
  }

  export const DIFFICULTY_ORDER: Record<"learn" | "easy" | "medium" | "hard", number>;
  export const WORKSPACES: Record<"kernel" | "tensor", SharedWorkspace>;
  export const PROBLEM_LANGUAGES: Record<
    "c" | "cpp" | "rust" | "cuda" | "python" | "triton" | "pytorch" | "any",
    { id: "c" | "cpp" | "rust" | "cuda" | "python" | "triton" | "pytorch" | "any"; label: string; workspace: "kernel" | "tensor" | null; docs: string | null }
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

  export function getWorkspaceIds(): Array<"kernel" | "tensor">;
  export function getWorkspace(id: "kernel" | "tensor"): SharedWorkspace | null;
  export function getLanguagesForWorkspace(
    id: "kernel" | "tensor"
  ): Array<"c" | "cpp" | "rust" | "cuda" | "python" | "triton" | "pytorch" | "any">;
  export function getAllProblemLanguageIds(): Array<"c" | "cpp" | "rust" | "cuda" | "python" | "triton" | "pytorch" | "any">;
  export function getWorkspacesForLanguage(
    langId: "c" | "cpp" | "rust" | "cuda" | "python" | "triton" | "pytorch" | "any"
  ): Array<"kernel" | "tensor">;
}


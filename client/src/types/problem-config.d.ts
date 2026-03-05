declare module "problem-config" {
  export interface SharedWorkspace {
    id: "unix" | "cuda";
    label: string;
    defaultProblemLanguage: "bash" | "awk" | "unix" | "cuda";
    problemLanguages: Array<"bash" | "awk" | "unix" | "cuda" | "any">;
    dockerImageName: string;
    dockerfileName: string;
    kind: "shell" | "gpu" | string;
    allowLanguageSwitch: boolean;
    showWebGpuTab: boolean;
    codeThemeKey: string;
  }

  export const DIFFICULTIES: Array<"learn" | "easy" | "medium" | "hard">;
  export const DIFFICULTY_ORDER: Record<"learn" | "easy" | "medium" | "hard", number>;
  export const WORKSPACES: Record<"unix" | "cuda", SharedWorkspace>;
  export const PROBLEM_LANGUAGE_IDS: Array<"bash" | "awk" | "unix" | "cuda" | "any">;
  export const PROBLEM_LANGUAGES: Record<
    "bash" | "awk" | "unix" | "cuda" | "any",
    { id: "bash" | "awk" | "unix" | "cuda" | "any"; label: string; workspace: "unix" | "cuda" | null }
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
    } | null
  >;
  export const DEFAULT_STARTER_CODE: Record<string, string>;
  export function getDefaultStarterCode(langId: string): string;
  export function getValidationCommand(
    languageId: string,
    codeBase64: string,
    inputBase64: string
  ): string;

  export function getWorkspaceIds(): Array<"unix" | "cuda">;
  export function getWorkspace(id: "unix" | "cuda"): SharedWorkspace | null;
  export function getLanguagesForWorkspace(
    id: "unix" | "cuda"
  ): Array<"bash" | "awk" | "unix" | "cuda" | "any">;
  export function getAllProblemLanguageIds(): Array<"bash" | "awk" | "unix" | "cuda" | "any">;
  export function getWorkspacesForLanguage(
    langId: "bash" | "awk" | "unix" | "cuda" | "any"
  ): Array<"unix" | "cuda">;
}


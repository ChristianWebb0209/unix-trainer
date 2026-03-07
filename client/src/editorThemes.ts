/**
 * CodeMirror editor theme. Uses full One Dark (VS Code–style) so syntax
 * highlighting gets consistent colors: functions/keywords/names use the
 * theme palette instead of default purple/dark blue.
 */
import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";

export function getCodeEditorTheme(themeKey: string): Extension {
  void themeKey;
  return oneDark;
}

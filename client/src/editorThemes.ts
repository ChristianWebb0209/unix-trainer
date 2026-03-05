/**
 * Builds CodeMirror theme extensions from shared config theme specs.
 * Config holds data only; this module turns it into @codemirror extensions.
 */
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import * as problemConfig from "problem-config";

export function getCodeEditorTheme(themeKey: string): Extension {
  const spec = problemConfig.CODE_EDITOR_THEME_SPECS[themeKey];
  if (spec == null) {
    return oneDark;
  }
  return EditorView.theme(
    {
      "&": {
        backgroundColor: spec.backgroundColor,
        color: spec.color,
      },
      ".cm-gutters": {
        backgroundColor: spec.gutterBackgroundColor,
        color: spec.gutterColor,
        border: spec.gutterBorder,
      },
      ".cm-scroller": {
        fontFamily: spec.fontFamily,
      },
    },
    { dark: spec.dark }
  );
}

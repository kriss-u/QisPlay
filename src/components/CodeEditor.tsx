import {
  autocompletion,
  type Completion as CMCompletion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { gotoLine, openSearchPanel, search } from "@codemirror/search";
import CodeMirror, { EditorState, keymap, Prec } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef } from "react";
import { useColorMode } from "../app/colorMode";
import { editorTheme } from "../app/editorThemes";
import { rainbowBrackets } from "../app/rainbowBrackets";
import type { Completion } from "../python/protocol";

interface Props {
  path: string;
  value: string;
  readOnly?: boolean;
  onChange?(value: string): void;
  onRun?(): void;
  /** Shift+Enter: send the selection (or current line) to the console, like VS Code. */
  onRunSelection?(code: string): void;
  /** Jedi completions at (1-based line, 0-based column). */
  complete?(code: string, line: number, column: number, path: string): Promise<Completion[]>;
}

// Sentence-case labels for CodeMirror's built-in panels (find/replace, go to line).
const PHRASES = EditorState.phrases.of({
  next: "Next",
  previous: "Previous",
  all: "Select all",
  "match case": "Match case",
  regexp: "Regex",
  "by word": "Whole word",
  replace: "Replace",
  "replace all": "Replace all",
  close: "Close",
  "Go to line": "Go to line",
  go: "Go",
});

// Jedi's completion types -> CodeMirror's icon names.
const TYPE_MAP: Record<string, string> = {
  module: "namespace",
  class: "class",
  instance: "variable",
  function: "function",
  param: "variable",
  property: "property",
  keyword: "keyword",
  statement: "variable",
  path: "text",
};

export function CodeEditor({ path, value, readOnly, onChange, onRun, onRunSelection, complete }: Props) {
  const { colorMode } = useColorMode();
  // Keep callbacks in refs so the extensions (and editor state) are built once.
  const runRef = useRef(onRun);
  const runSelectionRef = useRef(onRunSelection);
  const completeRef = useRef(complete);
  useEffect(() => {
    runRef.current = onRun;
    runSelectionRef.current = onRunSelection;
    completeRef.current = complete;
  }, [onRun, onRunSelection, complete]);

  const extensions = useMemo(() => {
    async function jediSource(ctx: CompletionContext) {
      const word = ctx.matchBefore(/\w*$/);
      const afterDot = ctx.state.sliceDoc(Math.max(0, (word?.from ?? ctx.pos) - 1), word?.from ?? ctx.pos) === ".";
      if (!ctx.explicit && !afterDot && (!word || word.from === word.to)) return null;
      const fn = completeRef.current;
      if (!fn) return null;
      const line = ctx.state.doc.lineAt(ctx.pos);
      const items = await fn(ctx.state.doc.toString(), line.number, ctx.pos - line.from, path);
      if (ctx.aborted || items.length === 0) return null;
      const options: CMCompletion[] = items.map((i) => ({
        label: i.label,
        type: TYPE_MAP[i.type] ?? "variable",
        detail: i.detail && i.detail !== i.label ? i.detail : undefined,
      }));
      return { from: word?.from ?? ctx.pos, options, validFor: /^\w*$/ };
    }

    return [
      python(),
      search({ top: true }), // find/replace at the top, like VS Code
      rainbowBrackets,
      PHRASES,
      autocompletion({ override: [jediSource], activateOnTypingDelay: 150, maxRenderedOptions: 60 }),
      // VS Code habits on top of CodeMirror's defaults (which already cover
      // Mod-/ comment, Alt-↑/↓ move line, Shift-Alt-↑/↓ copy line, Mod-d next
      // occurrence, Mod-Shift-l all occurrences, Mod-Shift-k delete line, Mod-f find).
      Prec.highest(
        keymap.of([
          { key: "Mod-Enter", run: () => (runRef.current?.(), true) },
          {
            key: "Shift-Enter",
            run: (view) => {
              const fn = runSelectionRef.current;
              if (!fn) return false;
              const { state } = view;
              const sel = state.selection.main;
              const code = sel.empty ? state.doc.lineAt(sel.head).text : state.sliceDoc(sel.from, sel.to);
              if (code.trim()) fn(code);
              return true;
            },
          },
          { key: "Mod-h", run: openSearchPanel },
          { key: "Mod-g", run: gotoLine },
          indentWithTab,
        ]),
      ),
    ];
  }, [path]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      readOnly={readOnly}
      editable={!readOnly}
      theme={editorTheme(colorMode)}
      height="100%"
      style={{ height: "100%", fontSize: 14 }}
      basicSetup={{ tabSize: 4, autocompletion: true }}
    />
  );
}

import {
  autocompletion,
  type Completion as CMCompletion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { indentWithTab, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { gotoLine, openSearchPanel, search } from "@codemirror/search";
import CodeMirror, { EditorState, keymap, Prec, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useImperativeHandle, useMemo, useRef, type MouseEvent, type Ref } from "react";
import { activeLine } from "../app/activeLine";
import { importChange } from "../app/autoImport";
import { useColorMode } from "../app/colorMode";
import { editorTheme } from "../app/editorThemes";
import { rainbowBrackets } from "../app/rainbowBrackets";
import { useSettings } from "../app/settings";
import { FORMAT_KEYS, formatKeys, isMac, PALETTE_KEYS } from "../app/shortcuts";
import type { Completion } from "../python/protocol";
import { basename, isPython } from "../workspace/paths";
import { ContextMenu, type MenuEntry } from "./ContextMenu";
import { showError } from "./toast";

export interface EditorHandle {
  undo(): void;
  redo(): void;
  /**
   * Swaps in a formatted version of `before` as one undo step, keeping the
   * cursor and scroll. False (and nothing changes) if the text was edited since.
   */
  replaceText(before: string, after: string): boolean;
}

interface Props {
  ref?: Ref<EditorHandle>;
  path: string;
  value: string;
  readOnly?: boolean;
  onChange?(value: string): void;
  onRun?(): void;
  /** Shift+Enter: send the selection (or current line) to the console, like VS Code. */
  onRunSelection?(code: string): void;
  onCommandPalette?(): void;
  /** Format document (Black); only offered for Python files. */
  onFormat?(): void;
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

const AUTO_IMPORT_SECTION = { name: "Auto-import", rank: 1 };

/** What Shift+Enter sends to the console: the selection, or the cursor's line. */
function selectedCode(state: EditorState) {
  const sel = state.selection.main;
  return sel.empty ? state.doc.lineAt(sel.head).text : state.sliceDoc(sel.from, sel.to);
}

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

export function CodeEditor({ ref, path, value, readOnly, onChange, onRun, onRunSelection, onCommandPalette, onFormat, complete }: Props) {
  const { colorMode } = useColorMode();
  const { fontSize, zoom } = useSettings();
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
      const options: CMCompletion[] = items.map((i) =>
        i.import
          ? {
              // Not in scope yet: choosing it also adds the import (one undo step).
              label: i.label,
              type: TYPE_MAP[i.type] ?? "variable",
              detail: i.import,
              section: AUTO_IMPORT_SECTION,
              boost: -1,
              apply: (view, _completion, from, to) => {
                const add = importChange(view.state, i.import!);
                // Import first: at the same position, earlier changes' text comes first.
                const changes = view.state.changes([...(add ? [add] : []), { from, to, insert: i.label }]);
                view.dispatch({ changes, selection: { anchor: changes.mapPos(to, 1) }, scrollIntoView: true });
              },
            }
          : {
              label: i.label,
              type: TYPE_MAP[i.type] ?? "variable",
              detail: i.detail && i.detail !== i.label ? i.detail : undefined,
            },
      );
      return { from: word?.from ?? ctx.pos, options, validFor: /^\w*$/ };
    }

    return [
      python(),
      search({ top: true }), // find/replace at the top, like VS Code
      rainbowBrackets,
      activeLine,
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
              const code = selectedCode(view.state);
              if (code.trim()) fn(code);
              return true;
            },
          },
          // VS Code's bindings, which also avoid OS/browser keys: ⌘H hides the
          // app on macOS and ⌘G is the browser's "find next".
          { key: "Ctrl-h", mac: "Mod-Alt-f", run: openSearchPanel },
          { key: "Ctrl-g", run: gotoLine },
          indentWithTab,
        ]),
      ),
    ];
  }, [path]);

  const cm = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(ref, () => ({
    undo() {
      const view = cm.current?.view;
      if (!view || readOnly) return;
      undo(view);
      view.focus();
    },
    redo() {
      const view = cm.current?.view;
      if (!view || readOnly) return;
      redo(view);
      view.focus();
    },
    replaceText(before, after) {
      const view = cm.current?.view;
      if (!view || readOnly || view.state.doc.toString() !== before) return false;
      // Only the changed middle is replaced, so the cursor and scroll position stay put.
      let start = 0;
      while (start < before.length && start < after.length && before[start] === after[start]) start++;
      let end = 0;
      while (
        end < before.length - start &&
        end < after.length - start &&
        before[before.length - 1 - end] === after[after.length - 1 - end]
      )
        end++;
      view.dispatch({
        changes: { from: start, to: before.length - end, insert: after.slice(start, after.length - end) },
        userEvent: "input.format",
      });
      return true;
    },
  }), [readOnly]);

  function menuItems(e: MouseEvent): MenuEntry[] | null {
    const view = cm.current?.view;
    if (!view) return null;
    // Right-clicking outside the selection moves the cursor there first, as in VS Code.
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos !== null && !view.state.selection.ranges.some((r) => r.from <= pos && pos <= r.to)) {
      view.dispatch({ selection: { anchor: pos } });
    }
    const empty = view.state.selection.main.empty;
    const py = isPython(path);
    return [
      { value: "undo", label: "Undo", keys: "Mod+z", disabled: readOnly || !undoDepth(view.state) },
      { value: "redo", label: "Redo", keys: isMac ? "Mod+Shift+z" : "Ctrl+y", disabled: readOnly || !redoDepth(view.state) },
      null,
      ...(py && onRun ? [{ value: "run", label: `Run ${basename(path)}`, keys: "Mod+Enter" }] : []),
      ...(py && onRunSelection
        ? [{ value: "run-selection", label: empty ? "Run line in console" : "Run selection in console", keys: "Shift+Enter" }]
        : []),
      ...(py && onFormat ? [{ value: "format", label: "Format document", keys: FORMAT_KEYS, disabled: readOnly }] : []),
      null,
      { value: "cut", label: "Cut", keys: "Mod+x", disabled: empty || readOnly },
      { value: "copy", label: "Copy", keys: "Mod+c", disabled: empty },
      { value: "paste", label: "Paste", keys: "Mod+v", disabled: readOnly },
      null,
      ...(onCommandPalette ? [{ value: "palette", label: "Command palette", keys: PALETTE_KEYS }] : []),
    ];
  }

  async function onMenu(value: string) {
    const view = cm.current?.view;
    if (!view) return;
    if (value === "run") return onRun?.();
    if (value === "palette") return onCommandPalette?.();
    if (value === "format") return onFormat?.();
    if (value === "undo" || value === "redo") {
      (value === "undo" ? undo : redo)(view);
      view.focus();
      return;
    }
    if (value === "run-selection") {
      const code = selectedCode(view.state);
      if (code.trim()) onRunSelection?.(code);
      return;
    }
    const sel = view.state.selection.main;
    try {
      if (value === "paste") {
        const text = await navigator.clipboard.readText();
        view.dispatch({ ...view.state.replaceSelection(text), userEvent: "input.paste", scrollIntoView: true });
      } else {
        await navigator.clipboard.writeText(view.state.sliceDoc(sel.from, sel.to));
        if (value === "cut") view.dispatch({ ...view.state.replaceSelection(""), userEvent: "delete.cut" });
      }
    } catch {
      // e.g. the browser didn't allow reading the clipboard from a menu
      const keys = { cut: "Mod+x", copy: "Mod+c", paste: "Mod+v" }[value] ?? "";
      showError(new Error(`Your browser blocked the clipboard here. Press ${formatKeys(keys)} instead.`));
    }
    view.focus();
  }

  return (
    <ContextMenu items={menuItems} onSelect={(value) => void onMenu(value)}>
      <CodeMirror
        ref={cm}
        value={value}
        onChange={onChange}
        extensions={extensions}
        readOnly={readOnly}
        editable={!readOnly}
        theme={editorTheme(colorMode)}
        height="100%"
        style={{ height: "100%", fontSize: fontSize * zoom }}
        basicSetup={{ tabSize: 4, autocompletion: true, highlightActiveLine: false }}
      />
    </ContextMenu>
  );
}

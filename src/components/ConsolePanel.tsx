import { insertNewlineAndIndent } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import CodeMirror, { EditorView, keymap, Prec, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { LuRotateCcw } from "react-icons/lu";
import { useColorMode } from "../app/colorMode";
import { editorTheme } from "../app/editorThemes";
import { rainbowBrackets } from "../app/rainbowBrackets";
import { useSettings } from "../app/settings";
import { formatKeys } from "../app/shortcuts";
import { OutputTerminal, type OutputTerminalHandle, type Stream } from "./OutputTerminal";

export interface ConsoleHandle {
  write(text: string, stream: Stream): void;
  clear(): void;
  /** Echo `source` as if typed, then run it. */
  submit(source: string): Promise<void>;
  focus(): void;
}

interface Props {
  ready: boolean;
  busy: boolean;
  /** Run source in the console namespace; resolves when done. */
  execute(source: string): Promise<void>;
  isComplete(source: string): Promise<"complete" | "incomplete" | "invalid">;
  onReset(): void;
}

const HISTORY_KEY = "qisplay:console-history";
const HISTORY_LIMIT = 200;

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * A single line with balanced brackets, no trailing ":" or "\\" and no open
 * triple quote can't need continuation lines, so Enter can run it right away.
 */
function obviouslyComplete(source: string) {
  if (source.includes("\n")) return false;
  const line = source.trimEnd();
  if (line.startsWith("@")) return false; // a decorator needs the def that follows
  if (line.endsWith(":") || line.endsWith("\\") || line.includes('"""') || line.includes("'''")) return false;
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === "#") break;
    else if (ch === '"' || ch === "'") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
  }
  return depth <= 0 && quote === null;
}

function banner(term: OutputTerminalHandle | null) {
  term?.write(
    "Python console — variables persist between inputs; project files are importable.\n" +
      `Enter runs · Shift+Enter adds a line · ↑/↓ history · ${formatKeys("Mod+l")} clears\n\n`,
    "info",
  );
}

/** An interactive Python console (REPL) with a persistent namespace. */
export const ConsolePanel = forwardRef<ConsoleHandle, Props>(function ConsolePanel(
  { ready, busy, execute, isComplete, onReset },
  ref,
) {
  const term = useRef<OutputTerminalHandle>(null);
  const input = useRef<ReactCodeMirrorRef>(null);
  const history = useRef<string[]>(loadHistory());
  const cursor = useRef<number>(history.current.length); // index into history while browsing
  const draft = useRef("");
  const { colorMode } = useColorMode();
  const { fontSize, zoom } = useSettings();

  // Props change every render; the keymap reads them through a ref.
  const live = useRef({ ready, busy, execute, isComplete });
  useEffect(() => {
    live.current = { ready, busy, execute, isComplete };
  }, [ready, busy, execute, isComplete]);

  useEffect(() => banner(term.current), []);

  // Inputs run one after another, like a terminal: anything entered while
  // Python is busy waits its turn instead of being dropped.
  const queue = useRef<Promise<void>>(Promise.resolve());

  function submit(source: string): Promise<void> {
    const code = source.replace(/\s+$/, "");
    if (!code.trim() || !live.current.ready) return Promise.resolve();
    if (history.current[history.current.length - 1] !== code) {
      history.current = [...history.current, code].slice(-HISTORY_LIMIT);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.current));
      } catch {
        // History is a convenience; ignore storage errors.
      }
    }
    cursor.current = history.current.length;
    // Clear through the view: the controlled `value` prop is applied lazily
    // while typing, which let fast follow-up input merge with the old text.
    const view = input.current?.view;
    const typedHere = view?.hasFocus ?? false;
    view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });

    queue.current = queue.current.then(async () => {
      while (live.current.busy) await new Promise((r) => setTimeout(r, 50)); // e.g. a script is running
      code.split("\n").forEach((line, i) => term.current?.write(`${i ? "... " : ">>> "}${line}\n`, "input"));
      await live.current.execute(code + "\n");
      // Keep the cursor at the prompt, like a terminal (but don't steal focus
      // from the editor when the code came from Shift+Enter there).
      if (typedHere || document.activeElement === document.body) input.current?.view?.focus();
    });
    return queue.current;
  }

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  useImperativeHandle(ref, () => ({
    write: (text, stream) => term.current?.write(text, stream),
    clear: () => term.current?.clear(),
    submit: (source) => submitRef.current(source),
    focus: () => input.current?.view?.focus(),
  }));

  const extensions = useMemo(() => {
    const setDoc = (view: EditorView, text: string) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } });

    const browse = (view: EditorView, dir: -1 | 1) => {
      const { state } = view;
      const line = state.doc.lineAt(state.selection.main.head);
      // Only browse history from the first/last line, like a terminal.
      if (dir === -1 ? line.number !== 1 : line.number !== state.doc.lines) return false;
      const h = history.current;
      if (cursor.current === h.length) draft.current = state.doc.toString();
      const next = Math.min(h.length, Math.max(0, cursor.current + dir));
      if (next === cursor.current) return true;
      cursor.current = next;
      setDoc(view, next === h.length ? draft.current : h[next]);
      return true;
    };

    return [
      python(),
      rainbowBrackets,
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Enter",
            run: (view) => {
              const doc = view.state.doc.toString();
              const lastLine = view.state.doc.line(view.state.doc.lines).text;
              // A blank last line ends a block, as in the standard REPL.
              if (doc.includes("\n") && lastLine.trim() === "") {
                void submitRef.current(doc);
                return true;
              }
              // Most input is one finished line: decide instantly, no round trip.
              if (obviouslyComplete(doc)) {
                void submitRef.current(doc);
                return true;
              }
              void live.current.isComplete(doc).then((status) => {
                const now = view.state.doc.toString();
                if (status === "incomplete") {
                  if (now === doc) insertNewlineAndIndent(view);
                  return;
                }
                // Typed more while Python was checking: run what was there at
                // Enter, and carry the newer text over to the next prompt.
                const extra = now.startsWith(doc) ? now.slice(doc.length) : "";
                void submitRef.current(doc).then(() => {
                  if (extra) view.dispatch({ changes: { from: 0, insert: extra }, selection: { anchor: extra.length } });
                });
              });
              return true;
            },
          },
          { key: "Shift-Enter", run: insertNewlineAndIndent },
          { key: "ArrowUp", run: (v) => browse(v, -1) },
          { key: "ArrowDown", run: (v) => browse(v, 1) },
          {
            key: "Mod-l",
            run: () => {
              term.current?.clear();
              return true;
            },
          },
        ]),
      ),
    ];
  }, []);

  return (
    <Flex direction="column" h="100%" minH="0">
      {/* Clicking the scrollback focuses the prompt (unless you're selecting text). */}
      <Box
        flex="1"
        minH="0"
        overflow="hidden"
        onMouseUp={() => {
          if (!window.getSelection()?.toString()) input.current?.view?.focus();
        }}
      >
        <OutputTerminal ref={term} label="Python console output" />
      </Box>
      <Flex align="flex-start" borderTopWidth="1px" bg="bg.subtle" px="2" py="1" gap="2">
        <Text fontFamily="mono" fontSize="sm" color="purple.fg" pt="1" userSelect="none" aria-hidden>
          {">>>"}
        </Text>
        <Box flex="1" minW="0" maxH="40" overflowY="auto" aria-label="Python console input">
          <CodeMirror
            ref={input}
            extensions={extensions}
            theme={editorTheme(colorMode)}
            editable={ready}
            placeholder={ready ? (busy ? "Running…" : "Type Python and press Enter") : "Loading Python…"}
            basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, autocompletion: false }}
            style={{ fontSize: fontSize * zoom, background: "transparent" }}
          />
        </Box>
        <Button
          size="2xs"
          variant="ghost"
          mt="0.5"
          title="Restart the console (clears all variables)"
          onClick={() => {
            onReset();
            term.current?.clear();
            banner(term.current);
            term.current?.write("[console restarted]\n", "info");
          }}
        >
          <LuRotateCcw /> Restart
        </Button>
      </Flex>
    </Flex>
  );
});

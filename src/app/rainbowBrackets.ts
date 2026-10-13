// VS Code-style bracket pair colorization: (), [] and {} cycle through three
// colors by nesting depth. Uses the syntax tree, so brackets inside strings
// and comments are left alone.
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { bracketColors } from "./editorThemes";

const OPEN = new Set(["(", "[", "{"]);
const CLOSE = new Set([")", "]", "}"]);
const marks = [0, 1, 2].map((i) => Decoration.mark({ class: `cm-rainbow-${i}` }));

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let depth = 0;
  syntaxTree(view.state).iterate({
    enter(node) {
      if (OPEN.has(node.name)) {
        builder.add(node.from, node.to, marks[depth % 3]);
        depth++;
      } else if (CLOSE.has(node.name)) {
        depth = Math.max(0, depth - 1);
        builder.add(node.from, node.to, marks[depth % 3]);
      }
    },
  });
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const colors = EditorView.baseTheme(
  Object.fromEntries(
    (["light", "dark"] as const).flatMap((mode) =>
      // The syntax highlighter wraps brackets in its own (punctuation) span, so
      // color that inner span too and win over it.
      bracketColors[mode].map((color, i) => [
        `&${mode} .cm-rainbow-${i}, &${mode} .cm-rainbow-${i} span`,
        { color: `${color} !important` },
      ]),
    ),
  ),
);

export const rainbowBrackets = [plugin, colors];

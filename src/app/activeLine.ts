// Current-line highlight that, like VS Code, only shows for empty cursors.
// CodeMirror's own highlightActiveLine also marks the line holding the head of
// a selection, and the theme's opaque line color paints over the selection
// layer, so the last selected line looked unselected.
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

const lineDeco = Decoration.line({ class: "cm-activeLine" });

function build(view: EditorView): DecorationSet {
  let last = -1;
  const decos = [];
  for (const r of view.state.selection.ranges) {
    if (!r.empty) continue;
    const line = view.lineBlockAt(r.head);
    if (line.from > last) {
      decos.push(lineDeco.range(line.from));
      last = line.from;
    }
  }
  return Decoration.set(decos);
}

export const activeLine = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

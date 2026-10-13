// Auto-import: when a completion comes with an import statement, add it to the
// file the way an IDE would (Pylance-style).
import type { ChangeSpec, EditorState } from "@codemirror/state";

const FROM_RE = /^from\s+([\w.]+)\s+import\s+(.+)$/;

/** The change that adds `statement` to the file, or null if it's already there. */
export function importChange(state: EditorState, statement: string): ChangeSpec | null {
  const doc = state.doc;
  const lines = Array.from({ length: doc.lines }, (_, i) => doc.line(i + 1));
  const text = (n: number) => lines[n].text.trim();

  if (lines.some((l) => l.text.trim() === statement)) return null;

  // `from X import a` already present: extend it to `from X import a, b`.
  const wanted = FROM_RE.exec(statement);
  if (wanted) {
    const [, module, name] = wanted;
    for (const line of lines) {
      const m = FROM_RE.exec(line.text.trim());
      if (!m || m[1] !== module || m[2].includes("(") || m[2].includes("#") || m[2].trim().endsWith("\\")) continue;
      const names = m[2].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]);
      if (names.includes(name)) return null;
      const end = line.from + line.text.trimEnd().length;
      return { from: end, insert: `, ${name}` };
    }
  }

  // Otherwise add it after the top-of-file import block, skipping a leading
  // comment header and module docstring.
  let i = 0;
  while (i < lines.length && (text(i) === "" || text(i).startsWith("#"))) i++;
  if (i < lines.length && /^[rRbBuU]?("""|''')/.test(text(i))) {
    const quote = text(i).match(/"""|'''/)![0];
    const opensAndCloses = text(i).indexOf(quote) !== text(i).lastIndexOf(quote);
    if (!opensAndCloses) while (++i < lines.length && !lines[i].text.includes(quote));
    i++;
  }
  let lastImport = -1;
  for (let j = i; j < lines.length; j++) {
    const t = text(j);
    if (/^(import|from)\s/.test(t)) {
      // A parenthesized `from x import (\n a,\n b)` ends at its ")".
      if (t.includes("(") && !t.includes(")")) while (j + 1 < lines.length && !lines[j].text.includes(")")) j++;
      lastImport = j;
    } else if (t !== "" && !t.startsWith("#")) break;
  }
  if (lastImport >= 0) return { from: lines[lastImport].to, insert: `\n${statement}` };
  if (i >= lines.length) return { from: doc.length, insert: `${doc.length ? "\n" : ""}${statement}\n` };
  // No imports yet: put it above the first line of code, with a blank line after.
  return { from: lines[i].from, insert: `${statement}\n\n` };
}

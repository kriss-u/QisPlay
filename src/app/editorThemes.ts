// VS Code's Dark+ and Light+ palettes for CodeMirror, mapped onto every token
// category the Python grammar produces, plus matching terminal palettes.
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";
import type { ITheme } from "@xterm/xterm";

interface Palette {
  bg: string;
  fg: string;
  comment: string;
  control: string; // if / for / return / try …
  keyword: string; // def / class / import / and / None / True …
  string: string;
  escape: string;
  number: string;
  func: string;
  type: string; // classes, builtin types, namespaces
  variable: string;
  property: string;
  operator: string;
  decorator: string;
  invalid: string;
  brackets: [string, string, string];
}

const DARK_PLUS: Palette = {
  bg: "#1e1e1e",
  fg: "#d4d4d4",
  comment: "#6a9955",
  control: "#c586c0",
  keyword: "#569cd6",
  string: "#ce9178",
  escape: "#d7ba7d",
  number: "#b5cea8",
  func: "#dcdcaa",
  type: "#4ec9b0",
  variable: "#9cdcfe",
  property: "#9cdcfe",
  operator: "#d4d4d4",
  decorator: "#dcdcaa",
  invalid: "#f44747",
  brackets: ["#ffd700", "#da70d6", "#179fff"],
};

const LIGHT_PLUS: Palette = {
  bg: "#ffffff",
  fg: "#000000",
  comment: "#008000",
  control: "#af00db",
  keyword: "#0000ff",
  string: "#a31515",
  escape: "#ee0000",
  number: "#098658",
  func: "#795e26",
  type: "#267f99",
  variable: "#001080",
  property: "#001080",
  operator: "#000000",
  decorator: "#795e26",
  invalid: "#cd3131",
  brackets: ["#0431fa", "#319331", "#7b3814"],
};

const styles = (c: Palette) => [
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: c.comment, fontStyle: "italic" },
  { tag: [t.controlKeyword], color: c.control },
  { tag: [t.keyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier, t.self], color: c.keyword },
  { tag: [t.bool, t.null, t.atom], color: c.keyword },
  { tag: [t.string, t.docString, t.character], color: c.string },
  { tag: [t.special(t.string), t.escape, t.regexp], color: c.escape },
  { tag: [t.number, t.unit], color: c.number },
  {
    tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName), t.macroName],
    color: c.func,
  },
  { tag: [t.className, t.definition(t.className), t.typeName, t.namespace, t.standard(t.variableName)], color: c.type },
  { tag: [t.variableName, t.definition(t.variableName), t.local(t.variableName)], color: c.variable },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: c.property },
  { tag: [t.constant(t.name), t.constant(t.variableName)], color: c.number },
  {
    tag: [t.operator, t.arithmeticOperator, t.compareOperator, t.bitwiseOperator, t.updateOperator, t.definitionOperator, t.derefOperator],
    color: c.operator,
  },
  { tag: [t.meta, t.annotation], color: c.decorator },
  { tag: [t.punctuation, t.separator], color: c.fg },
  { tag: t.invalid, color: c.invalid },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: c.func, textDecoration: "underline" },
  { tag: t.heading, color: c.keyword, fontWeight: "bold" },
];

const make = (mode: "light" | "dark", c: Palette, extra: { caret: string; selection: string; line: string; gutter: string; gutterActive: string }) =>
  createTheme({
    theme: mode,
    settings: {
      background: c.bg,
      foreground: c.fg,
      caret: extra.caret,
      selection: extra.selection,
      selectionMatch: `${extra.selection}99`,
      lineHighlight: extra.line,
      gutterBackground: c.bg,
      gutterForeground: extra.gutter,
      gutterActiveForeground: extra.gutterActive,
      gutterBorder: "transparent",
    },
    styles: styles(c),
  });

export const darkPlus = make("dark", DARK_PLUS, {
  caret: "#aeafad",
  selection: "#264f78",
  line: "#2a2d2e",
  gutter: "#858585",
  gutterActive: "#c6c6c6",
});

export const lightPlus = make("light", LIGHT_PLUS, {
  caret: "#000000",
  selection: "#add6ff",
  line: "#f5f5f5",
  gutter: "#6e7681",
  gutterActive: "#171184",
});

export const editorTheme = (mode: "light" | "dark") => (mode === "dark" ? darkPlus : lightPlus);

/** Rainbow bracket colors (by nesting depth), as in VS Code. */
export const bracketColors = { dark: DARK_PLUS.brackets, light: LIGHT_PLUS.brackets };

export const terminalTheme: Record<"light" | "dark", ITheme> = {
  dark: {
    background: DARK_PLUS.bg,
    foreground: "#cccccc",
    cursor: DARK_PLUS.bg,
    selectionBackground: "#264f78",
    red: "#f14c4c",
    green: "#23d18b",
    yellow: "#f5f543",
    blue: "#3b8eea",
    magenta: "#d670d6",
    cyan: "#29b8db",
  },
  light: {
    background: LIGHT_PLUS.bg,
    foreground: "#3b3b3b",
    cursor: LIGHT_PLUS.bg,
    selectionBackground: "#add6ff",
    red: "#cd3131",
    green: "#107c10",
    yellow: "#949800",
    blue: "#0451a5",
    magenta: "#bc05bc",
    cyan: "#0598bc",
  },
};

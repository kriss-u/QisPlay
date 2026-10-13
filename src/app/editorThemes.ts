// VS Code's Dark+ and Light+ themes for CodeMirror (@uiw/codemirror-theme-vscode),
// plus VS Code's rainbow bracket colors and matching terminal palettes.
import { vscodeDarkInit, vscodeLightInit } from "@uiw/codemirror-theme-vscode";
import type { ITheme } from "@xterm/xterm";
import { MONO_FONT } from "./system";

const DARK_BG = "#1e1e1e";
const LIGHT_BG = "#ffffff";

export const darkPlus = vscodeDarkInit({ settings: { fontFamily: MONO_FONT } });
export const lightPlus = vscodeLightInit({ settings: { fontFamily: MONO_FONT } });

export const editorTheme = (mode: "light" | "dark") => (mode === "dark" ? darkPlus : lightPlus);

/** Rainbow bracket colors (by nesting depth), as in VS Code. */
export const bracketColors = {
  dark: ["#ffd700", "#da70d6", "#179fff"],
  light: ["#0431fa", "#319331", "#7b3814"],
};

export const terminalTheme: Record<"light" | "dark", ITheme> = {
  dark: {
    background: DARK_BG,
    foreground: "#cccccc",
    cursor: DARK_BG,
    selectionBackground: "#264f78",
    red: "#f14c4c",
    green: "#23d18b",
    yellow: "#f5f543",
    blue: "#3b8eea",
    magenta: "#d670d6",
    cyan: "#29b8db",
  },
  light: {
    background: LIGHT_BG,
    foreground: "#3b3b3b",
    cursor: LIGHT_BG,
    selectionBackground: "#add6ff",
    red: "#cd3131",
    green: "#107c10",
    yellow: "#949800",
    blue: "#0451a5",
    magenta: "#bc05bc",
    cyan: "#0598bc",
  },
};

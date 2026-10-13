// Chakra theme with VS Code's classic Dark+ / Light+ workbench colors, so the
// chrome around the editor (title bar, sidebar, tabs, status bar) looks like
// VS Code in both modes.
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/** Code font: editor, console, terminal and inline code (@font-face in index.css). */
export const MONO_FONT = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

const c = (light: string, dark: string) => ({ value: { _light: light, _dark: dark } });

const config = defineConfig({
  theme: {
    tokens: {
      fonts: { mono: { value: MONO_FONT } },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: c("#ffffff", "#1e1e1e"), // editor.background / panel.background
          subtle: c("#f3f3f3", "#252526"), // sideBar / editorGroupHeader.tabsBackground
          muted: c("#e8e8e8", "#2a2d2e"), // list.hoverBackground
          emphasized: c("#e4e6f1", "#37373d"), // list.inactiveSelectionBackground
          panel: c("#ffffff", "#252526"), // menu / quickInput / dialogs
          titlebar: c("#dddddd", "#3c3c3c"), // titleBar.activeBackground
          tab: c("#ececec", "#2d2d2d"), // tab.inactiveBackground
          statusbar: c("#007acc", "#007acc"), // statusBar.background
        },
        fg: {
          DEFAULT: c("#333333", "#cccccc"),
          muted: c("#616161", "#9d9d9d"), // descriptionForeground
          subtle: c("#8e8e90", "#6e7681"),
          error: c("#e51400", "#f48771"),
          statusbar: c("#ffffff", "#ffffff"),
        },
        border: {
          DEFAULT: c("#e5e5e5", "#3c3c3c"),
          muted: c("#e5e5e5", "#3c3c3c"),
          subtle: c("#ececec", "#303031"),
          emphasized: c("#cecece", "#5a5a5a"), // input.border
        },
        // VS Code's accent (button.background / focusBorder).
        blue: {
          solid: c("#007acc", "#0e639c"),
          contrast: c("#ffffff", "#ffffff"),
          fg: c("#006ab1", "#3794ff"),
          focusRing: c("#0090f1", "#007fd4"),
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);

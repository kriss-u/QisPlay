// The walkthrough's steps. The first visit shows all of them; a returning
// visitor sees only the steps added or changed since they last finished it,
// as a "What's new" tour.
//
// Shipping a user-facing feature: add a step for it, or edit the step for the
// area it changed, and set its `since` to the highest `since` here plus one.
// Features shipped in the same deploy can share a number.
//
// Every step must work on every screen size: if its target is hidden on some
// (the header icons and the explorer are on phones), give it a `fallback`.
import type { Placement } from "@floating-ui/react-dom";
import type { IconType } from "react-icons";
import {
  LuBug,
  LuCircleHelp,
  LuCodeXml,
  LuEllipsisVertical,
  LuFolderTree,
  LuFolderKanban,
  LuPackage,
  LuPlay,
  LuSettings,
  LuWandSparkles,
  LuSquareTerminal,
  LuSunMoon,
  LuZap,
} from "react-icons/lu";
import { FORMAT_KEYS, formatKeys, PALETTE_KEYS } from "../app/shortcuts";

/**
 * A feature step. With a placement it spotlights the element marked
 * data-tour="<id>"; without one it shows as a centered card.
 *
 * `since` is the tour revision that added or last changed the step. `news`,
 * when set, replaces `description` in the "What's new" tour, so it can say
 * what changed instead of describing the whole feature again.
 *
 * `fallback` is the data-tour id to point at when the step's own target is
 * hidden, e.g. the menu or button that holds it on a phone.
 */
export interface Step {
  id: string;
  since: number;
  title: string;
  description: string;
  news?: string;
  icon: IconType;
  placement?: Placement;
  fallback?: string;
}

const REDO_KEYS = { mac: "Mod+Shift+z", other: "Ctrl+y" };
const COPY_KEY = formatKeys({ mac: "Alt", other: "Ctrl" });

export const STEPS: Step[] = [
  {
    id: "project",
    since: 2,
    title: "Projects",
    icon: LuFolderKanban,
    description:
      "Switch between projects, create or rename them, start one from a template such as a course lab, and download or open a project as a .zip file.",
    news: "New project from template… starts a project from a ready-made template, like the Intro to Quantum Computing labs.",
    placement: "bottom-start",
  },
  {
    id: "explorer",
    since: 2,
    title: "Files",
    icon: LuFolderTree,
    description: `Your project's files. Drag a file or folder to move it, or hold ${COPY_KEY} while dragging to copy it. Right-click any row to rename, delete, cut, copy or paste. Everything saves automatically.`,
    news: `Drag files and folders to move them, or hold ${COPY_KEY} while dragging to copy. Right-click any row to rename, delete, cut, copy or paste.`,
    placement: "right-start",
    fallback: "files",
  },
  {
    id: "editor",
    since: 4,
    title: "Editor",
    icon: LuCodeXml,
    description: `A VS Code-style editor with autocomplete. Picking a suggestion that isn't imported yet adds the import for you. ${formatKeys("Shift+Enter")} runs the selected lines in the console, and right-clicking opens a menu with undo, redo, run, format, cut, copy and paste. Undo is ${formatKeys("Mod+z")} and redo is ${formatKeys(REDO_KEYS)}.`,
    news: `Undo (${formatKeys("Mod+z")}) and redo (${formatKeys(REDO_KEYS)}) are now in the editor's right-click menu and the command palette.`,
    placement: "right-start",
  },
  {
    id: "run",
    since: 1,
    title: "Run and stop",
    icon: LuPlay,
    description: `Runs the open .py file (${formatKeys("Mod+Enter")} or F5). Stop (${formatKeys("Shift+F5")}) interrupts a long run.`,
    placement: "bottom-start",
  },
  {
    id: "format",
    since: 5,
    title: "Format your code",
    icon: LuWandSparkles,
    description: `Add the Black formatter in Packages and a Format button appears, along with Format document in the editor's right-click menu and the command palette (${formatKeys(FORMAT_KEYS)}). Settings then lets you format on save or before every run, and pick the line length.`,
    news: `New: add the Black formatter in Packages to get Format document (${formatKeys(FORMAT_KEYS)}), in the editor's right-click menu too. Settings can then format on save or before running.`,
  },
  {
    id: "panel",
    since: 1,
    title: "Output, console and figures",
    icon: LuSquareTerminal,
    description:
      'Program output appears here. The console runs Python line by line, and plots from plt.show() or qc.draw("mpl") show up under Figures.',
    placement: "left-start",
  },
  {
    id: "qisdebug",
    since: 2,
    title: "Debug circuits with QisDebug",
    icon: LuBug,
    description:
      "Add qisdebug in Packages, then import it to record every gate, transpiler pass and statevector your circuits go through. debug.show() opens its timeline viewer right here in QisPlay.",
  },
  {
    id: "status",
    since: 1,
    title: "Python status",
    icon: LuZap,
    description: "Python loads in the background the first time. This shows when it's still loading, ready, or running your code.",
    placement: "bottom-end",
    fallback: "run",
  },
  {
    id: "packages",
    since: 5,
    title: "Packages",
    icon: LuPackage,
    description:
      "Python comes with numpy, scipy, matplotlib, qiskit and qiskit-aer. Add what else you need, such as pandas, sympy, qiskit-algorithms, qiskit-ibm-runtime or qisdebug, and the Black formatter. You can also save requirements.txt or environment.yaml into your project.",
    news: "Packages now starts with just the basics. Add pandas, sympy, qiskit-algorithms, qiskit-ibm-runtime, qisdebug or the Black formatter when you need them, and save requirements.txt or environment.yaml into your project.",
    placement: "bottom-end",
    fallback: "more",
  },
  {
    id: "theme",
    since: 1,
    title: "Theme",
    icon: LuSunMoon,
    description: "Light, dark, or match your system.",
    placement: "bottom-end",
    fallback: "more",
  },
  {
    id: "settings",
    since: 5,
    title: "Settings",
    icon: LuSettings,
    description: `Zoom (${formatKeys("Mod+=")} / ${formatKeys("Mod+-")}), code font size, and formatting: format on save, format on run and line length.`,
    news: "Settings has formatting options: format on save, format on run and the line length.",
    placement: "bottom-end",
    fallback: "more",
  },
  {
    id: "help",
    since: 1,
    title: "Keyboard shortcuts",
    icon: LuCircleHelp,
    description: `Every shortcut in one list. ${formatKeys(PALETTE_KEYS)} opens the command palette with all commands.`,
    placement: "bottom-end",
    fallback: "more",
  },
  {
    id: "more",
    since: 1,
    title: "More",
    icon: LuEllipsisVertical,
    description: "Format document, packages, theme, settings and keyboard shortcuts are in this menu.",
    placement: "bottom-end",
  },
];

/** The newest revision; finishing either tour records it as seen. */
export const LATEST = Math.max(...STEPS.map((s) => s.since));

export const WELCOME = {
  title: "Welcome to QisPlay",
  description:
    "Write and run Python, Qiskit and Qiskit Aer right in your browser. Nothing to install, and your projects stay on this device. Here's a quick look around.",
};

export const DONE = {
  title: "You're all set",
  description: `Press Run to try the starter circuit. You can replay this tour any time from the command palette (${formatKeys(PALETTE_KEYS)}): "Start walkthrough".`,
};

export const WHATS_NEW = {
  title: "What's new in QisPlay",
  description: "Here's what changed since your last visit.",
};

export const CAUGHT_UP = {
  title: "You're up to date",
  description: `The full tour is always in the command palette (${formatKeys(PALETTE_KEYS)}): "Start walkthrough".`,
};

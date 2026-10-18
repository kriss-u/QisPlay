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
  LuSquareTerminal,
  LuSunMoon,
  LuZap,
} from "react-icons/lu";
import { formatKeys, PALETTE_KEYS } from "../app/shortcuts";

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
    since: 2,
    title: "Editor",
    icon: LuCodeXml,
    description: `A VS Code-style editor with autocomplete. Picking a suggestion that isn't imported yet adds the import for you. ${formatKeys("Shift+Enter")} runs the selected lines in the console, and right-clicking opens a menu with run, cut, copy and paste.`,
    news: "Right-click in the editor to run the file or the selection, and right-click a tab to close others or copy its path.",
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
      "Import qisdebug to record every gate, transpiler pass and statevector your circuits go through. debug.show() opens its timeline viewer right here in QisPlay.",
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
    since: 2,
    title: "Packages",
    icon: LuPackage,
    description:
      "See which packages are available, including numpy, matplotlib, qiskit and qiskit-aer. pandas, qiskit-algorithms, qiskit-qasm3-import and qisdebug install the first time you import them.",
    news: "pandas, qiskit-algorithms, qiskit-qasm3-import and qisdebug are now available. They install the first time you import them.",
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
    since: 1,
    title: "Settings",
    icon: LuSettings,
    description: `Zoom (${formatKeys("Mod+=")} / ${formatKeys("Mod+-")}) and code font size.`,
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
    description: "Packages, theme, settings and keyboard shortcuts are in this menu.",
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

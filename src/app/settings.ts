import { createContext, useContext } from "react";

/** View settings, saved in localStorage (like VS Code's user settings). */
export interface Settings {
  /** Whole-app zoom factor (VS Code's window zoom). */
  zoom: number;
  /** Code font size in px at 100% zoom: editor and console input; output is 1px smaller. */
  fontSize: number;
  /** Format the open file with Black when saving (Mod+S). */
  formatOnSave: boolean;
  /** Format the open file with Black before running it. */
  formatOnRun: boolean;
  /** Black's line length. */
  lineLength: number;
  /** Optional packages the user added; they install in the background on each start. */
  extraPackages: string[];
}

/** localStorage key; also read by the inline script in index.html (zoom before first paint). */
export const SETTINGS_KEY = "qisplay:settings";

export const DEFAULT_SETTINGS: Settings = {
  zoom: 1,
  fontSize: 14,
  formatOnSave: false,
  formatOnRun: false,
  lineLength: 88,
  extraPackages: [],
};

export const ZOOM = { min: 0.5, max: 2, step: 0.1 };
export const FONT_SIZE = { min: 8, max: 32 };
/** Black's default is 88; the others are common house styles. */
export const LINE_LENGTHS = [79, 88, 100, 120];

export interface SettingsValue extends Settings {
  zoomBy(steps: number): void;
  fontSizeBy(px: number): void;
  set<K extends "formatOnSave" | "formatOnRun" | "lineLength">(key: K, value: Settings[K]): void;
  /** Adds or removes an optional package. */
  setExtraPackage(id: string, on: boolean): void;
  reset(key: keyof Settings): void;
}

export const SettingsContext = createContext<SettingsValue | null>(null);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings needs <SettingsProvider>");
  return ctx;
}

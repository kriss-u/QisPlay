import { createContext, useContext } from "react";

/** View settings, saved in localStorage (like VS Code's user settings). */
export interface Settings {
  /** Whole-app zoom factor (VS Code's window zoom). */
  zoom: number;
  /** Code font size in px at 100% zoom: editor and console input; output is 1px smaller. */
  fontSize: number;
}

/** localStorage key; also read by the inline script in index.html (zoom before first paint). */
export const SETTINGS_KEY = "qisplay:settings";

export const DEFAULT_SETTINGS: Settings = { zoom: 1, fontSize: 14 };

export const ZOOM = { min: 0.5, max: 2, step: 0.1 };
export const FONT_SIZE = { min: 8, max: 32 };

export interface SettingsValue extends Settings {
  zoomBy(steps: number): void;
  fontSizeBy(px: number): void;
  reset(key: keyof Settings): void;
}

export const SettingsContext = createContext<SettingsValue | null>(null);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings needs <SettingsProvider>");
  return ctx;
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, FONT_SIZE, SETTINGS_KEY, SettingsContext, ZOOM, type Settings } from "./settings";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function sanitize(s: Partial<Settings>): Settings {
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    zoom: clamp(Math.round(num(s.zoom, DEFAULT_SETTINGS.zoom) * 10) / 10, ZOOM.min, ZOOM.max),
    fontSize: clamp(Math.round(num(s.fontSize, DEFAULT_SETTINGS.fontSize)), FONT_SIZE.min, FONT_SIZE.max),
    formatOnSave: s.formatOnSave === true,
    formatOnRun: s.formatOnRun === true,
    lineLength: clamp(Math.round(num(s.lineLength, DEFAULT_SETTINGS.lineLength)), 40, 200),
    extraPackages: Array.isArray(s.extraPackages) ? [...new Set(s.extraPackages.filter((t) => typeof t === "string"))] : [],
  };
}

/** What every session used to load. Returning users keep these; the user can remove them in Packages. */
const LEGACY_PACKAGES = ["sympy", "pandas", "qiskit-algorithms", "qiskit-qasm3-import", "qiskit-ibm-runtime", "qisdebug"];

function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>;
    // Settings saved before optional packages existed (any earlier visit writes them): keep those packages.
    const returning = Object.keys(saved).length > 0 && !("extraPackages" in saved);
    return sanitize(returning ? { ...saved, extraPackages: LEGACY_PACKAGES } : saved);
  } catch {
    return DEFAULT_SETTINGS; // storage blocked or bad JSON
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readSettings);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Not persisted; still applies for this session.
    }
  }, [settings]);

  // Zoom scales the root font size, which every rem-based Chakra size follows.
  useEffect(() => {
    document.documentElement.style.fontSize = settings.zoom === 1 ? "" : `${settings.zoom * 100}%`;
  }, [settings.zoom]);

  const value = useMemo(
    () => ({
      ...settings,
      zoomBy: (steps: number) => setSettings((s) => sanitize({ ...s, zoom: s.zoom + steps * ZOOM.step })),
      fontSizeBy: (px: number) => setSettings((s) => sanitize({ ...s, fontSize: s.fontSize + px })),
      set: (key: "formatOnSave" | "formatOnRun" | "lineLength", value: boolean | number) =>
        setSettings((s) => sanitize({ ...s, [key]: value })),
      setExtraPackage: (id: string, on: boolean) =>
        setSettings((s) => ({ ...s, extraPackages: [...s.extraPackages.filter((t) => t !== id), ...(on ? [id] : [])] })),
      reset: (key: keyof Settings) => setSettings((s) => ({ ...s, [key]: DEFAULT_SETTINGS[key] })),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

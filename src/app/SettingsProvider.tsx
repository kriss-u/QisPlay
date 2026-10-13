import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, FONT_SIZE, SETTINGS_KEY, SettingsContext, ZOOM, type Settings } from "./settings";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function sanitize(s: Partial<Settings>): Settings {
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    zoom: clamp(Math.round(num(s.zoom, DEFAULT_SETTINGS.zoom) * 10) / 10, ZOOM.min, ZOOM.max),
    fontSize: clamp(Math.round(num(s.fontSize, DEFAULT_SETTINGS.fontSize)), FONT_SIZE.min, FONT_SIZE.max),
  };
}

function readSettings(): Settings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"));
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
      reset: (key: keyof Settings) => setSettings((s) => ({ ...s, [key]: DEFAULT_SETTINGS[key] })),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

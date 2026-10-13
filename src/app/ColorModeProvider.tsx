import { useEffect, useMemo, useState, type ReactNode } from "react";
import { COLOR_MODE_KEY, ColorModeContext, type ColorModeSetting } from "./colorMode";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readSetting(): ColorModeSetting {
  try {
    const v = localStorage.getItem(COLOR_MODE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Storage blocked: fall back to the system preference.
  }
  return "system";
}

/** Light/dark mode via a class on <html>, which is what Chakra's tokens key off. */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [setting, setSetting] = useState<ColorModeSetting>(readSetting);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const m = media();
    const onChange = () => setSystemDark(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  const colorMode = setting === "system" ? (systemDark ? "dark" : "light") : setting;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", colorMode === "dark");
    root.classList.toggle("light", colorMode === "light");
    root.style.colorScheme = colorMode;
  }, [colorMode]);

  const value = useMemo(
    () => ({
      setting,
      colorMode,
      setColorMode(mode: ColorModeSetting) {
        setSetting(mode);
        try {
          localStorage.setItem(COLOR_MODE_KEY, mode);
        } catch {
          // Not persisted; still applies for this session.
        }
      },
    }),
    [setting, colorMode],
  ) satisfies { colorMode: "light" | "dark" };

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

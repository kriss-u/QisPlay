import { createContext, useContext } from "react";

export type ColorModeSetting = "light" | "dark" | "system";

/** localStorage key; also read by the inline script in index.html (avoids a flash). */
export const COLOR_MODE_KEY = "qisplay:color-mode";

export interface ColorModeValue {
  setting: ColorModeSetting;
  colorMode: "light" | "dark";
  setColorMode(mode: ColorModeSetting): void;
}

export const ColorModeContext = createContext<ColorModeValue | null>(null);

export function useColorMode() {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode needs <ColorModeProvider>");
  return ctx;
}

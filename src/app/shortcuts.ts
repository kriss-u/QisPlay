// Keyboard shortcuts written once as "Mod+Shift+P" and shown per platform:
// "⌘⇧P" on macOS, "Ctrl+Shift+P" elsewhere. "Mod" is ⌘ on macOS and Ctrl elsewhere.

export const isMac =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent,
  );

export const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

/**
 * Command palette keys. Firefox reserves Ctrl/Cmd+Shift+P (new private window)
 * and never lets pages see it, so there F1 (VS Code's alternative) is primary.
 */
export const PALETTE_KEYS = isFirefox ? "F1" : "Mod+Shift+p";

/**
 * VS Code's Format Document is ⇧⌥F, which macOS reserves for typing symbols, so
 * macOS uses ⌃⇧F here (VS Code's own is Search there, which QisPlay doesn't have).
 */
export const FORMAT_KEYS: Keys = { mac: "Ctrl+Shift+f", other: "Shift+Alt+f" };

/** A shortcut, optionally different on macOS (VS Code does this for a few commands). */
export type Keys = string | { mac: string; other: string };

export const resolveKeys = (keys: Keys) => (typeof keys === "string" ? keys : isMac ? keys.mac : keys.other);

const MAC_SYMBOLS: Record<string, string> = {
  Mod: "⌘",
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Enter: "↩",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "⇞",
  PageDown: "⇟",
};
const OTHER_NAMES: Record<string, string> = {
  Mod: "Ctrl",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "PgUp",
  PageDown: "PgDn",
};

/** Display parts for <Kbd>: ["⌘", "⇧", "P"] or ["Ctrl", "Shift", "P"]. */
export function keyLabels(keys: Keys): string[] {
  return resolveKeys(keys)
    .split("+")
    .map((k) => (isMac ? MAC_SYMBOLS[k] : OTHER_NAMES[k]) ?? (k.length === 1 ? k.toUpperCase() : k));
}

export function formatKeys(keys: Keys) {
  return keyLabels(keys).join(isMac ? "" : "+");
}

// Physical key codes, so shortcuts survive ⌥ on macOS turning "n" into "˜".
function keyFromCode(code: string) {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  const named: Record<string, string> = {
    Backquote: "`",
    Slash: "/",
    Comma: ",",
    Period: ".",
    Equal: "=",
    Minus: "-",
  };
  return named[code] ?? code; // F5, Enter, PageDown, ArrowRight, ...
}

export function matches(keys: Keys, e: KeyboardEvent) {
  const parts = resolveKeys(keys).split("+");
  const key = parts[parts.length - 1];
  const want = new Set(parts.slice(0, -1));
  // Off macOS, "Ctrl" and "Mod" are the same key. On macOS, Mod is ⌘ and Ctrl is ⌃.
  const wantMod = want.has("Mod") || (!isMac && want.has("Ctrl"));
  const wantMacCtrl = isMac && want.has("Ctrl");
  // Punctuation also matches by character, for layouts where "=" or "-" sit elsewhere.
  const byChar = key.length === 1 && !/[a-z0-9]/i.test(key) && e.key === key;
  return (
    (byChar || keyFromCode(e.code).toLowerCase() === key.toLowerCase()) &&
    (isMac ? e.metaKey : e.ctrlKey) === wantMod &&
    (!isMac || e.ctrlKey === wantMacCtrl) &&
    e.shiftKey === want.has("Shift") &&
    e.altKey === want.has("Alt")
  );
}

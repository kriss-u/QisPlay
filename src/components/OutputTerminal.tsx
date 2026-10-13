import { Box } from "@chakra-ui/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useColorMode } from "../app/colorMode";
import { terminalTheme } from "../app/editorThemes";
import { useSettings } from "../app/settings";
import { MONO_FONT } from "../app/system";

export type Stream = "stdout" | "stderr" | "info" | "input";

export interface OutputTerminalHandle {
  write(text: string, stream: Stream): void;
  clear(): void;
}

const COLOR: Record<Stream, string> = { stdout: "", stderr: "\x1b[31m", info: "\x1b[36m", input: "\x1b[35m" };
const RESET = "\x1b[0m";

// Read-only xterm: stdin is disabled and nothing typed here reaches Python.
export const OutputTerminal = forwardRef<OutputTerminalHandle, { label?: string }>(function OutputTerminal(
  { label = "Program output" },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const { colorMode } = useColorMode();
  const theme = terminalTheme[colorMode];
  const { fontSize: codeSize, zoom } = useSettings();
  const fontSize = Math.round((codeSize - 1) * zoom * 2) / 2; // output is a touch smaller than the editor
  const fontSizeRef = useRef(fontSize);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const t = new Terminal({
      disableStdin: true,
      convertEol: true,
      cursorBlink: false,
      scrollback: 10000,
      fontFamily: MONO_FONT,
      fontSize: fontSizeRef.current,
      screenReaderMode: false,
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    fitRef.current = fit;
    t.write("\x1b[?25l"); // hide cursor: this is an output view, not a shell
    term.current = t; // writes before open() are buffered

    // xterm measures the cell size on open(), so wait for the web font first.
    let disposed = false;
    let opened = false;
    const el = host.current!;
    void document.fonts
      .load(`${fontSizeRef.current}px ${MONO_FONT}`)
      .catch(() => {})
      .then(() => {
        if (disposed) return;
        t.open(el);
        t.textarea?.setAttribute("aria-label", label);
        opened = true;
        fit.fit();
      });

    const observer = new ResizeObserver(() => {
      if (opened && el.offsetParent) fit.fit(); // skip while hidden (e.g. inactive tab)
    });
    observer.observe(el);
    return () => {
      disposed = true;
      observer.disconnect();
      t.dispose();
      term.current = null;
    };
  }, [label]);

  useEffect(() => {
    if (term.current) term.current.options.theme = theme;
  }, [theme]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
    const t = term.current;
    if (!t || t.options.fontSize === fontSize) return;
    t.options.fontSize = fontSize;
    if (host.current?.offsetParent && t.element) fitRef.current?.fit();
  }, [fontSize]);

  useImperativeHandle(ref, () => ({
    write(text, stream) {
      const color = COLOR[stream];
      term.current?.write(color ? `${color}${text}${RESET}` : text);
    },
    clear() {
      term.current?.reset();
      term.current?.write("\x1b[?25l");
    },
  }));

  return <Box ref={host} h="100%" w="100%" px="2" py="1" style={{ background: theme.background }} />;
});

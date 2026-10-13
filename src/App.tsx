import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Menu,
  Popover,
  Portal,
  Spinner,
  Splitter,
  Tabs,
  Text,
  Wrap,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuChevronUp, LuCircleHelp, LuMonitor, LuMoon, LuPackage, LuPlay, LuSquare, LuSun } from "react-icons/lu";
import { APP_NAME } from "./app/brand";
import { useColorMode, type ColorModeSetting } from "./app/colorMode";
import { formatKeys, matches } from "./app/shortcuts";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { ConsolePanel, type ConsoleHandle } from "./components/ConsolePanel";
import { EditorPane } from "./components/EditorPane";
import { FileExplorer } from "./components/FileExplorer";
import { Logo } from "./components/Logo";
import { OutputTerminal, type OutputTerminalHandle } from "./components/OutputTerminal";
import { ProjectMenu } from "./components/ProjectMenu";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { showError, toaster } from "./components/toast";
import { useFileActions } from "./components/useFileActions";
import { EXAMPLES } from "./examples";
import type { ProjectFiles } from "./python/protocol";
import { usePython, type OutputSink, type RunResult } from "./python/usePython";
import { isPython } from "./workspace/paths";
import { useWorkspace } from "./workspace/useWorkspace";
import { exportProject, importProject } from "./components/projectArchiveActions";
import { writeFile } from "./workspace/workspace";

const STATE_COLOR = { loading: "yellow", ready: "green", running: "blue", error: "red" } as const;
const DEFAULT_SIZES = [18, 46, 36];
const THEME_ICONS: Record<ColorModeSetting, React.ReactNode> = {
  light: <LuSun />,
  dark: <LuMoon />,
  system: <LuMonitor />,
};

export default function App() {
  const ws = useWorkspace();
  const fileActions = useFileActions(ws);
  const { setting: themeSetting, setColorMode } = useColorMode();
  const output = useRef<OutputTerminalHandle>(null);
  const console_ = useRef<ConsoleHandle>(null);
  const sink = useMemo<OutputSink>(
    () => ({
      write: (text, stream, target) =>
        target === "console" ? console_.current?.write(text, stream) : output.current?.write(text, stream),
    }),
    [],
  );
  const py = usePython(sink);
  const [panelTab, setPanelTab] = useState("output");
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const lastSizes = useRef(DEFAULT_SIZES);
  const [palette, setPalette] = useState<"files" | "commands" | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [figuresOpen, setFiguresOpen] = useState(true);

  const entry = ws.active && isPython(ws.active) ? ws.active : null;
  const canRun = py.state === "ready" && entry !== null;

  /** The project as the worker needs it, including unsaved editor buffers. */
  const snapshot = useCallback((): ProjectFiles => {
    const files: ProjectFiles = { files: {}, dirs: [] };
    for (const f of ws.files) {
      if (f.kind === "dir") files.dirs.push(f.path);
      else files.files[f.path] = ws.contentOf(f);
    }
    return files;
  }, [ws]);

  /** Keep what code wrote (e.g. results.csv, plot.png) in the project. */
  const keepChangedFiles = useCallback(
    async (result: RunResult | null, report: (msg: string) => void) => {
      const project = ws.project;
      if (!result || !project) return;
      const changed = Object.keys(result.changed);
      for (const path of changed) {
        try {
          await writeFile(project.id, path, result.changed[path]);
        } catch (err) {
          showError(err);
        }
      }
      if (changed.length) {
        ws.applyExternalChanges(result.changed);
        report(`[saved to project: ${changed.join(", ")}]\n`);
      }
    },
    [ws],
  );

  const showPanel = useCallback(() => {
    setSizes((s) => (s[2] > 0 ? s : [s[0], Math.max(25, s[1] - (lastSizes.current[2] || 36)), lastSizes.current[2] || 36]));
  }, []);

  const onRun = useCallback(async () => {
    if (!ws.project || py.state !== "ready") return;
    if (!entry) {
      toaster.create({ type: "info", title: "Open a .py file to run it" });
      return;
    }
    await ws.flush();
    showPanel();
    setPanelTab("output");
    output.current?.clear();
    output.current?.write(`$ python ${entry}\n`, "info");
    const result = await py.run(entry, snapshot());
    await keepChangedFiles(result, (m) => output.current?.write(m, "info"));
  }, [ws, py, entry, snapshot, keepChangedFiles, showPanel]);

  const runInConsole = useCallback(
    async (source: string) => {
      const result = await py.runConsole(source, snapshot());
      await keepChangedFiles(result, (m) => console_.current?.write(m, "info"));
    },
    [py, snapshot, keepChangedFiles],
  );

  /** Shift+Enter in the editor: run the selection in the console, like VS Code. */
  const sendToConsole = useCallback(
    (code: string) => {
      if (py.state !== "ready") return;
      showPanel();
      setPanelTab("console");
      void console_.current?.submit(code);
    },
    [py.state, showPanel],
  );

  const toggle = useCallback((index: 0 | 2) => {
    setSizes((s) => {
      const next = [...s];
      if (s[index] > 0) {
        lastSizes.current = s;
        next[1] += s[index];
        next[index] = 0;
      } else {
        const restore = lastSizes.current[index] || DEFAULT_SIZES[index];
        next[index] = restore;
        next[1] = Math.max(25, next[1] - restore);
      }
      return next;
    });
  }, []);

  const cycleTab = useCallback(
    (dir: 1 | -1) => {
      if (!ws.tabs.length) return;
      const i = ws.active ? ws.tabs.indexOf(ws.active) : -1;
      ws.setActive(ws.tabs[(i + dir + ws.tabs.length) % ws.tabs.length]);
    },
    [ws],
  );

  // One list drives the global shortcuts, the command palette and the help dialog.
  const commands: (Command & { alsoKeys?: string[] })[] = [
    { id: "run", title: "Run Python file", keys: "Mod+Enter", alsoKeys: ["F5"], run: () => void onRun() },
    { id: "stop", title: "Stop running code", keys: "Shift+F5", run: py.stop, enabled: py.state === "running" },
    {
      id: "save",
      title: "Save",
      keys: "Mod+s",
      run: () => void ws.flush().then(() => toaster.create({ type: "success", title: "Saved", duration: 1200 })),
    },
    { id: "quick-open", title: "Go to file…", keys: "Mod+p", run: () => setPalette("files") },
    { id: "palette", title: "Show all commands", keys: "Mod+Shift+p", alsoKeys: ["F1"], run: () => setPalette("commands") },
    { id: "sidebar", title: "Toggle file explorer", keys: "Mod+b", run: () => toggle(0) },
    { id: "panel", title: "Toggle output panel", keys: "Mod+j", run: () => toggle(2) },
    {
      id: "console",
      title: "Focus Python console",
      keys: "Ctrl+`",
      run: () => {
        showPanel();
        setPanelTab("console");
        setTimeout(() => console_.current?.focus(), 50);
      },
    },
    { id: "new-file", title: "New file…", keys: "Alt+n", run: () => void fileActions.create("", "file") },
    { id: "new-folder", title: "New folder…", run: () => void fileActions.create("", "dir") },
    ...EXAMPLES.map((ex, i) => ({
      id: `example-${i}`,
      title: `Add example: ${ex.name}`,
      run: () => void fileActions.addExample(i),
    })),
    { id: "close-tab", title: "Close editor tab", keys: "Alt+w", run: () => ws.active && ws.closeTab(ws.active) },
    {
      id: "next-tab",
      title: "Next editor tab",
      keys: { mac: "Mod+Alt+ArrowRight", other: "Ctrl+PageDown" },
      run: () => cycleTab(1),
    },
    {
      id: "prev-tab",
      title: "Previous editor tab",
      keys: { mac: "Mod+Alt+ArrowLeft", other: "Ctrl+PageUp" },
      run: () => cycleTab(-1),
    },
    {
      id: "clear",
      title: "Clear output / console",
      keys: "Mod+l",
      run: () => {
        if (panelTab === "console") console_.current?.clear();
        else {
          output.current?.clear();
          py.setFigures([]);
        }
      },
    },
    { id: "zip", title: "Download project as .zip", run: () => void exportProject(ws) },
    { id: "import", title: "Open project from .zip…", run: () => void importProject(ws) },
    { id: "theme-light", title: "Theme: Light", run: () => setColorMode("light") },
    { id: "theme-dark", title: "Theme: Dark", run: () => setColorMode("dark") },
    { id: "theme-system", title: "Theme: Match system", run: () => setColorMode("system") },
    { id: "shortcuts", title: "Keyboard shortcuts", run: () => setShowShortcuts(true) },
  ];
  const commandsRef = useRef(commands);
  useEffect(() => {
    commandsRef.current = commands;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return; // already handled (e.g. by the editor)
      for (const c of commandsRef.current) {
        if (c.enabled === false) continue;
        if ((c.keys && matches(c.keys, e)) || c.alsoKeys?.some((k) => matches(k, e))) {
          e.preventDefault();
          c.run();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.title = ws.project ? `${ws.project.name} — ${APP_NAME}` : APP_NAME;
  }, [ws.project]);

  return (
    <Flex direction="column" h="100dvh" bg="bg" color="fg">
      <Flex as="header" align="center" gap="3" px="3" py="2" borderBottomWidth="1px" wrap="wrap">
        <HStack gap="2">
          <Logo size={26} />
          <Text fontWeight="bold" fontSize="lg" letterSpacing="tight">
            {APP_NAME}
          </Text>
        </HStack>
        <ProjectMenu ws={ws} />

        <HStack gap="2">
          <Button
            size="sm"
            colorPalette="green"
            onClick={() => void onRun()}
            disabled={!canRun}
            title={entry ? `Run ${entry} (${formatKeys("Mod+Enter")} or F5)` : "Open a .py file to run it"}
          >
            <LuPlay /> Run{entry ? ` ${entry.split("/").pop()}` : ""}
          </Button>
          <Button
            size="sm"
            colorPalette="red"
            variant="outline"
            onClick={py.stop}
            disabled={py.state !== "running"}
            title={`Stop (${formatKeys("Shift+F5")})`}
          >
            <LuSquare /> Stop
          </Button>
        </HStack>

        <HStack ms="auto" gap="1">
          {(py.state === "loading" || py.state === "running") && <Spinner size="xs" me="1" />}
          {py.state === "loading" && (
            <Text fontSize="sm" color="fg.muted" maxW="320px" truncate me="2">
              {py.status}
            </Text>
          )}
          <Popover.Root positioning={{ placement: "bottom-end" }}>
            <Popover.Trigger asChild>
              <Button size="xs" variant="ghost" disabled={py.state === "loading"}>
                <LuPackage /> Packages
              </Button>
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <Popover.Content width="sm">
                  <Popover.Arrow />
                  <Popover.Body>
                    <Text fontSize="sm" mb="2" color="fg.muted">
                      Available in this runtime (no other packages can be installed):
                    </Text>
                    <Wrap gap="1.5">
                      {Object.entries(py.packages).map(([name, v]) => (
                        <Badge key={name} variant="subtle" fontFamily="mono">
                          {name} {v}
                        </Badge>
                      ))}
                      {py.missing.map((name) => (
                        <Badge key={name} colorPalette="orange" variant="outline" fontFamily="mono">
                          {name} — not installed
                        </Badge>
                      ))}
                    </Wrap>
                  </Popover.Body>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>

          <Menu.Root onSelect={({ value }) => setColorMode(value as ColorModeSetting)}>
            <Menu.Trigger asChild>
              <IconButton size="xs" variant="ghost" aria-label="Color theme" title="Color theme">
                {THEME_ICONS[themeSetting]}
              </IconButton>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content>
                  <Menu.RadioItemGroup value={themeSetting}>
                    <Menu.RadioItem value="light">
                      <LuSun /> Light
                      <Menu.ItemIndicator />
                    </Menu.RadioItem>
                    <Menu.RadioItem value="dark">
                      <LuMoon /> Dark
                      <Menu.ItemIndicator />
                    </Menu.RadioItem>
                    <Menu.RadioItem value="system">
                      <LuMonitor /> Match system
                      <Menu.ItemIndicator />
                    </Menu.RadioItem>
                  </Menu.RadioItemGroup>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>

          <IconButton
            size="xs"
            variant="ghost"
            aria-label="Keyboard shortcuts"
            title={`Keyboard shortcuts · all commands: ${formatKeys("Mod+Shift+p")}`}
            onClick={() => setShowShortcuts(true)}
          >
            <LuCircleHelp />
          </IconButton>
          <Badge colorPalette={STATE_COLOR[py.state]} variant="solid" ms="1">
            {py.state}
          </Badge>
        </HStack>
      </Flex>

      <Splitter.Root
        flex="1"
        minH="0"
        panels={[
          { id: "files", minSize: 10, collapsible: true, collapsedSize: 0 },
          { id: "editor", minSize: 25 },
          { id: "output", minSize: 18, collapsible: true, collapsedSize: 0 },
        ]}
        size={sizes}
        onResize={(d) => setSizes(d.size)}
        borderWidth="0"
      >
        <Splitter.Panel id="files">
          <FileExplorer ws={ws} />
        </Splitter.Panel>
        <Splitter.ResizeTrigger id="files:editor" aria-label="Resize file explorer" />
        <Splitter.Panel id="editor">
          <EditorPane ws={ws} onRun={() => void onRun()} onRunSelection={sendToConsole} complete={py.complete} />
        </Splitter.Panel>
        <Splitter.ResizeTrigger id="editor:output" aria-label="Resize output panel" />
        <Splitter.Panel id="output">
          <Flex direction="column" h="100%" minW="0">
            <Tabs.Root
              value={panelTab}
              onValueChange={(e) => setPanelTab(e.value)}
              size="sm"
              variant="line"
              display="flex"
              flexDirection="column"
              flex="1"
              minH="0"
            >
              <Tabs.List h="9" flexShrink={0} bg="bg.subtle" px="2">
                <Tabs.Trigger value="output">Output</Tabs.Trigger>
                <Tabs.Trigger value="console">Console</Tabs.Trigger>
                <Button
                  size="2xs"
                  variant="ghost"
                  ms="auto"
                  alignSelf="center"
                  hidden={panelTab !== "output"}
                  onClick={() => {
                    output.current?.clear();
                    py.setFigures([]);
                  }}
                >
                  Clear
                </Button>
              </Tabs.List>
              {/* Both stay mounted so terminals keep their scrollback. */}
              <Tabs.Content value="output" flex="1" minH="0" p="0" _hidden={{ display: "none" }}>
                <OutputTerminal ref={output} label="Program output" />
              </Tabs.Content>
              <Tabs.Content value="console" flex="1" minH="0" p="0" _hidden={{ display: "none" }}>
                <ConsolePanel
                  ref={console_}
                  ready={py.state === "ready" || py.state === "running"}
                  busy={py.state === "running"}
                  execute={runInConsole}
                  isComplete={py.isComplete}
                  onReset={py.resetConsole}
                />
              </Tabs.Content>
            </Tabs.Root>
            {py.figures.length > 0 && (
              <Flex direction="column" h={figuresOpen ? "45%" : "auto"} flexShrink={0} borderTopWidth="1px" minH="0">
                <Flex align="center" h="8" px="3" gap="1" bg="bg.subtle" flexShrink={0}>
                  <Button
                    size="2xs"
                    variant="ghost"
                    onClick={() => setFiguresOpen((o) => !o)}
                    aria-expanded={figuresOpen}
                    aria-controls="figures-panel"
                  >
                    {figuresOpen ? <LuChevronDown /> : <LuChevronUp />}
                    Figures ({py.figures.length})
                  </Button>
                  <Button size="2xs" variant="ghost" ms="auto" onClick={() => py.setFigures([])}>
                    Clear
                  </Button>
                </Flex>
                {figuresOpen && (
                  <Box id="figures-panel" flex="1" minH="0" overflow="auto" p="3" bg="white">
                    <Flex gap="3" wrap="wrap">
                      {py.figures.map((png, i) => (
                        <Image key={i} src={`data:image/png;base64,${png}`} alt={`Figure ${i + 1}`} maxW="100%" />
                      ))}
                    </Flex>
                  </Box>
                )}
              </Flex>
            )}
          </Flex>
        </Splitter.Panel>
      </Splitter.Root>

      <Flex
        as="footer"
        align="center"
        gap="3"
        h="6"
        px="3"
        flexShrink={0}
        borderTopWidth="1px"
        bg="bg.subtle"
        color="fg.muted"
        fontSize="xs"
      >
        <Text truncate>
          {py.packages.python ? `Python ${py.packages.python}` : py.status}
          {ws.project ? ` · ${ws.project.name}` : ""}
        </Text>
        <Text ms="auto" flexShrink={0}>
          Made with{" "}
          <Box as="span" role="img" aria-label="love" color="red.500">
            ❤️
          </Box>{" "}
          by Krishna Upadhyay
        </Text>
      </Flex>

      <CommandPalette
        open={palette !== null}
        mode={palette ?? "files"}
        files={ws.files.filter((f) => f.kind === "file").map((f) => f.path)}
        commands={commands}
        onOpenFile={ws.openFile}
        onClose={() => setPalette(null)}
      />
      <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} commands={commands} />
    </Flex>
  );
}

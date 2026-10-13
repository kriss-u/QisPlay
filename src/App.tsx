import {
  Badge,
  Box,
  Button,
  Code,
  Dialog,
  Drawer,
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
  useBreakpointValue,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuDownload,
  LuCircleHelp,
  LuEllipsisVertical,
  LuMenu,
  LuMonitor,
  LuMoon,
  LuPackage,
  LuPlay,
  LuSettings,
  LuSignpost,
  LuSquare,
  LuSun,
} from "react-icons/lu";
import { APP_NAME } from "./app/brand";
import { useColorMode, type ColorModeSetting } from "./app/colorMode";
import { useSettings } from "./app/settings";
import { formatKeys, matches, PALETTE_KEYS } from "./app/shortcuts";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { ConsolePanel, type ConsoleHandle } from "./components/ConsolePanel";
import { EditorPane } from "./components/EditorPane";
import { FileExplorer } from "./components/FileExplorer";
import { Logo } from "./components/Logo";
import { OutputTerminal, type OutputTerminalHandle } from "./components/OutputTerminal";
import { ProjectMenu } from "./components/ProjectMenu";
import { SettingsDialog } from "./components/SettingsDialog";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { Walkthrough, type WalkthroughHandle } from "./components/Walkthrough";
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
/** Editor/output split when the explorer is a drawer (tablet: side by side, phone: stacked). */
const COMPACT_SIZES = [58, 42];
const THEME_ICONS: Record<ColorModeSetting, React.ReactNode> = {
  light: <LuSun />,
  dark: <LuMoon />,
  system: <LuMonitor />,
};

export default function App() {
  const ws = useWorkspace();
  const fileActions = useFileActions(ws);
  const { setting: themeSetting, setColorMode } = useColorMode();
  const settings = useSettings();
  const output = useRef<OutputTerminalHandle>(null);
  const console_ = useRef<ConsoleHandle>(null);
  const walkthrough = useRef<WalkthroughHandle>(null);
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
  const [compactSizes, setCompactSizes] = useState(COMPACT_SIZES);
  // Below lg the explorer becomes a drawer; below md the editor and output stack vertically.
  const compact = useBreakpointValue({ base: true, lg: false }, { ssr: false }) ?? false;
  const stacked = useBreakpointValue({ base: true, md: false }, { ssr: false }) ?? false;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showPackages, setShowPackages] = useState(false);
  const lastSizes = useRef(DEFAULT_SIZES);
  const [palette, setPalette] = useState<"files" | "commands" | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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
    setCompactSizes((s) => (s[1] > 0 ? s : COMPACT_SIZES));
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
    // Show the plots after a successful run; on failure stay on the traceback.
    if (result?.ok && result.figures > 0) setPanelTab("figures");
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

  /** Clears whichever panel tab is showing. */
  const clearPanel = () => {
    if (panelTab === "console") console_.current?.clear();
    else if (panelTab === "figures") py.setFigures([]);
    else output.current?.clear();
  };

  const toggle = useCallback((index: 0 | 2) => {
    if (compact) {
      if (index === 0) setDrawerOpen((o) => !o);
      else setCompactSizes((s) => (s[1] > 0 ? [100, 0] : COMPACT_SIZES));
      return;
    }
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
  }, [compact]);

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
    {
      id: "palette",
      title: "Show all commands",
      keys: PALETTE_KEYS,
      alsoKeys: ["F1", "Mod+Shift+p"],
      run: () => setPalette("commands"),
    },
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
      // Ctrl+PgDn / ⌘⌥→ switch browser tabs and can't be intercepted by pages.
      keys: { mac: "Ctrl+Alt+ArrowRight", other: "Alt+PageDown" },
      run: () => cycleTab(1),
    },
    {
      id: "prev-tab",
      title: "Previous editor tab",
      keys: { mac: "Ctrl+Alt+ArrowLeft", other: "Alt+PageUp" },
      run: () => cycleTab(-1),
    },
    {
      id: "clear",
      title: "Clear output / console / figures",
      keys: "Mod+l",
      run: clearPanel,
    },
    { id: "zip", title: "Download project as .zip", run: () => void exportProject(ws) },
    { id: "import", title: "Open project from .zip…", run: () => void importProject(ws) },
    { id: "settings", title: "Settings", keys: "Mod+,", run: () => setShowSettings(true) },
    // VS Code's window zoom. Overrides browser zoom so the editor and terminals scale too.
    {
      id: "zoom-in",
      title: "View: Zoom in",
      keys: "Mod+=",
      alsoKeys: ["Mod+Shift+=", "Mod+NumpadAdd"],
      run: () => settings.zoomBy(1),
    },
    { id: "zoom-out", title: "View: Zoom out", keys: "Mod+-", alsoKeys: ["Mod+NumpadSubtract"], run: () => settings.zoomBy(-1) },
    { id: "zoom-reset", title: "View: Reset zoom", keys: "Mod+0", alsoKeys: ["Mod+Numpad0"], run: () => settings.reset("zoom") },
    { id: "theme-light", title: "Theme: Light", run: () => setColorMode("light") },
    { id: "theme-dark", title: "Theme: Dark", run: () => setColorMode("dark") },
    { id: "theme-system", title: "Theme: Match system", run: () => setColorMode("system") },
    { id: "shortcuts", title: "Keyboard shortcuts", run: () => setShowShortcuts(true) },
    { id: "walkthrough", title: "Start walkthrough", run: () => walkthrough.current?.start() },
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

  // Mirror the project into Python's filesystem shortly after edits, so
  // autocomplete (and auto-import) sees other files' latest code.
  const { syncProject } = py;
  useEffect(() => {
    if (py.state !== "ready" || !ws.loaded) return;
    const timer = setTimeout(() => syncProject(snapshot()), 800);
    return () => clearTimeout(timer);
  }, [ws.files, ws.loaded, py.state, syncProject, snapshot]);

  useEffect(() => {
    document.title = ws.project ? `${ws.project.name} — ${APP_NAME}` : APP_NAME;
  }, [ws.project]);

  const busy = py.state === "loading" || py.state === "running";
  const packagesList = (
    <>
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
    </>
  );

  const editorPane = (
    <EditorPane ws={ws} onRun={() => void onRun()} onRunSelection={sendToConsole} complete={py.complete} />
  );
  const outputPane = (
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
          <Tabs.Trigger value="figures">
            Figures
            {py.figures.length > 0 && (
              <Badge size="xs" variant="solid" colorPalette="blue" ms="1" rounded="full">
                {py.figures.length}
              </Badge>
            )}
          </Tabs.Trigger>
          <Button size="2xs" variant="ghost" ms="auto" alignSelf="center" onClick={clearPanel}>
            Clear
          </Button>
        </Tabs.List>
        {/* Both stay mounted so terminals keep their scrollback. */}
        <Tabs.Content value="output" flex="1" minH="0" p="0" _hidden={{ display: "none" }}>
          <OutputTerminal ref={output} label="Program output" />
        </Tabs.Content>
        <Tabs.Content value="figures" flex="1" minH="0" p="0" overflow="auto" _hidden={{ display: "none" }}>
          {py.figures.length === 0 ? (
            <Text p="4" fontSize="sm" color="fg.muted">
              Plots from <Code>plt.show()</Code> or <Code>qc.draw("mpl")</Code> appear here.
            </Text>
          ) : (
            <Flex direction="column" gap="3" p="3">
              {py.figures.map((png, i) => (
                <Box key={i} position="relative" bg="white" rounded="md" borderWidth="1px" p="2">
                  <Image src={`data:image/png;base64,${png}`} alt={`Figure ${i + 1}`} maxW="100%" mx="auto" />
                  <IconButton
                    asChild
                    size="2xs"
                    variant="subtle"
                    position="absolute"
                    top="2"
                    right="2"
                    aria-label={`Download figure ${i + 1}`}
                    title="Download PNG"
                  >
                    <a href={`data:image/png;base64,${png}`} download={`figure-${i + 1}.png`}>
                      <LuDownload />
                    </a>
                  </IconButton>
                </Box>
              ))}
            </Flex>
          )}
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
    </Flex>
  );

  return (
    <Flex direction="column" h="100dvh" bg="bg" color="fg">
      <Flex as="header" align="center" gap={{ base: "1.5", md: "3" }} px={{ base: "2", md: "3" }} py="2" borderBottomWidth="1px" bg="bg.titlebar">
        {compact && (
          <IconButton size="sm" variant="ghost" aria-label="Show files" title="Files" onClick={() => setDrawerOpen(true)}>
            <LuMenu />
          </IconButton>
        )}
        <HStack gap="2" flexShrink={0}>
          <Logo size={26} />
          <Text fontWeight="bold" fontSize="lg" letterSpacing="tight" hideBelow="md">
            {APP_NAME}
          </Text>
        </HStack>
        <ProjectMenu ws={ws} />

        <HStack gap="2" data-tour="run">
          <Button
            size="sm"
            colorPalette="green"
            onClick={() => void onRun()}
            disabled={!canRun}
            title={entry ? `Run ${entry} (${formatKeys("Mod+Enter")} or F5)` : "Open a .py file to run it"}
          >
            {stacked && busy ? <Spinner size="xs" /> : <LuPlay />} Run
            {entry && (
              <Box as="span" hideBelow="md">
                {entry.split("/").pop()}
              </Box>
            )}
          </Button>
          <Button
            size="sm"
            colorPalette="red"
            variant="outline"
            onClick={py.stop}
            disabled={py.state !== "running"}
            title={`Stop (${formatKeys("Shift+F5")})`}
            aria-label="Stop"
          >
            <LuSquare />
            <Box as="span" hideBelow="md">
              Stop
            </Box>
          </Button>
        </HStack>

        {/* Phones: one overflow menu instead of the icon cluster. */}
        <Menu.Root
          positioning={{ placement: "bottom-end" }}
          onSelect={({ value }) => {
            if (value === "packages") setShowPackages(true);
            else if (value === "shortcuts") setShowShortcuts(true);
            else if (value === "settings") setShowSettings(true);
            else if (value === "walkthrough") walkthrough.current?.start();
          }}
        >
          <Menu.Trigger asChild>
            <IconButton size="sm" variant="ghost" ms="auto" hideFrom="md" aria-label="More" data-tour="more">
              <LuEllipsisVertical />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="14rem">
                <Menu.ItemGroup>
                  <Menu.ItemGroupLabel>Theme</Menu.ItemGroupLabel>
                  <Menu.RadioItemGroup
                    value={themeSetting}
                    onValueChange={(e) => setColorMode(e.value as ColorModeSetting)}
                  >
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
                </Menu.ItemGroup>
                <Menu.Separator />
                <Menu.Item value="packages" disabled={py.state === "loading"}>
                  <LuPackage /> Installed packages
                </Menu.Item>
                <Menu.Item value="settings">
                  <LuSettings /> Settings
                </Menu.Item>
                <Menu.Item value="shortcuts">
                  <LuCircleHelp /> Keyboard shortcuts
                </Menu.Item>
                <Menu.Item value="walkthrough">
                  <LuSignpost /> Start walkthrough
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>

        <HStack ms="auto" gap="1" hideBelow="md">
          {(py.state === "loading" || py.state === "running") && <Spinner size="xs" me="1" />}
          {py.state === "loading" && (
            <Text fontSize="sm" color="fg.muted" maxW="320px" truncate me="2">
              {py.status}
            </Text>
          )}
          <Popover.Root positioning={{ placement: "bottom-end" }}>
            <Popover.Trigger asChild>
              <Button size="xs" variant="ghost" disabled={py.state === "loading"} aria-label="Packages" data-tour="packages">
                <LuPackage />
                <Box as="span" hideBelow="md">
                  Packages
                </Box>
              </Button>
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <Popover.Content width="sm">
                  <Popover.Arrow />
                  <Popover.Body>
                    {packagesList}
                  </Popover.Body>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>

          <Menu.Root onSelect={({ value }) => setColorMode(value as ColorModeSetting)}>
            <Menu.Trigger asChild>
              <IconButton size="xs" variant="ghost" aria-label="Color theme" title="Color theme" data-tour="theme">
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
            aria-label="Settings"
            data-tour="settings"
            title={`Settings (${formatKeys("Mod+,")})`}
            onClick={() => setShowSettings(true)}
          >
            <LuSettings />
          </IconButton>
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="Keyboard shortcuts"
            data-tour="help"
            hideBelow="md"
            title={`Keyboard shortcuts · all commands: ${formatKeys(PALETTE_KEYS)}`}
            onClick={() => setShowShortcuts(true)}
          >
            <LuCircleHelp />
          </IconButton>
          <Badge colorPalette={STATE_COLOR[py.state]} variant="solid" ms="1" data-tour="status">
            {py.state}
          </Badge>
        </HStack>
      </Flex>

      {compact ? (
        <Splitter.Root
          key={stacked ? "stacked" : "side"}
          flex="1"
          minH="0"
          orientation={stacked ? "vertical" : "horizontal"}
          panels={[
            { id: "editor", minSize: 15 },
            { id: "output", minSize: 12, collapsible: true, collapsedSize: 0 },
          ]}
          size={compactSizes}
          onResize={(d) => setCompactSizes(d.size)}
          borderWidth="0"
        >
          {/* Each pane scrolls on its own; drag the divider to resize. */}
          <Splitter.Panel id="editor" data-tour="editor" minH="0">
            {editorPane}
          </Splitter.Panel>
          <Splitter.ResizeTrigger id="editor:output" aria-label="Resize editor and output" />
          <Splitter.Panel id="output" data-tour="panel" minH="0">
            {outputPane}
          </Splitter.Panel>
        </Splitter.Root>
      ) : (
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
          <Splitter.Panel id="files" data-tour="explorer">
            <FileExplorer ws={ws} />
          </Splitter.Panel>
          <Splitter.ResizeTrigger id="files:editor" aria-label="Resize file explorer" />
          <Splitter.Panel id="editor" data-tour="editor">
            {editorPane}
          </Splitter.Panel>
          <Splitter.ResizeTrigger id="editor:output" aria-label="Resize output panel" />
          <Splitter.Panel id="output" data-tour="panel">
            {outputPane}
          </Splitter.Panel>
        </Splitter.Root>
      )}

      {compact && (
        <Drawer.Root open={drawerOpen} onOpenChange={(e) => setDrawerOpen(e.open)} placement="start" size="xs">
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content>
                <Drawer.Title srOnly>Files</Drawer.Title>
                <Drawer.Body p="0" display="flex" flexDirection="column">
                  <FileExplorer ws={ws} onOpenFile={() => setDrawerOpen(false)} />
                </Drawer.Body>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
      )}

      <Flex
        as="footer"
        align="center"
        gap="3"
        h="6"
        px="3"
        flexShrink={0}
        bg="bg.statusbar"
        color="fg.statusbar"
        fontSize="xs"
      >
        <Text truncate hideBelow="md">
          {py.packages.python ? `Python ${py.packages.python}` : py.status}
          {ws.project ? ` · ${ws.project.name}` : ""}
        </Text>
        <Text ms="auto" flexShrink={0}>
          Made with{" "}
          <Box as="span" role="img" aria-label="love">
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
      <Dialog.Root open={showPackages} onOpenChange={(e) => setShowPackages(e.open)} size="sm" placement="center">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content mx="4">
              <Dialog.Header>
                <Dialog.Title>Installed packages</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body pb="6">{packagesList}</Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <Walkthrough ref={walkthrough} ready={ws.loaded} />
      <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} commands={commands} />
    </Flex>
  );
}

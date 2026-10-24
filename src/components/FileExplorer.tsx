import { Box, Flex, IconButton, Menu, Portal, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { LuBookOpen, LuChevronDown, LuChevronRight, LuEllipsis, LuFilePlus, LuFolderPlus } from "react-icons/lu";
import { EXAMPLES } from "../examples";
import type { FileEntry } from "../workspace/db";
import { isMac, matches, type Keys } from "../app/shortcuts";
import { basename, dirname, isInside } from "../workspace/paths";
import { ContextMenu, MenuItems, type MenuEntry } from "./ContextMenu";
import { FileIcon } from "./FileIcon";
import { NewEntryRow } from "./NewEntryRow";
import { showError } from "./toast";
import type { Workspace } from "../workspace/useWorkspace";
import { useFileActions } from "./useFileActions";

interface Node {
  entry: FileEntry;
  children: Node[];
}

function buildTree(files: FileEntry[]): Node[] {
  const nodes = new Map<string, Node>(files.map((f) => [f.path, { entry: f, children: [] }]));
  const roots: Node[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(dirname(node.entry.path));
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: Node[]) => {
    list.sort(
      (a, b) =>
        Number(b.entry.kind === "dir") - Number(a.entry.kind === "dir") ||
        basename(a.entry.path).localeCompare(basename(b.entry.path)),
    );
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

// VS Code's explorer keys: Delete, or ⌘⌫ on macOS.
const DELETE_KEYS: Keys = { mac: "Mod+Backspace", other: "Delete" };

/** Hold to copy instead of move while dragging, as in VS Code. */
const copyModifier = (e: DragEvent) => (isMac ? e.altKey : e.ctrlKey);

/** A folder can't go into itself; a move into its own folder does nothing. */
const canDrop = (from: string, folder: string, copying: boolean) =>
  folder !== from && !isInside(folder, from) && (copying || dirname(from) !== folder);

/** A pending new file/folder. `parent` null means "where the selection is", as in VS Code. */
export interface Creating {
  parent: string | null;
  kind: "file" | "dir";
}

export function FileExplorer({
  ws,
  creating,
  onCreate,
  onEndCreate,
  onOpenFile,
}: {
  ws: Workspace;
  creating: Creating | null;
  onCreate: (parent: string | null, kind: "file" | "dir") => void;
  onEndCreate: () => void;
  onOpenFile?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(ws.files), [ws.files]);
  const toggle = (path: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const { checkNew, create, rename, move, copy, remove, addExample } = useFileActions(ws, (parent) =>
    setCollapsed((c) => new Set([...c].filter((p) => p !== parent))),
  );

  // The row that cut/copy/paste act on: the last one clicked, until another
  // file is opened (e.g. from a tab), then the open file, as in VS Code.
  const [picked, setPicked] = useState<{ path: string; whileActive: string | null } | null>(null);
  const current = picked && picked.whileActive === ws.active ? picked.path : ws.active;
  const pick = (path: string, opened = false) => setPicked({ path, whileActive: opened ? path : ws.active });

  // The folder a pending new entry goes in: the selected folder, or the selected file's folder.
  const selectedEntry = current ? ws.fileMap.get(current) : undefined;
  const createIn = !creating
    ? null
    : (creating.parent ?? (!selectedEntry ? "" : selectedEntry.kind === "dir" ? selectedEntry.path : dirname(selectedEntry.path)));
  const treeRef = useRef<HTMLDivElement>(null);

  const newEntryRow = (depth: number) =>
    creating && (
      <NewEntryRow
        key="new-entry"
        kind={creating.kind}
        depth={depth}
        validate={(v) => checkNew(createIn ?? "", v)}
        onCancel={(refocus) => {
          onEndCreate();
          if (refocus) treeRef.current?.focus();
        }}
        onSubmit={(v) => {
          onEndCreate();
          treeRef.current?.focus();
          void create(createIn ?? "", creating.kind, v).then((path) => {
            if (!path) return;
            pick(path, creating.kind === "file");
            if (creating.kind === "file") onOpenFile?.(); // e.g. close the mobile drawer
          });
        }}
      />
    );

  // Cut/copy keep a path here (not the system clipboard); paste copies or moves it.
  const [clip, setClip] = useState<{ path: string; cut: boolean } | null>(null);
  const isCut = (path: string) => !!clip?.cut && (path === clip.path || isInside(path, clip.path));

  /** Paste into a folder, or next to a file; "" is the project root. */
  async function paste(target: FileEntry | undefined) {
    if (!clip) return;
    const folder = !target ? "" : target.kind === "dir" ? target.path : dirname(target.path);
    if (clip.cut) {
      setClip(null);
      const to = await move(clip.path, folder);
      if (to) pick(to);
    } else {
      const to = await copy(clip.path, folder);
      if (to) pick(to);
    }
  }

  /** The menu for a row; `undefined` is the empty space below the rows (the project root). */
  const menuFor = (entry: FileEntry | undefined): MenuEntry[] => {
    const paste: MenuEntry = { value: "paste", label: "Paste", keys: "Mod+v", disabled: !clip };
    const create: MenuEntry[] = [
      { value: "new-file", label: "New file…" },
      { value: "new-dir", label: "New folder…" },
      null,
    ];
    if (!entry) return [...create, paste];
    return [
      ...(entry.kind === "dir" ? create : []),
      { value: "cut", label: "Cut", keys: "Mod+x" },
      { value: "copy", label: "Copy", keys: "Mod+c" },
      paste,
      null,
      { value: "copy-path", label: "Copy relative path" },
      null,
      { value: "rename", label: "Rename…", keys: "F2" },
      { value: "delete", label: "Delete", keys: DELETE_KEYS, danger: true },
    ];
  };

  function act(value: string, entry: FileEntry | undefined) {
    const parent = entry?.kind === "dir" ? entry.path : "";
    if (value === "new-file") onCreate(parent, "file");
    else if (value === "new-dir") onCreate(parent, "dir");
    else if (value === "paste") void paste(entry);
    else if (!entry) return;
    else if (value === "cut") setClip({ path: entry.path, cut: true });
    else if (value === "copy") setClip({ path: entry.path, cut: false });
    else if (value === "copy-path") navigator.clipboard.writeText(entry.path).catch(showError);
    else if (value === "rename") void rename(entry);
    else if (value === "delete") void remove(entry);
  }

  function onKeyDown(e: KeyboardEvent) {
    const entry = current ? ws.fileMap.get(current) : undefined;
    const key = e.nativeEvent;
    if (matches("Mod+c", key) && entry) act("copy", entry);
    else if (matches("Mod+x", key) && entry) act("cut", entry);
    else if (matches("Mod+v", key) && clip) act("paste", entry);
    else if (matches("F2", key) && entry) act("rename", entry);
    else if (matches(DELETE_KEYS, key) && entry) act("delete", entry);
    else if (e.key === "Escape" && clip?.cut) setClip(null);
    else return;
    e.preventDefault();
  }

  // What the open context menu is for (set when it opens).
  const menuEntry = useRef<FileEntry | undefined>(undefined);

  // Drag and drop: the dragged path, and the folder it would land in ("" = root).
  const dragged = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const dragOver = (folder: string) => (e: DragEvent) => {
    const from = dragged.current;
    if (from === null) return; // not one of ours (e.g. a file from the desktop)
    e.stopPropagation(); // the innermost folder wins over the root
    const copying = copyModifier(e);
    if (!canDrop(from, folder, copying)) {
      setDropTarget(null);
      return; // not calling preventDefault() refuses the drop
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = copying ? "copy" : "move";
    setDropTarget(folder);
  };

  const drop = (folder: string) => (e: DragEvent) => {
    const from = dragged.current;
    dragged.current = null;
    setDropTarget(null);
    if (from === null) return;
    e.preventDefault();
    e.stopPropagation();
    const copying = copyModifier(e);
    if (!canDrop(from, folder, copying)) return;
    if (copying) void copy(from, folder).then((to) => to && pick(to));
    else void move(from, folder).then((to) => to && pick(to));
  };

  // Hovering a collapsed folder while dragging opens it, so you can drop deeper.
  useEffect(() => {
    if (!dropTarget || !collapsed.has(dropTarget)) return;
    const timer = setTimeout(() => toggle(dropTarget), 700);
    return () => clearTimeout(timer);
    // toggle is recreated each render; only the target matters.
  }, [dropTarget, collapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderNode = (node: Node, depth: number) => {
    const { entry } = node;
    const isDir = entry.kind === "dir";
    const creatingHere = createIn === entry.path;
    const open = isDir && (!collapsed.has(entry.path) || creatingHere);
    const active = ws.active === entry.path;
    const selected = current === entry.path;
    const folder = isDir ? entry.path : dirname(entry.path);
    return (
      <Box
        key={entry.path}
        role="treeitem"
        aria-expanded={isDir ? open : undefined}
        aria-selected={selected}
        bg={dropTarget !== null && dropTarget === entry.path ? "bg.drop" : undefined}
      >
        <Flex
          className="group"
          data-current={selected || undefined}
          data-path={entry.path}
          draggable
          onDragStart={(e) => {
            dragged.current = entry.path;
            e.dataTransfer.effectAllowed = "copyMove";
            e.dataTransfer.setData("text/plain", entry.path); // Firefox won't start a drag without data
          }}
          onDragEnd={() => {
            dragged.current = null;
            setDropTarget(null);
          }}
          onDragOver={dragOver(folder)}
          onDrop={drop(folder)}
          opacity={isCut(entry.path) ? 0.5 : undefined}
          align="center"
          gap="1.5"
          h={{ base: "9", md: "7" }}
          ps={`${8 + depth * 14}px`}
          pe="1"
          cursor="pointer"
          fontSize="sm"
          bg={selected ? "bg.emphasized" : undefined}
          _hover={{ bg: selected ? "bg.emphasized" : "bg.muted" }}
          onClick={() => {
            pick(entry.path, !isDir);
            if (isDir) return toggle(entry.path);
            ws.openFile(entry.path);
            onOpenFile?.(); // e.g. close the mobile drawer
          }}
          title={entry.path}
        >
          <Box color="fg.muted" flexShrink={0} w="3.5" display="flex">
            {isDir && (open ? <LuChevronDown /> : <LuChevronRight />)}
          </Box>
          <FileIcon name={basename(entry.path)} kind={entry.kind} open={open} />
          <Text flex="1" truncate>
            {basename(entry.path)}
          </Text>
          <Menu.Root
            positioning={{ placement: "bottom-end" }}
            onSelect={({ value }) => act(value, entry)}
          >
            <Menu.Trigger asChild>
              <IconButton
                aria-label={`Actions for ${basename(entry.path)}`}
                size="2xs"
                variant="ghost"
                // Visible on hover; always visible on touch screens (no hover there).
                opacity={active || selected ? 1 : 0}
                css={{ "@media (hover: none)": { opacity: 1 } }}
                _groupHover={{ opacity: 1 }}
                _focusVisible={{ opacity: 1 }}
                _expanded={{ opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
              >
                <LuEllipsis />
              </IconButton>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                {/* Portaled, but React events still bubble to the row's onClick. */}
                <Menu.Content minW="12rem" onClick={(e) => e.stopPropagation()}>
                  <MenuItems items={menuFor(entry)} />
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        </Flex>
        {open && (node.children.length > 0 || creatingHere) && (
          <Box role="group">
            {creatingHere && newEntryRow(depth + 1)}
            {node.children.map((c) => renderNode(c, depth + 1))}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Flex direction="column" h="100%" minH="0" bg="bg.subtle">
      <Flex align="center" px="3" h="9" flexShrink={0} borderBottomWidth="1px">
        <Text fontSize="xs" fontWeight="semibold" letterSpacing="wider" color="fg.muted" flex="1" truncate>
          {ws.project?.name.toUpperCase() ?? "FILES"}
        </Text>
        <IconButton aria-label="New file" title="New file" size="xs" variant="ghost" onClick={() => onCreate(null, "file")}>
          <LuFilePlus />
        </IconButton>
        <IconButton aria-label="New folder" title="New folder" size="xs" variant="ghost" onClick={() => onCreate(null, "dir")}>
          <LuFolderPlus />
        </IconButton>
        <Menu.Root onSelect={({ value }) => void addExample(Number(value))} positioning={{ placement: "bottom-end" }}>
          <Menu.Trigger asChild>
            <IconButton aria-label="Add an example file" title="Add an example file" size="xs" variant="ghost">
              <LuBookOpen />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="18rem">
                <Menu.ItemGroup>
                  <Menu.ItemGroupLabel>Add an example file</Menu.ItemGroupLabel>
                  {EXAMPLES.map((ex, i) => (
                    <Menu.Item key={ex.file} value={String(i)}>
                      <FileIcon name={ex.file} />
                      <Text flex="1">{ex.name}</Text>
                      <Text fontFamily="mono" fontSize="xs" color="fg.muted">
                        {ex.file}
                      </Text>
                    </Menu.Item>
                  ))}
                </Menu.ItemGroup>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Flex>
      <ContextMenu
        items={(e) => {
          const path = (e.target as HTMLElement).closest<HTMLElement>("[data-path]")?.dataset.path;
          const entry = path ? ws.fileMap.get(path) : undefined;
          if (entry) pick(entry.path); // right-click selects the row, as in VS Code
          menuEntry.current = entry;
          return menuFor(entry);
        }}
        onSelect={(value) => act(value, menuEntry.current)}
      >
        <Box
          ref={treeRef}
          role="tree"
          aria-label="Project files"
          tabIndex={0}
          flex="1"
          overflowY="auto"
          py="1"
          bg={dropTarget === "" ? "bg.drop" : undefined}
          outline="none"
          // While the list has focus, outline the row that cut/copy/paste act on.
          css={{ "&:focus [data-current]": { outline: "1px solid", outlineColor: "blue.focusRing", outlineOffset: "-1px" } }}
          onKeyDown={onKeyDown}
          onDragOver={dragOver("")}
          onDrop={drop("")}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setDropTarget(null);
          }}
        >
          {createIn === "" && newEntryRow(0)}
          {tree.map((n) => renderNode(n, 0))}
          {ws.loaded && tree.length === 0 && !creating && (
            <Text px="4" py="3" fontSize="sm" color="fg.muted">
              No files yet. Create one with the buttons above.
            </Text>
          )}
        </Box>
      </ContextMenu>
    </Flex>
  );
}

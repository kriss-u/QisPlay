import { Box, Flex, IconButton, Menu, Portal, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { LuBookOpen, LuChevronDown, LuChevronRight, LuEllipsis, LuFilePlus, LuFolderPlus } from "react-icons/lu";
import { EXAMPLES } from "../examples";
import type { FileEntry } from "../workspace/db";
import { formatKeys, isMac, matches } from "../app/shortcuts";
import { basename, dirname, isInside } from "../workspace/paths";
import { FileIcon } from "./FileIcon";
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

/** Hold to copy instead of move while dragging, as in VS Code. */
const copyModifier = (e: DragEvent) => (isMac ? e.altKey : e.ctrlKey);

/** A folder can't go into itself; a move into its own folder does nothing. */
const canDrop = (from: string, folder: string, copying: boolean) =>
  folder !== from && !isInside(folder, from) && (copying || dirname(from) !== folder);

export function FileExplorer({ ws, onOpenFile }: { ws: Workspace; onOpenFile?: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(ws.files), [ws.files]);
  const toggle = (path: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const { create, rename, move, copy, remove, addExample } = useFileActions(ws, (parent) =>
    setCollapsed((c) => new Set([...c].filter((p) => p !== parent))),
  );

  // The row that cut/copy/paste act on: the last one clicked, until another
  // file is opened (e.g. from a tab), then the open file, as in VS Code.
  const [picked, setPicked] = useState<{ path: string; whileActive: string | null } | null>(null);
  const current = picked && picked.whileActive === ws.active ? picked.path : ws.active;
  const pick = (path: string, opened = false) => setPicked({ path, whileActive: opened ? path : ws.active });

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

  function onKeyDown(e: KeyboardEvent) {
    const entry = current ? ws.fileMap.get(current) : undefined;
    if (matches("Mod+c", e.nativeEvent) && entry) setClip({ path: entry.path, cut: false });
    else if (matches("Mod+x", e.nativeEvent) && entry) setClip({ path: entry.path, cut: true });
    else if (matches("Mod+v", e.nativeEvent) && clip) void paste(entry);
    else if (e.key === "Escape" && clip?.cut) setClip(null);
    else return;
    e.preventDefault();
  }

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
    const open = isDir && !collapsed.has(entry.path);
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
            onSelect={({ value }) => {
              if (value === "new-file") void create(entry.path, "file");
              if (value === "new-dir") void create(entry.path, "dir");
              if (value === "cut") setClip({ path: entry.path, cut: true });
              if (value === "copy") setClip({ path: entry.path, cut: false });
              if (value === "paste") void paste(entry);
              if (value === "rename") void rename(entry);
              if (value === "delete") void remove(entry);
            }}
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
                <Menu.Content minW="10rem" onClick={(e) => e.stopPropagation()}>
                  {isDir && (
                    <>
                      <Menu.Item value="new-file">New file…</Menu.Item>
                      <Menu.Item value="new-dir">New folder…</Menu.Item>
                      <Menu.Separator />
                    </>
                  )}
                  <Menu.Item value="cut">
                    Cut<Menu.ItemCommand>{formatKeys("Mod+x")}</Menu.ItemCommand>
                  </Menu.Item>
                  <Menu.Item value="copy">
                    Copy<Menu.ItemCommand>{formatKeys("Mod+c")}</Menu.ItemCommand>
                  </Menu.Item>
                  <Menu.Item value="paste" disabled={!clip}>
                    Paste<Menu.ItemCommand>{formatKeys("Mod+v")}</Menu.ItemCommand>
                  </Menu.Item>
                  <Menu.Separator />
                  <Menu.Item value="rename">Rename…</Menu.Item>
                  <Menu.Item value="delete" color="fg.error" _hover={{ bg: "bg.error", color: "fg.error" }}>
                    Delete
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        </Flex>
        {open && node.children.length > 0 && <Box role="group">{node.children.map((c) => renderNode(c, depth + 1))}</Box>}
      </Box>
    );
  };

  return (
    <Flex direction="column" h="100%" minH="0" bg="bg.subtle">
      <Flex align="center" px="3" h="9" flexShrink={0} borderBottomWidth="1px">
        <Text fontSize="xs" fontWeight="semibold" letterSpacing="wider" color="fg.muted" flex="1" truncate>
          {ws.project?.name.toUpperCase() ?? "FILES"}
        </Text>
        <IconButton aria-label="New file" title="New file" size="xs" variant="ghost" onClick={() => void create("", "file")}>
          <LuFilePlus />
        </IconButton>
        <IconButton aria-label="New folder" title="New folder" size="xs" variant="ghost" onClick={() => void create("", "dir")}>
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
      <Box
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
        {tree.map((n) => renderNode(n, 0))}
        {ws.loaded && tree.length === 0 && (
          <Text px="4" py="3" fontSize="sm" color="fg.muted">
            No files yet. Create one with the buttons above.
          </Text>
        )}
      </Box>
    </Flex>
  );
}

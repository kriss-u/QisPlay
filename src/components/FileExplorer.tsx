import { Box, Flex, IconButton, Menu, Portal, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuBookOpen, LuChevronDown, LuChevronRight, LuEllipsis, LuFilePlus, LuFolderPlus } from "react-icons/lu";
import { EXAMPLES } from "../examples";
import type { FileEntry } from "../workspace/db";
import { basename, dirname } from "../workspace/paths";
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

export function FileExplorer({ ws }: { ws: Workspace }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(ws.files), [ws.files]);
  const toggle = (path: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const { create, rename, remove, addExample } = useFileActions(ws, (parent) =>
    setCollapsed((c) => new Set([...c].filter((p) => p !== parent))),
  );

  const renderNode = (node: Node, depth: number) => {
    const { entry } = node;
    const isDir = entry.kind === "dir";
    const open = isDir && !collapsed.has(entry.path);
    const active = ws.active === entry.path;
    return (
      <Box key={entry.path} role="treeitem" aria-expanded={isDir ? open : undefined} aria-selected={active}>
        <Flex
          className="group"
          align="center"
          gap="1.5"
          h="7"
          ps={`${8 + depth * 14}px`}
          pe="1"
          cursor="pointer"
          fontSize="sm"
          bg={active ? "bg.emphasized" : undefined}
          _hover={{ bg: active ? "bg.emphasized" : "bg.muted" }}
          onClick={() => (isDir ? toggle(entry.path) : ws.openFile(entry.path))}
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
              if (value === "rename") void rename(entry);
              if (value === "delete") void remove(entry);
            }}
          >
            <Menu.Trigger asChild>
              <IconButton
                aria-label={`Actions for ${basename(entry.path)}`}
                size="2xs"
                variant="ghost"
                opacity={active ? 1 : 0}
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
      <Box role="tree" aria-label="Project files" flex="1" overflowY="auto" py="1">
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

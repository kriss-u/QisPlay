import { Box, Dialog, Flex, HStack, Input, Kbd, Portal, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuTerminal } from "react-icons/lu";
import { keyLabels, type Keys } from "../app/shortcuts";
import { FileIcon } from "./FileIcon";

export interface Command {
  id: string;
  title: string;
  keys?: Keys;
  run(): void;
  /** Hidden from the palette when false. */
  enabled?: boolean;
  /**
   * The editor's own keymap handles `keys` (shown in the palette), so the global
   * shortcut handler skips them and the help dialog lists them under Editor.
   */
  editorOnly?: boolean;
}

interface Props {
  open: boolean;
  /** "files" = quick open (Mod+P); "commands" = command palette (Mod+Shift+P). */
  mode: "files" | "commands";
  files: string[];
  commands: Command[];
  onOpenFile(path: string): void;
  onClose(): void;
}

/** Subsequence match with a score: contiguous and early matches rank higher. */
function fuzzy(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 5 - Math.min(found - ti, 10);
    ti = found + 1;
  }
  return score - t.length * 0.1;
}

export function KeyCombo({ keys }: { keys: Keys }) {
  return (
    <HStack gap="0.5">
      {keyLabels(keys).map((k, i) => (
        <Kbd key={i} size="sm">
          {k}
        </Kbd>
      ))}
    </HStack>
  );
}

/** VS Code-style quick open; typing ">" switches to commands. */
export function CommandPalette(props: Props) {
  // Remount on every open so the query starts fresh (">" for commands).
  const [opens, setOpens] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setOpens((n) => n + 1);
  }
  return <Palette key={`${opens}:${props.mode}`} {...props} />;
}

function Palette({ open, mode, files, commands, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState(mode === "commands" ? ">" : "");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const showCommands = query.startsWith(">");
  const term = (showCommands ? query.slice(1) : query).trim();

  const items = useMemo(() => {
    if (showCommands) {
      return commands
        .filter((c) => c.enabled !== false)
        .map((c) => ({ c, score: fuzzy(term, c.title) }))
        .filter((x) => x.score !== null)
        .sort((a, b) => (term ? b.score! - a.score! : 0))
        .map(({ c }) => ({ key: c.id, label: c.title, detail: undefined, keys: c.keys, run: c.run, icon: <LuTerminal /> }));
    }
    return files
      .map((path) => ({ path, score: fuzzy(term, path) }))
      .filter((x) => x.score !== null)
      .sort((a, b) => (term ? b.score! - a.score! : a.path.localeCompare(b.path)))
      .slice(0, 100)
      .map(({ path }) => {
        const slash = path.lastIndexOf("/");
        return {
          key: path,
          label: path.slice(slash + 1),
          detail: slash > 0 ? path.slice(0, slash) : undefined,
          keys: undefined,
          run: () => onOpenFile(path),
          icon: <FileIcon name={path.slice(slash + 1)} />,
        };
      });
  }, [showCommands, term, commands, files, onOpenFile]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (i: number) => {
    const item = items[i];
    if (!item) return;
    onClose();
    // Let the dialog close (and return focus) before running the command.
    setTimeout(item.run, 0);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      initialFocusEl={() => inputRef.current}
      placement="top"
      size="md"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mt="12" overflow="hidden">
            <Dialog.Title srOnly>{showCommands ? "Command palette" : "Go to file"}</Dialog.Title>
            <Input
              ref={inputRef}
              value={query}
              onFocus={(e) => {
                // The dialog selects the input when it opens; put the caret after
                // ">" on the next frame so typing doesn't replace the prefix.
                const el = e.currentTarget;
                requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIndex((i) => Math.min(items.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndex((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  choose(index);
                }
              }}
              placeholder={showCommands ? "Type a command" : "Search files by name (type > for commands)"}
              variant="flushed"
              px="4"
              h="12"
              borderBottomWidth="1px"
              aria-controls="palette-list"
              aria-activedescendant={items[index] ? `palette-${index}` : undefined}
              role="combobox"
              aria-expanded="true"
              autoComplete="off"
              spellCheck={false}
            />
            <Box ref={listRef} id="palette-list" role="listbox" maxH="60vh" overflowY="auto" py="1">
              {items.length === 0 && (
                <Text px="4" py="3" fontSize="sm" color="fg.muted">
                  {showCommands ? "No matching commands" : "No matching files"}
                </Text>
              )}
              {items.map((item, i) => (
                <Flex
                  key={item.key}
                  id={`palette-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === index}
                  align="center"
                  gap="2.5"
                  px="4"
                  py="1.5"
                  cursor="pointer"
                  bg={i === index ? "bg.emphasized" : undefined}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(i)}
                >
                  <Box color="fg.muted" display="flex">
                    {item.icon}
                  </Box>
                  <Text fontSize="sm" truncate>
                    {item.label}
                  </Text>
                  {item.detail && (
                    <Text fontSize="xs" color="fg.muted" truncate>
                      {item.detail}
                    </Text>
                  )}
                  {item.keys && (
                    <Box ms="auto">
                      <KeyCombo keys={item.keys} />
                    </Box>
                  )}
                </Flex>
              ))}
            </Box>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

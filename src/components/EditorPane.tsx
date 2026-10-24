import { Box, Center, CloseButton, Flex, Image, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, type Ref } from "react";
import { LuFileCode } from "react-icons/lu";
import type { Completion } from "../python/protocol";
import { basename, imageType } from "../workspace/paths";
import type { Workspace } from "../workspace/useWorkspace";
import { CodeEditor, type EditorHandle } from "./CodeEditor";
import { ContextMenu } from "./ContextMenu";
import { FileIcon } from "./FileIcon";
import { showError } from "./toast";

interface Props {
  ref?: Ref<EditorHandle>;
  ws: Workspace;
  onRun(): void;
  onRunSelection(code: string): void;
  onCommandPalette(): void;
  complete(code: string, line: number, column: number, path: string): Promise<Completion[]>;
}

function ImagePreview({ path, data }: { path: string; data: Uint8Array }) {
  const url = useMemo(
    () => URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: imageType(path) })),
    [path, data],
  );
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <Center h="100%" p="6" bg="bg.subtle" overflow="auto">
      <Image src={url} alt={path} maxW="100%" maxH="100%" bg="white" />
    </Center>
  );
}

export function EditorPane({ ref, ws, onRun, onRunSelection, onCommandPalette, complete }: Props) {
  const entry = ws.active ? ws.fileMap.get(ws.active) : undefined;
  const content = entry ? ws.contentOf(entry) : undefined;

  // The tab the open context menu is for.
  const menuTab = useRef<string | null>(null);
  function onTabMenu(value: string) {
    const path = menuTab.current;
    if (!path) return;
    if (value === "close") ws.closeTab(path);
    else if (value === "close-others") ws.tabs.filter((t) => t !== path).forEach(ws.closeTab);
    else if (value === "close-all") ws.tabs.forEach(ws.closeTab);
    else if (value === "copy-path") navigator.clipboard.writeText(path).catch(showError);
  }

  return (
    <Flex direction="column" h="100%" minH="0" minW="0">
      <ContextMenu
        items={(e) => {
          const path = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]")?.dataset.tab;
          if (!path) return null;
          menuTab.current = path;
          return [
            { value: "close", label: "Close" },
            { value: "close-others", label: "Close others", disabled: ws.tabs.length < 2 },
            { value: "close-all", label: "Close all" },
            null,
            { value: "copy-path", label: "Copy relative path" },
          ];
        }}
        onSelect={onTabMenu}
      >
        <Flex
          role="tablist"
          aria-label="Open files"
          h="9"
          flexShrink={0}
          overflowX="auto"
          borderBottomWidth="1px"
          bg="bg.subtle"
          css={{ scrollbarWidth: "thin" }}
        >
          {ws.tabs.map((path) => {
            const selected = path === ws.active;
            return (
              <Flex
                key={path}
                role="tab"
                data-tab={path}
                aria-selected={selected}
                align="center"
                gap="1"
                ps="3"
                pe="1"
                fontSize="sm"
                cursor="pointer"
                flexShrink={0}
                borderEndWidth="1px"
                bg={selected ? "bg" : "bg.tab"}
                color={selected ? "fg" : "fg.muted"}
                borderTopWidth="2px"
                borderTopColor={selected ? "blue.solid" : "transparent"}
                onClick={() => ws.setActive(path)}
                onAuxClick={(e) => e.button === 1 && ws.closeTab(path)}
                title={path}
              >
                <FileIcon name={basename(path)} size={14} />
                <Text truncate maxW="40">
                  {basename(path)}
                </Text>
                <CloseButton
                  size="2xs"
                  aria-label={`Close ${basename(path)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    ws.closeTab(path);
                  }}
                />
              </Flex>
            );
          })}
        </Flex>
      </ContextMenu>

      <Box flex="1" minH="0" overflow="hidden">
        {!entry || content === undefined ? (
          <Center h="100%" color="fg.muted" flexDirection="column" gap="2">
            <LuFileCode size={32} />
            <Text fontSize="sm">Open a file from the explorer to start editing.</Text>
          </Center>
        ) : typeof content === "string" ? (
          <CodeEditor
            ref={ref}
            key={`${ws.project?.id}:${entry.path}`}
            path={entry.path}
            value={content}
            onChange={(v) => ws.editFile(entry.path, v)}
            onRun={onRun}
            onRunSelection={onRunSelection}
            onCommandPalette={onCommandPalette}
            complete={complete}
          />
        ) : imageType(entry.path) ? (
          <ImagePreview path={entry.path} data={content} />
        ) : (
          <Center h="100%" color="fg.muted">
            <Text fontSize="sm">Binary file ({content.byteLength.toLocaleString()} bytes) — included in the .zip download.</Text>
          </Center>
        )}
      </Box>
    </Flex>
  );
}

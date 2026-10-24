import { Box, CloseButton, Dialog, Flex, Heading, Portal, Text } from "@chakra-ui/react";
import type { Keys } from "../app/shortcuts";
import { KeyCombo, type Command } from "./CommandPalette";

/** Editor keys (CodeMirror defaults chosen to match VS Code, plus our additions). */
const EDITOR_KEYS: { title: string; keys: Keys }[] = [
  { title: "Run selection / current line in console", keys: "Shift+Enter" },
  { title: "Trigger suggestions", keys: "Ctrl+Space" },
  { title: "Toggle line comment", keys: "Mod+/" },
  { title: "Find", keys: "Mod+f" },
  { title: "Find and replace", keys: { mac: "Mod+Alt+f", other: "Ctrl+h" } },
  { title: "Go to line", keys: "Ctrl+g" },
  { title: "Select next occurrence", keys: "Mod+d" },
  { title: "Select all occurrences", keys: "Mod+Shift+l" },
  { title: "Move line up / down", keys: "Alt+ArrowUp" },
  { title: "Copy line up / down", keys: "Shift+Alt+ArrowDown" },
  { title: "Delete line", keys: "Mod+Shift+k" },
  { title: "Indent / outdent", keys: "Tab" },
  { title: "Undo", keys: "Mod+z" },
  { title: "Redo", keys: { mac: "Mod+Shift+z", other: "Ctrl+y" } },
];

function Row({ title, keys }: { title: string; keys: Keys }) {
  return (
    <Flex align="center" justify="space-between" gap="4" py="1.5" borderBottomWidth="1px">
      <Text fontSize="sm">{title}</Text>
      <KeyCombo keys={keys} />
    </Flex>
  );
}

export function ShortcutsDialog({ open, onClose, commands }: { open: boolean; onClose(): void; commands: Command[] }) {
  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="lg" scrollBehavior="inside">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Keyboard shortcuts</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text fontSize="sm" color="fg.muted" mb="3">
                Modeled on VS Code. Keys your browser or operating system reserves (new or private window, closing
                or switching browser tabs, hiding the app) never reach web pages, so those commands use the
                alternatives listed here.
              </Text>
              <Heading size="sm" mt="2" mb="1">
                General
              </Heading>
              <Box>
                {commands
                  .filter((c) => c.keys && !c.editorOnly)
                  .map((c) => (
                    <Row key={c.id} title={c.title} keys={c.keys!} />
                  ))}
              </Box>
              <Heading size="sm" mt="5" mb="1">
                Editor
              </Heading>
              <Box>
                {EDITOR_KEYS.map((k) => (
                  <Row key={k.title} {...k} />
                ))}
              </Box>
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

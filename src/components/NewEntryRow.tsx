import { Box, Flex, IconButton } from "@chakra-ui/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LuCheck, LuX } from "react-icons/lu";
import { basename } from "../workspace/paths";
import { FileIcon } from "./FileIcon";

/**
 * The inline "new file / new folder" row of the explorer, as in VS Code. The name may be
 * nested ("pkg/sub/mod.py"); the icon follows what's typed. Enter creates, Esc cancels,
 * and leaving the box creates a valid name or cancels an empty one. A tick and a cross do
 * the same by pointer, which is what you tap on a phone.
 */
export function NewEntryRow({
  kind,
  depth,
  validate,
  onSubmit,
  onCancel,
}: {
  kind: "file" | "dir";
  depth: number;
  /** An error message for the name typed so far, or null. */
  validate: (value: string) => string | null;
  onSubmit: (value: string) => void;
  /** `refocus` is true when the row was left with Esc, so the tree should take focus back. */
  onCancel: (refocus: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [attempted, setAttempted] = useState(false);
  const finished = useRef(false);
  const row = useRef<HTMLDivElement>(null);
  const error = validate(value);
  const shown = value || attempted ? error : null;

  useEffect(() => {
    row.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const finish = (submit: boolean, refocus: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (submit) onSubmit(value);
    else onCancel(refocus);
  };

  function onKeyDown(e: KeyboardEvent) {
    e.stopPropagation(); // the tree's cut/copy/paste/delete keys must not act on the text box
    if (e.key === "Enter") {
      e.preventDefault();
      if (error) setAttempted(true);
      else finish(true, true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false, true);
    }
  }

  return (
    <Box ref={row} onContextMenu={(e) => e.stopPropagation()}>
      <Flex align="center" gap="1.5" h={{ base: "9", md: "7" }} ps={`${8 + depth * 14}px`} pe="2" fontSize="sm">
        <Box w="3.5" flexShrink={0} />
        <FileIcon name={basename(value.replace(/\/+$/, ""))} kind={kind} />
        <input
          autoFocus
          value={value}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label={kind === "file" ? "New file name" : "New folder name"}
          aria-invalid={!!shown}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => finish(!!value.trim() && !error, false)}
          style={{
            flex: 1,
            minWidth: 0,
            height: 22,
            padding: "0 4px",
            font: "inherit",
            color: "inherit",
            background: "var(--chakra-colors-bg)",
            outline: `1px solid var(--chakra-colors-${shown ? "red-solid" : "blue-focus-ring"})`,
            outlineOffset: -1,
            border: 0,
            borderRadius: 2,
          }}
        />
        {/* Pressing them mustn't blur the box (on a phone that would hide the keyboard first). */}
        <Flex gap="1" flexShrink={0} onPointerDown={(e) => e.preventDefault()}>
          <IconButton
            aria-label="Create"
            title="Create (Enter)"
            size="2xs"
            variant="subtle"
            colorPalette="green"
            boxSize="22px"
            minW="22px"
            onClick={() => (error ? setAttempted(true) : finish(true, true))}
          >
            <LuCheck />
          </IconButton>
          <IconButton
            aria-label="Cancel"
            title="Cancel (Esc)"
            size="2xs"
            variant="subtle"
            colorPalette="red"
            boxSize="22px"
            minW="22px"
            onClick={() => finish(false, true)}
          >
            <LuX />
          </IconButton>
        </Flex>
      </Flex>
      {shown && (
        <Box
          role="alert"
          mx="2"
          mb="1"
          px="2"
          py="1"
          fontSize="xs"
          bg="red.subtle"
          color="red.fg"
          borderWidth="1px"
          borderColor="red.solid"
          borderRadius="sm"
          ms={`${8 + depth * 14 + 20}px`}
        >
          {shown}
        </Box>
      )}
    </Box>
  );
}

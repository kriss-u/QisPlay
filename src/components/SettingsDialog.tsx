import { Button, CloseButton, Dialog, Flex, HStack, IconButton, Portal, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
import { DEFAULT_SETTINGS, FONT_SIZE, useSettings, ZOOM } from "../app/settings";
import { formatKeys } from "../app/shortcuts";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Flex align="center" justify="space-between" gap="4" py="3" borderBottomWidth="1px">
      <div>
        <Text fontSize="sm" fontWeight="medium">
          {label}
        </Text>
        {hint && (
          <Text fontSize="xs" color="fg.muted">
            {hint}
          </Text>
        )}
      </div>
      {children}
    </Flex>
  );
}

/** − value + Reset, for zoom and font size. */
function Stepper(props: {
  label: string;
  value: string;
  onDown(): void;
  onUp(): void;
  onReset(): void;
  canDown: boolean;
  canUp: boolean;
  isDefault: boolean;
}) {
  return (
    <HStack gap="1" flexShrink={0}>
      <IconButton size="xs" variant="outline" aria-label={`Decrease ${props.label}`} disabled={!props.canDown} onClick={props.onDown}>
        <LuMinus />
      </IconButton>
      <Text fontSize="sm" minW="12" textAlign="center" aria-live="polite" fontVariantNumeric="tabular-nums">
        {props.value}
      </Text>
      <IconButton size="xs" variant="outline" aria-label={`Increase ${props.label}`} disabled={!props.canUp} onClick={props.onUp}>
        <LuPlus />
      </IconButton>
      <Button size="xs" variant="ghost" disabled={props.isDefault} onClick={props.onReset}>
        Reset
      </Button>
    </HStack>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const s = useSettings();

  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="md" placement="center">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title>Settings</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb="6">
              <Row label="Zoom" hint={`Whole app · ${formatKeys("Mod+=")} / ${formatKeys("Mod+-")} / ${formatKeys("Mod+0")}`}>
                <Stepper
                  label="zoom"
                  value={`${Math.round(s.zoom * 100)}%`}
                  onDown={() => s.zoomBy(-1)}
                  onUp={() => s.zoomBy(1)}
                  onReset={() => s.reset("zoom")}
                  canDown={s.zoom > ZOOM.min}
                  canUp={s.zoom < ZOOM.max}
                  isDefault={s.zoom === DEFAULT_SETTINGS.zoom}
                />
              </Row>
              <Row label="Code font size" hint="Editor, console and output">
                <Stepper
                  label="code font size"
                  value={`${s.fontSize}px`}
                  onDown={() => s.fontSizeBy(-1)}
                  onUp={() => s.fontSizeBy(1)}
                  onReset={() => s.reset("fontSize")}
                  canDown={s.fontSize > FONT_SIZE.min}
                  canUp={s.fontSize < FONT_SIZE.max}
                  isDefault={s.fontSize === DEFAULT_SETTINGS.fontSize}
                />
              </Row>
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

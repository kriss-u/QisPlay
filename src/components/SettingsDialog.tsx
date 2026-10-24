import { Button, CloseButton, Dialog, Flex, HStack, IconButton, NativeSelect, Portal, Switch, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
import { DEFAULT_SETTINGS, FONT_SIZE, LINE_LENGTHS, useSettings, ZOOM } from "../app/settings";
import { formatKeys } from "../app/shortcuts";
import { BLACK } from "../python/optionalPackages";

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

function Section({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide" mt="5" mb="1">
      {children}
    </Text>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const s = useSettings();
  const hasBlack = s.extraPackages.includes(BLACK);

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
              {hasBlack && (
                <>
                  <Section>Formatting</Section>
              <Row label="Format on save" hint={`Formats the open file when you press ${formatKeys("Mod+s")}`}>
                <Switch.Root
                  checked={s.formatOnSave}
                  disabled={!hasBlack}
                  onCheckedChange={(e) => s.set("formatOnSave", e.checked)}
                >
                  <Switch.HiddenInput aria-label="Format on save" />
                  <Switch.Control />
                </Switch.Root>
              </Row>
              <Row label="Format on run" hint="Formats the open file before it runs">
                <Switch.Root
                  checked={s.formatOnRun}
                  disabled={!hasBlack}
                  onCheckedChange={(e) => s.set("formatOnRun", e.checked)}
                >
                  <Switch.HiddenInput aria-label="Format on run" />
                  <Switch.Control />
                </Switch.Root>
              </Row>
              <Row label="Line length" hint="Black wraps longer lines">
                <NativeSelect.Root size="xs" width="20" flexShrink={0}>
                  <NativeSelect.Field
                    aria-label="Line length"
                    value={s.lineLength}
                    onChange={(e) => s.set("lineLength", Number(e.target.value))}
                  >
                    {(LINE_LENGTHS.includes(s.lineLength) ? LINE_LENGTHS : [...LINE_LENGTHS, s.lineLength].sort((a, b) => a - b)).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ),
                    )}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Row>
                </>
              )}
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

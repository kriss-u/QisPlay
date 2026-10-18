import { Button, Popover, Portal, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuSparkles } from "react-icons/lu";
import type { Project } from "../workspace/db";
import type { TemplateInfo } from "../templates/catalog";

/** "Template updated" button for a project whose template has a newer version. */
export function TemplateUpdateNotice(props: {
  project: Project;
  update: TemplateInfo;
  onOpenFresh(): Promise<void>;
  onDismiss(): void;
}) {
  const { project, update } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={(e) => setOpen(e.open)} positioning={{ placement: "bottom-start" }}>
      <Popover.Trigger asChild>
        <Button size="xs" variant="subtle" colorPalette="orange" flexShrink={0} title="This project's template was updated">
          <LuSparkles />
          <Text as="span" hideBelow="md">
            Template updated
          </Text>
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="sm">
            <Popover.Arrow />
            <Popover.Body>
              <Text fontWeight="semibold">{update.title} has a new version</Text>
              <Text fontSize="sm" color="fg.muted" mt="1">
                You started from v{project.template!.version}; the latest is v{update.version}.
              </Text>
              {update.changes && (
                <Text fontSize="sm" mt="2">
                  {update.changes}
                </Text>
              )}
              <Text fontSize="sm" mt="2">
                Open a fresh copy as a new project? <b>{project.name}</b> stays as it is, so you can copy your work
                across.
              </Text>
            </Popover.Body>
            <Popover.Footer justifyContent="flex-end" gap="2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  props.onDismiss();
                }}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                colorPalette="blue"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await props.onOpenFresh();
                    setOpen(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Open fresh copy
              </Button>
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

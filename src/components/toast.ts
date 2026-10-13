import { createToaster } from "@chakra-ui/react";

export const toaster = createToaster({ placement: "bottom-end", pauseOnPageIdle: true });

export function showError(err: unknown) {
  toaster.create({ type: "error", title: err instanceof Error ? err.message : String(err) });
}

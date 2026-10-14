// Shows a page a script opened through the `webview` stand-in (pywebview's
// API), e.g. qisdebug's `debug.show()` timeline viewer. The page runs in a
// sandboxed frame with no access to the app; its `window.pywebview.api.<m>()`
// calls are posted here and forwarded to the Python object behind it.
import { CloseButton, Dialog, Portal } from "@chakra-ui/react";
import { useEffect, useMemo, useRef } from "react";
import { useColorMode } from "../app/colorMode";
import type { PyWindow } from "../python/usePython";

/** pywebview's page-side API: one promise-returning function per js_api method. */
const pageBridge = (methods: string[]) => `<script>
(() => {
  const calls = new Map();
  let next = 0;
  addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.pywebview !== "reply") return;
    const call = calls.get(e.data.id);
    calls.delete(e.data.id);
    if (e.data.error !== undefined) call?.reject(new Error(e.data.error));
    else call?.resolve(e.data.result);
  });
  const api = {};
  for (const method of ${JSON.stringify(methods)}) {
    api[method] = (...args) =>
      new Promise((resolve, reject) => {
        const id = ++next;
        calls.set(id, { resolve, reject });
        parent.postMessage({ pywebview: "call", id, method, args }, "*");
      });
  }
  window.pywebview = { api };
  addEventListener("DOMContentLoaded", () => dispatchEvent(new Event("pywebviewready")));
})();
</script>`;

/** The page with the bridge first in <head>, so it exists before the page's own scripts. */
function withBridge(html: string, methods: string[]) {
  const bridge = pageBridge(methods);
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + bridge + html.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? doctype[0] + bridge + html.slice(doctype[0].length) : bridge + html;
}

export function PyWindowDialog(props: {
  window: PyWindow | null;
  call(window: number, method: string, args: unknown[]): Promise<unknown>;
  onClose(): void;
}) {
  const { window: win, call, onClose } = props;
  const { colorMode } = useColorMode();
  const frame = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => (win ? withBridge(win.html, win.methods) : ""), [win]);

  useEffect(() => {
    if (!win) return;
    const onMessage = (e: MessageEvent) => {
      const target = frame.current?.contentWindow;
      if (!target || e.source !== target || e.data?.pywebview !== "call") return;
      const { id, method, args } = e.data as { id: number; method: string; args: unknown[] };
      call(win.window, method, Array.isArray(args) ? args : []).then(
        (result) => target.postMessage({ pywebview: "reply", id, result }, "*"),
        (err: Error) => target.postMessage({ pywebview: "reply", id, error: err.message }, "*"),
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [win, call]);

  return (
    <Dialog.Root
      open={!!win}
      onOpenChange={(e) => !e.open && onClose()}
      size={{ base: "full", md: "cover" }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content overflow="hidden">
            <Dialog.Header py="2" ps="4" pe="12" borderBottomWidth="1px">
              <Dialog.Title fontSize="sm" truncate>
                {win?.title}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body p="0" display="flex">
              {win && (
                <iframe
                  ref={frame}
                  title={win.title}
                  srcDoc={srcDoc}
                  // Scripts only: an opaque origin, so the page can't reach the app or its storage.
                  sandbox="allow-scripts"
                  style={{ flex: 1, border: 0, width: "100%", colorScheme: colorMode }}
                />
              )}
            </Dialog.Body>
            <Dialog.CloseTrigger asChild top="1.5">
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

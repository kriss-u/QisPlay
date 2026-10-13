import {
  Button,
  Dialog,
  Field,
  Input,
  Portal,
  Toast,
  Toaster as ChakraToaster,
} from "@chakra-ui/react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { DialogContext, type ConfirmOptions, type PromptOptions } from "./dialogContext";
import { toaster } from "./toast";

export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }}>
            <Toast.Indicator />
            <Toast.Title>{toast.title}</Toast.Title>
            {toast.description && <Toast.Description>{toast.description}</Toast.Description>}
            <Toast.CloseTrigger />
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}

type DialogRequest =
  | ({ kind: "prompt"; resolve(v: string | null): void } & PromptOptions)
  | ({ kind: "confirm"; resolve(v: boolean): void } & ConfirmOptions);

/** Promise-based prompt/confirm dialogs: `await dialogs.prompt({...})`. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = useCallback(
    (o: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(o.initial ?? "");
        setError(null);
        setRequest({ kind: "prompt", resolve, ...o });
      }),
    [],
  );
  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ kind: "confirm", resolve, ...o })),
    [],
  );

  const close = () => {
    if (request?.kind === "prompt") request.resolve(null);
    if (request?.kind === "confirm") request.resolve(false);
    setRequest(null);
  };
  const submit = () => {
    if (!request) return;
    if (request.kind === "prompt") {
      const v = value.trim();
      const problem = request.validate?.(v) ?? null;
      if (problem) return setError(problem);
      request.resolve(v);
    } else {
      request.resolve(true);
    }
    setRequest(null);
  };

  return (
    <DialogContext.Provider value={{ prompt, confirm }}>
      {children}
      <Dialog.Root
        open={request !== null}
        onOpenChange={(e) => !e.open && close()}
        initialFocusEl={() => inputRef.current}
        role={request?.kind === "confirm" && request.danger ? "alertdialog" : "dialog"}
        size="sm"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <Dialog.Header>
                  <Dialog.Title>{request?.title}</Dialog.Title>
                </Dialog.Header>
                <Dialog.Body>
                  {request?.kind === "prompt" && (
                    <Field.Root invalid={error !== null}>
                      {request.label && <Field.Label>{request.label}</Field.Label>}
                      <Input
                        ref={inputRef}
                        value={value}
                        onChange={(e) => {
                          setValue(e.target.value);
                          setError(null);
                        }}
                        onFocus={(e) => {
                          // Select the stem so typing replaces the name, not the extension.
                          const dot = e.target.value.lastIndexOf(".");
                          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
                        }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {error && <Field.ErrorText>{error}</Field.ErrorText>}
                    </Field.Root>
                  )}
                  {request?.kind === "confirm" && request.body}
                </Dialog.Body>
                <Dialog.Footer>
                  <Button variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    colorPalette={request?.kind === "confirm" && request.danger ? "red" : "blue"}
                  >
                    {request?.confirmLabel ?? "OK"}
                  </Button>
                </Dialog.Footer>
              </form>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </DialogContext.Provider>
  );
}

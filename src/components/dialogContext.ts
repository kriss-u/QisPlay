import { createContext, useContext, type ReactNode } from "react";

export interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  confirmLabel?: string;
  /** Return an error message to keep the dialog open. */
  validate?(value: string): string | null;
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

export const DialogContext = createContext<{
  prompt(o: PromptOptions): Promise<string | null>;
  confirm(o: ConfirmOptions): Promise<boolean>;
} | null>(null);

export function useDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs needs <DialogProvider>");
  return ctx;
}

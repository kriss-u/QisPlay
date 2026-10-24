// Messages exchanged between the UI thread and the Pyodide worker.

/** A project snapshot sent to the worker. */
export interface ProjectFiles {
  files: Record<string, string | Uint8Array>;
  /** Folders, so empty ones exist too. */
  dirs: string[];
}

export interface Completion {
  label: string;
  type: string;
  detail: string;
  /** Auto-import: the statement to add when this completion is chosen. */
  import?: string;
}

/** Where output goes: the Output pane (scripts) or the Console. */
export type Target = "run" | "console";

export type ToWorker =
  | { type: "init"; interruptBuffer?: SharedArrayBuffer }
  // columns: the output terminal's width, so text output (e.g. qc.draw()) fits it.
  | { type: "run"; id: number; entry: string; files: ProjectFiles; columns: number }
  | { type: "console"; id: number; source: string; files: ProjectFiles; columns: number }
  | { type: "console-reset" }
  | { type: "sync"; files: ProjectFiles }
  // Adds an optional package (see OPTIONAL in the worker).
  | { type: "install-tool"; tool: string }
  | { type: "format"; id: number; code: string; lineLength: number }
  | { type: "is-complete"; id: number; source: string }
  | { type: "complete"; id: number; code: string; line: number; column: number; entry: string }
  // A page opened through the `webview` stand-in calls its Python js_api.
  | { type: "window-call"; id: number; window: number; method: string; args: string }
  | { type: "window-close"; window: number };

export type FromWorker =
  | { type: "status"; text: string }
  | { type: "ready"; packages: Record<string, string>; missing: string[] }
  | { type: "installed"; packages: Record<string, string> }
  // Progress of an optional package the user added.
  | { type: "tool"; tool: string; state: "installing" | "installed" | "failed"; version?: string; error?: string }
  // ok: `code` is the formatted source; otherwise `error` says why it couldn't be.
  | { type: "formatted"; id: number; ok: boolean; code: string; error: string }
  | { type: "info"; text: string; target: Target }
  | { type: "fatal"; error: string }
  | { type: "stdout"; text: string; target: Target }
  | { type: "stderr"; text: string; target: Target }
  | { type: "figure"; png: string; target: Target }
  | {
      type: "done";
      id: number;
      target: Target;
      ok: boolean;
      ms: number;
      /** Files the script created or modified. */
      changed: Record<string, string | Uint8Array>;
    }
  | { type: "completions"; id: number; items: Completion[] }
  | { type: "is-complete"; id: number; status: "complete" | "incomplete" | "invalid" }
  // pywebview-style window: html with `window.pywebview.api.<methods>` calling Python.
  | { type: "window-open"; window: number; title: string; html: string; width: number; height: number; methods: string[] }
  /** JSON: {"result": …} or {"error": "…"}. */
  | { type: "window-result"; id: number; reply: string };

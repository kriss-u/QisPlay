import { useCallback, useEffect, useRef, useState } from "react";
import type { Stream } from "../components/OutputTerminal";
import type { Completion, FromWorker, ProjectFiles, Target, ToWorker } from "./protocol";
import PyodideWorker from "./pyodide.worker.ts?worker";

export type RuntimeState = "loading" | "ready" | "running" | "error";

export interface OutputSink {
  write(text: string, stream: Stream, target: Target): void;
}

export interface RunResult {
  ok: boolean;
  ms: number;
  /** Files the script created or modified. */
  changed: Record<string, string | Uint8Array>;
  /** Number of figures this run produced. */
  figures: number;
}

type Completeness = "complete" | "incomplete" | "invalid";

/** A page a script opened with pywebview's API (e.g. qisdebug's `debug.show()`). */
export type PyWindow = Omit<Extract<FromWorker, { type: "window-open" }>, "type">;

const SIGINT = 2;
const REQUEST_TIMEOUT_MS = 4000;
// The first completion builds the auto-import index (imports qiskit etc.).
const COMPLETION_TIMEOUT_MS = 12000;

/** An optional package the user added, in this Python session. */
export interface ToolStatus {
  state: "installing" | "installed" | "failed";
  version?: string;
  error?: string;
}

export type FormatResult = { ok: true; code: string } | { ok: false; error: string };

const FORMAT_TIMEOUT_MS = 30000; // may wait for Black to install first

/** `extras`: the optional packages the user added; they install once Python is ready. */
export function usePython(sink: OutputSink, extras: string[]) {
  const [state, setState] = useState<RuntimeState>("loading");
  const [status, setStatus] = useState("Starting worker…");
  const [packages, setPackages] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [tools, setTools] = useState<Record<string, ToolStatus>>({});
  const [figures, setFigures] = useState<string[]>([]);
  const [pyWindow, setPyWindow] = useState<PyWindow | null>(null);
  const pyWindowRef = useRef<PyWindow | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const interruptRef = useRef<Uint8Array | null>(null);
  const nextId = useRef(0);
  const pendingRun = useRef<{ id: number; figures: number; resolve(r: RunResult | null): void } | null>(null);
  // Small request/response calls (completions, is-complete) keyed by id.
  const pending = useRef(new Map<number, (value: unknown) => void>());
  // Window api calls: no timeout, they wait while a script runs.
  const windowCalls = useRef(new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>());
  const stateRef = useRef(state);
  const sinkRef = useRef(sink);
  const extrasRef = useRef(extras);
  useEffect(() => {
    sinkRef.current = sink;
  }, [sink]);
  useEffect(() => {
    extrasRef.current = extras;
  }, [extras]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const boot = useCallback(() => {
    workerRef.current?.terminate();
    pendingRun.current?.resolve(null);
    pendingRun.current = null;
    for (const resolve of pending.current.values()) resolve(undefined);
    pending.current.clear();
    for (const call of windowCalls.current.values()) call.reject(new Error("Python restarted"));
    windowCalls.current.clear();
    pyWindowRef.current = null;
    setPyWindow(null);
    setTools({});

    const worker = new PyodideWorker();
    workerRef.current = worker;
    setState("loading");

    // Interrupting a running script needs a SharedArrayBuffer, which is only
    // available when the page is cross-origin isolated (COOP/COEP headers).
    // Without it, Stop falls back to restarting the worker.
    let interruptBuffer: SharedArrayBuffer | undefined;
    if (self.crossOriginIsolated) {
      interruptBuffer = new SharedArrayBuffer(1);
      interruptRef.current = new Uint8Array(interruptBuffer);
    } else {
      interruptRef.current = null;
    }

    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const msg = event.data;
      switch (msg.type) {
        case "status":
          setStatus(msg.text);
          break;
        case "ready":
          setPackages(msg.packages);
          setMissing(msg.missing);
          setStatus("Ready");
          setState("ready");
          for (const tool of extrasRef.current) worker.postMessage({ type: "install-tool", tool } satisfies ToWorker);
          break;
        case "installed":
          setPackages((p) => ({ ...p, ...msg.packages }));
          break;
        case "tool":
          setTools((t) => ({ ...t, [msg.tool]: { state: msg.state, version: msg.version, error: msg.error } }));
          break;
        case "formatted":
          pending.current.get(msg.id)?.(msg);
          pending.current.delete(msg.id);
          break;
        case "info":
          sinkRef.current.write(msg.text, "info", msg.target);
          break;
        case "fatal":
          setStatus("Failed to start Python");
          setState("error");
          sinkRef.current.write(`${msg.error}\n`, "stderr", "run");
          break;
        case "stdout":
        case "stderr":
          sinkRef.current.write(msg.text, msg.type, msg.target);
          break;
        case "figure":
          if (pendingRun.current) pendingRun.current.figures++;
          setFigures((f) => [...f, msg.png]);
          break;
        case "done": {
          if (msg.target === "run") {
            sinkRef.current.write(
              `\n[${msg.ok ? "finished" : "failed"} in ${(msg.ms / 1000).toFixed(2)}s]\n`,
              "info",
              "run",
            );
          }
          const run = pendingRun.current;
          pendingRun.current = null;
          setState("ready");
          stateRef.current = "ready";
          if (run?.id === msg.id) {
            run.resolve({ ok: msg.ok, ms: msg.ms, changed: msg.changed, figures: run.figures });
          }
          break;
        }
        case "completions":
          pending.current.get(msg.id)?.(msg.items);
          pending.current.delete(msg.id);
          break;
        case "is-complete":
          pending.current.get(msg.id)?.(msg.status);
          pending.current.delete(msg.id);
          break;
        case "window-open": {
          const { type: _, ...win } = msg;
          // One window at a time: a new one replaces (and frees) the last.
          const old = pyWindowRef.current;
          if (old) worker.postMessage({ type: "window-close", window: old.window } satisfies ToWorker);
          pyWindowRef.current = win;
          setPyWindow(win);
          break;
        }
        case "window-result": {
          const call = windowCalls.current.get(msg.id);
          windowCalls.current.delete(msg.id);
          const reply = JSON.parse(msg.reply) as { result?: unknown; error?: string };
          if (reply.error !== undefined) call?.reject(new Error(reply.error));
          else call?.resolve(reply.result);
          break;
        }
      }
    };
    worker.postMessage({ type: "init", interruptBuffer } satisfies ToWorker);
  }, []);

  useEffect(() => {
    boot();
    return () => workerRef.current?.terminate();
  }, [boot]);

  const execute = useCallback((message: Extract<ToWorker, { type: "run" | "console" }>) => {
    const worker = workerRef.current;
    if (!worker || stateRef.current !== "ready") return Promise.resolve(null);
    setState("running");
    stateRef.current = "running";
    return new Promise<RunResult | null>((resolve) => {
      pendingRun.current = { id: message.id, figures: 0, resolve };
      worker.postMessage(message satisfies ToWorker);
    });
  }, []);

  /** Runs `entry` as a script in a fresh namespace. Resolves null if aborted. */
  const run = useCallback(
    (entry: string, files: ProjectFiles, columns: number) => {
      setFigures([]);
      return execute({ type: "run", id: ++nextId.current, entry, files, columns });
    },
    [execute],
  );

  /** Runs console input in the console's persistent namespace. */
  const runConsole = useCallback(
    (source: string, files: ProjectFiles, columns: number) =>
      execute({ type: "console", id: ++nextId.current, source, files, columns }),
    [execute],
  );

  /** Mirror the project into Python's filesystem (for autocomplete); skipped while busy. */
  const syncProject = useCallback((files: ProjectFiles) => {
    if (stateRef.current !== "ready") return;
    workerRef.current?.postMessage({ type: "sync", files } satisfies ToWorker);
  }, []);

  const resetConsole = useCallback(() => {
    workerRef.current?.postMessage({ type: "console-reset" } satisfies ToWorker);
  }, []);

  const stop = useCallback(() => {
    if (interruptRef.current) {
      interruptRef.current[0] = SIGINT;
    } else {
      sinkRef.current.write("\n[stopped — restarting Python runtime]\n", "info", "run");
      boot();
    }
  }, [boot]);

  function request<T>(message: ToWorker & { id: number }, fallback: T, timeout = REQUEST_TIMEOUT_MS): Promise<T> {
    const worker = workerRef.current;
    if (!worker || stateRef.current !== "ready") return Promise.resolve(fallback);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.current.delete(message.id);
        resolve(fallback);
      }, timeout);
      pending.current.set(message.id, (value) => {
        clearTimeout(timer);
        resolve((value as T) ?? fallback);
      });
      worker.postMessage(message);
    });
  }

  /** Adds an optional package to this session. */
  const installTool = useCallback((tool: string) => {
    workerRef.current?.postMessage({ type: "install-tool", tool } satisfies ToWorker);
  }, []);

  /** Black-formats source. Fails (never throws) if Python is busy, Black is missing or the code has a syntax error. */
  const format = useCallback(
    async (code: string, lineLength: number): Promise<FormatResult> => {
      const reply = await request<Extract<FromWorker, { type: "formatted" }> | null>(
        { type: "format", id: ++nextId.current, code, lineLength },
        null,
        FORMAT_TIMEOUT_MS,
      );
      if (!reply) return { ok: false, error: "Python is busy. Try again when it finishes." };
      return reply.ok ? { ok: true, code: reply.code } : { ok: false, error: reply.error };
    },
    [],
  );

  /** Jedi completions; empty while Python is loading or busy. */
  const complete = useCallback(
    (code: string, line: number, column: number, entry: string) =>
      request<Completion[]>({ type: "complete", id: ++nextId.current, code, line, column, entry }, [], COMPLETION_TIMEOUT_MS),
    [],
  );

  /** Whether console input is a finished statement or needs more lines. */
  const isComplete = useCallback(
    (source: string) => request<Completeness>({ type: "is-complete", id: ++nextId.current, source }, "complete"),
    [],
  );

  /** Calls the open window's Python js_api; queued behind a running script. */
  const callWindow = useCallback((window: number, method: string, args: unknown[]) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("Python isn't running"));
    const id = ++nextId.current;
    return new Promise<unknown>((resolve, reject) => {
      windowCalls.current.set(id, { resolve, reject });
      worker.postMessage({ type: "window-call", id, window, method, args: JSON.stringify(args) } satisfies ToWorker);
    });
  }, []);

  const closeWindow = useCallback(() => {
    const old = pyWindowRef.current;
    if (old) workerRef.current?.postMessage({ type: "window-close", window: old.window } satisfies ToWorker);
    pyWindowRef.current = null;
    setPyWindow(null);
  }, []);

  return {
    state,
    status,
    packages,
    missing,
    tools,
    installTool,
    format,
    figures,
    setFigures,
    pyWindow,
    callWindow,
    closeWindow,
    run,
    runConsole,
    resetConsole,
    syncProject,
    stop,
    complete,
    isComplete,
  };
}

export type Python = ReturnType<typeof usePython>;

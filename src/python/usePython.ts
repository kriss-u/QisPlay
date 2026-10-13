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

const SIGINT = 2;
const REQUEST_TIMEOUT_MS = 4000;

export function usePython(sink: OutputSink) {
  const [state, setState] = useState<RuntimeState>("loading");
  const [status, setStatus] = useState("Starting worker…");
  const [packages, setPackages] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [figures, setFigures] = useState<string[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const interruptRef = useRef<Uint8Array | null>(null);
  const nextId = useRef(0);
  const pendingRun = useRef<{ id: number; figures: number; resolve(r: RunResult | null): void } | null>(null);
  // Small request/response calls (completions, is-complete) keyed by id.
  const pending = useRef(new Map<number, (value: unknown) => void>());
  const stateRef = useRef(state);
  const sinkRef = useRef(sink);
  useEffect(() => {
    sinkRef.current = sink;
  }, [sink]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const boot = useCallback(() => {
    workerRef.current?.terminate();
    pendingRun.current?.resolve(null);
    pendingRun.current = null;
    for (const resolve of pending.current.values()) resolve(undefined);
    pending.current.clear();

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
    (entry: string, files: ProjectFiles) => {
      setFigures([]);
      return execute({ type: "run", id: ++nextId.current, entry, files });
    },
    [execute],
  );

  /** Runs console input in the console's persistent namespace. */
  const runConsole = useCallback(
    (source: string, files: ProjectFiles) => execute({ type: "console", id: ++nextId.current, source, files }),
    [execute],
  );

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

  function request<T>(message: ToWorker & { id: number }, fallback: T): Promise<T> {
    const worker = workerRef.current;
    if (!worker || stateRef.current !== "ready") return Promise.resolve(fallback);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.current.delete(message.id);
        resolve(fallback);
      }, REQUEST_TIMEOUT_MS);
      pending.current.set(message.id, (value) => {
        clearTimeout(timer);
        resolve((value as T) ?? fallback);
      });
      worker.postMessage(message);
    });
  }

  /** Jedi completions; empty while Python is loading or busy. */
  const complete = useCallback(
    (code: string, line: number, column: number, entry: string) =>
      request<Completion[]>({ type: "complete", id: ++nextId.current, code, line, column, entry }, []),
    [],
  );

  /** Whether console input is a finished statement or needs more lines. */
  const isComplete = useCallback(
    (source: string) => request<Completeness>({ type: "is-complete", id: ++nextId.current, source }, "complete"),
    [],
  );

  return {
    state,
    status,
    packages,
    missing,
    figures,
    setFigures,
    run,
    runConsole,
    resetConsole,
    stop,
    complete,
    isComplete,
  };
}

export type Python = ReturnType<typeof usePython>;

// Hosts the Pyodide (CPython -> WebAssembly) runtime off the UI thread.
// The worker only executes project files sent from the editor: there is no
// REPL and stdin is disabled, so the terminal is output-only.
import type { PyodideInterface } from "pyodide";
import type { PyProxy } from "pyodide/ffi";
import type { Completion, FromWorker, ProjectFiles, Target, ToWorker } from "./protocol";
import bootstrap from "./bootstrap.py?raw";

// The app is type-checked against the DOM lib, so describe the worker scope locally.
const ctx = self as unknown as {
  postMessage(msg: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  location: Location;
};

const BASE = import.meta.env.BASE_URL;
const PYODIDE_URL = `${BASE}pyodide/`;
// Must match the installed `pyodide` npm version so the wheel ABI lines up.
const PACKAGE_CDN = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

// Shipped in the Pyodide distribution. libopenblas is the BLAS/LAPACK that the
// qiskit-aer wheel is dynamically linked against.
// jedi powers editor autocompletion.
const PYODIDE_PACKAGES = [
  "micropip",
  "numpy",
  "scipy",
  "matplotlib",
  "sympy",
  "libopenblas",
  "jedi",
];
// Pulled from PyPI by micropip (pure Python, or official wasm wheels).
const PYPI_PACKAGES = [
  "rustworkx",
  "dill",
  "stevedore",
  "typing-extensions",
  "python-dateutil",
  "pylatexenc", // qiskit's matplotlib circuit drawer
];
// Not on PyPI as wasm wheels; provided via public/wheels once compiled.
const LOCAL_PACKAGES = ["qiskit", "qiskit_aer"];

const REPORTED = ["numpy", "scipy", "matplotlib", "sympy", "rustworkx", ...LOCAL_PACKAGES];

let py: PyodideInterface | undefined;
let runner: PyProxy | undefined;
let interrupt: Uint8Array | undefined;
// Output produced right now belongs to a script run or to console input.
let target: Target = "run";

const post = (msg: FromWorker) => ctx.postMessage(msg);
const status = (text: string) => post({ type: "status", text });

function streamTo(type: "stdout" | "stderr") {
  const decoder = new TextDecoder();
  return {
    write(buf: Uint8Array) {
      post({ type, text: decoder.decode(buf, { stream: true }), target });
      return buf.length;
    },
  };
}

async function localWheels(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}wheels/manifest.json`, { cache: "no-cache" });
    if (!res.ok) return [];
    const { wheels } = (await res.json()) as { wheels?: string[] };
    return (wheels ?? []).map((w) => new URL(`${BASE}wheels/${w}`, ctx.location.href).href);
  } catch {
    return [];
  }
}

async function init(buffer?: SharedArrayBuffer) {
  status("Starting Python…");
  const { loadPyodide } = (await import(
    /* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`
  )) as typeof import("pyodide");
  py = await loadPyodide({ indexURL: PYODIDE_URL, packageBaseUrl: PACKAGE_CDN });

  // Package installers print progress; keep it out of the user's output.
  py.setStdout({ batched: () => {} });
  py.setStderr({ batched: () => {} });
  py.setStdin({ error: true });
  if (buffer) {
    interrupt = new Uint8Array(buffer);
    py.setInterruptBuffer(interrupt);
  }

  status("Loading scientific packages…");
  await py.loadPackage(PYODIDE_PACKAGES, { messageCallback: () => {} });

  const micropip = py.pyimport("micropip");
  status("Loading more packages…");
  await micropip.install(PYPI_PACKAGES);

  const wheels = await localWheels();
  if (wheels.length) {
    status("Loading Qiskit…");
    await micropip.install(wheels);
  }
  micropip.destroy();

  py.setStdout(streamTo("stdout"));
  py.setStderr(streamTo("stderr"));

  status("Almost ready…");
  py.FS.mkdirTree("/opt/qisplay");
  py.FS.writeFile("/opt/qisplay/_runner.py", bootstrap);
  py.runPython(`
import sys
sys.path.insert(0, "/opt/qisplay")
import _runner
`);
  runner = py.globals.get("_runner") as PyProxy;
  runner._set_figure_sink((png: string) => post({ type: "figure", png, target }));

  const versions = py.runPython(`
from importlib.metadata import version, PackageNotFoundError
def _v(n):
    try:
        return version(n)
    except PackageNotFoundError:
        return None
{n: _v(n) for n in ${JSON.stringify(REPORTED)}}
`);
  const all = versions.toJs({ dict_converter: Object.fromEntries }) as Record<string, string | null>;
  versions.destroy();
  const packages: Record<string, string> = {
    python: py.runPython("import sys; sys.version.split()[0]"),
  };
  const missing: string[] = [];
  for (const [name, v] of Object.entries(all)) {
    if (v) packages[name] = v;
    else missing.push(name);
  }
  post({ type: "ready", packages, missing });
}

/** Runs a script or console input; both report the files they changed. */
function execute(id: number, kind: Target, call: (files: unknown, dirs: unknown) => PyProxy, files: ProjectFiles) {
  if (!py || !runner) return;
  if (interrupt) interrupt[0] = 0;
  target = kind;
  const started = performance.now();
  let ok = false;
  let changed: Record<string, string | Uint8Array> = {};
  const pyFiles = py.toPy(files.files);
  const pyDirs = py.toPy(files.dirs);
  try {
    const result = call(pyFiles, pyDirs);
    const [okValue, changedProxy] = result.toJs({ depth: 1 });
    ok = okValue;
    changed = changedProxy.toJs({ dict_converter: Object.fromEntries });
    changedProxy.destroy();
    result.destroy();
  } catch (err) {
    post({ type: "stderr", text: `${String(err)}\n`, target });
  } finally {
    pyFiles.destroy();
    pyDirs.destroy();
  }
  post({ type: "done", id, ok, ms: performance.now() - started, changed, target: kind });
}

function complete(id: number, code: string, line: number, column: number, entry: string) {
  let items: Completion[] = [];
  if (runner) {
    try {
      const result = runner._complete(code, line, column, entry);
      items = result.toJs({ dict_converter: Object.fromEntries });
      result.destroy();
    } catch {
      items = [];
    }
  }
  post({ type: "completions", id, items });
}

ctx.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === "init") {
    try {
      await init(msg.interruptBuffer);
    } catch (err) {
      post({ type: "fatal", error: String(err) });
    }
  } else if (msg.type === "run") {
    execute(msg.id, "run", (f, d) => runner!._run(msg.entry, f, d), msg.files);
  } else if (msg.type === "console") {
    execute(msg.id, "console", (f, d) => runner!._console(msg.source, f, d), msg.files);
  } else if (msg.type === "sync") {
    // Keep the project on disk current so autocomplete sees other files' latest code.
    if (py && runner) {
      const f = py.toPy(msg.files.files);
      const d = py.toPy(msg.files.dirs);
      try {
        runner._sync_project(f, d);
      } catch {
        // Best effort; the next run syncs again.
      } finally {
        f.destroy();
        d.destroy();
      }
    }
  } else if (msg.type === "console-reset") {
    runner?._console_reset();
  } else if (msg.type === "is-complete") {
    const status = runner ? (runner._is_complete(msg.source) as "complete" | "incomplete" | "invalid") : "complete";
    post({ type: "is-complete", id: msg.id, status });
  } else if (msg.type === "complete") {
    complete(msg.id, msg.code, msg.line, msg.column, msg.entry);
  }
};
